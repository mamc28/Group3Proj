const router = require('express').Router();
const { db } = require('./db');
const { parseCardImage } = require('./cardImage');
const { randomBytes, timingSafeEqual } = require('node:crypto');

// A session token protects existing sets from cross-site form submissions.
router.use((req, res, next) => {
  if (!req.session.deckCsrf) req.session.deckCsrf = randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.deckCsrf;
  if (req.method === 'POST' && /^\/[^/]+\/(edit|rename|delete)$/.test(req.path)) {
    const token = typeof req.body.csrfToken === 'string' ? req.body.csrfToken : '';
    const expected = Buffer.from(req.session.deckCsrf);
    const submitted = Buffer.from(token);
    if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
      return res.status(403).send('Your form has expired. Reload the page and try again.');
    }
  }
  next();
});

router.param('id', (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) return res.status(404).send('Set not found.');
  next();
});

router.get('/new', (req, res) => {
  res.render('pages/create-set', { cards: [{}] }); // Creates an array containing one empty object (one blank card)
});

// Carry the details into the editor without saving an empty deck.
router.post('/new', (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''; // If title is string, remove whitespace, if not use empty string
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const invalid = !title || title.length > 100;
  return res.status(invalid ? 400 : 200).render('pages/create-set', { // This confirms if the set was made or not, and if not, it will return an error message
    title, description, cards: [{}], error: invalid,
    message: invalid ? 'Enter a name up to 100 characters.' : undefined,
  });
});

router.post(['/', '/:id/edit'], async (req, res) => { // Handles save set requests, and returns an error if the set is invalid or if the database fails to save it.
  const isEditing = Boolean(req.params.id);
  if (isEditing) {
    try {
      const owned = await db.oneOrNone('SELECT deck_id FROM decks WHERE deck_id = $1 AND user_id = $2',
        [req.params.id, req.session.user.user_id]);
      if (!owned) return res.status(404).send('Set not found.');
    } catch (error) {
      console.error('Unable to check set ownership:', error.code);
      return res.status(500).send('Unable to load your set. Please try again.');
    }
  }
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const input = req.body.cards;
  const cards = Array.isArray(input) ? input.map(card => ({
    card_id: typeof card?.card_id === 'string' && /^[1-9]\d*$/.test(card.card_id) && Number(card.card_id) <= 2147483647 ? Number(card.card_id) : null,
    question: typeof card?.question === 'string' ? card.question.trim() : '',
    answer: typeof card?.answer === 'string' ? card.answer.trim() : '',
    frontType: card?.frontType === undefined ? 'text' : card.frontType,
    isImage: card?.frontType === 'image' || card?.frontType === 'image-text' || card?.frontType === 'image-both',
    isImageOnly: card?.frontType === 'image',
    isImageText: card?.frontType === 'image-text',
    isImageBoth: card?.frontType === 'image-both',
    backImage: typeof card?.backImage === 'string' ? card.backImage : '',
    image: typeof card?.image === 'string' ? card.image : '',
  })) : [];
  let imageError;
  function validateImage(card, field, required) {
    if (!required) { card[field] = ''; return null; }
    try { return parseCardImage(card[field]); }
    catch (error) { card[field] = ''; imageError = error.message; return null; }
  }
  const images = cards.map(card => ({
    front: validateImage(card, 'image', card.isImage),
    back: validateImage(card, 'backImage', card.isImageBoth),
  }));
  const form = { title, description, cards: cards.length ? cards : [{}], isEditing, deck_id: req.params.id };
  if (!title || title.length > 100 || !cards.length || cards.length > 100 ||
      cards.some(card => !['text', 'image', 'image-text', 'image-both'].includes(card.frontType) || !card.question || !card.answer)) {
    return res.status(400).render('pages/create-set', {
      ...form, error: true,
      message: 'Enter a title (up to 100 characters) and both sides of 1–100 cards.',
    });
  }
  if (imageError) {
    return res.status(400).render('pages/create-set', { ...form, error: true, message: imageError });
  }
  try {
    const deck = await db.tx(async transaction => {
      let created;
      if (isEditing) {
        created = await transaction.oneOrNone(
          'SELECT deck_id FROM decks WHERE deck_id = $1 AND user_id = $2 FOR UPDATE',
          [req.params.id, req.session.user.user_id]
        );
        if (!created) throw Object.assign(new Error('Set not found.'), { status: 404 });
        const existing = await transaction.any('SELECT card_id FROM flashcards WHERE deck_id = $1', [created.deck_id]);
        const ownedIds = new Set(existing.map(card => card.card_id));
        const submittedIds = cards.filter(card => card.card_id).map(card => card.card_id);
        if (submittedIds.some(id => !ownedIds.has(id)) || new Set(submittedIds).size !== submittedIds.length) {
          throw Object.assign(new Error('Invalid card selection.'), { status: 400 });
        }
        await transaction.none('UPDATE decks SET title = $1, description = $2 WHERE deck_id = $3',
          [title, description, created.deck_id]);
        for (const card of existing) {
          if (!submittedIds.includes(card.card_id)) {
            await transaction.none('DELETE FROM flashcards WHERE card_id = $1 AND deck_id = $2', [card.card_id, created.deck_id]);
          }
        }
      } else {
        created = await transaction.one(
          'INSERT INTO decks(user_id, title, description) VALUES($1, $2, $3) RETURNING deck_id',
          [req.session.user.user_id, title, description]
        );
      }
      // Insert sequentially so card_id preserves the submitted order.
      for (const [index, card] of cards.entries()) {
        const values = [created.deck_id, card.question, card.answer, images[index].front?.data || null,
          images[index].front?.type || null, card.frontType, images[index].back?.data || null, images[index].back?.type || null];
        if (isEditing && card.card_id) {
          await transaction.none(
            `UPDATE flashcards SET question = $2, answer = $3, image_data = $4, image_type = $5,
             front_type = $6, back_image_data = $7, back_image_type = $8 WHERE deck_id = $1 AND card_id = $9`,
            [...values, card.card_id]
          );
        } else {
          await transaction.none(
            'INSERT INTO flashcards(deck_id, question, answer, image_data, image_type, front_type, back_image_data, back_image_type) VALUES($1, $2, $3, $4, $5, $6, $7, $8)', values
          );
        }
      }
      return created;
    });
    return res.redirect(`/decks/${deck.deck_id}`);
  } catch (error) {
    if (error.status === 404) return res.status(404).send('Set not found.');
    if (error.status === 400) return res.status(400).render('pages/create-set', { ...form, error: true, message: error.message });
    console.error('Unable to save set:', error.code);
    return res.status(500).render('pages/create-set', {
      ...form, error: true, message: 'Unable to save your set. Please try again.',
    });
  }
});

router.get('/:id/edit', async (req, res) => {
  try {
    const deck = await db.oneOrNone('SELECT deck_id, title, description FROM decks WHERE deck_id = $1 AND user_id = $2',
      [req.params.id, req.session.user.user_id]);
    if (!deck) return res.status(404).send('Set not found.');
    const rows = await db.any('SELECT * FROM flashcards WHERE deck_id = $1 ORDER BY card_id', [deck.deck_id]);
    const cards = rows.map(card => ({
      ...card,
      isImage: card.front_type !== 'text', isImageOnly: card.front_type === 'image',
      isImageText: card.front_type === 'image-text', isImageBoth: card.front_type === 'image-both',
      image: card.image_data ? `data:${card.image_type};base64,${card.image_data.toString('base64')}` : '',
      backImage: card.back_image_data ? `data:${card.back_image_type};base64,${card.back_image_data.toString('base64')}` : '',
    }));
    res.set('Cache-Control', 'private, no-store');
    return res.render('pages/create-set', { ...deck, cards: cards.length ? cards : [{}], isEditing: true });
  } catch (error) {
    console.error('Unable to open editor:', error.code);
    return res.status(500).send('Unable to load your set. Please try again.');
  }
});

router.get(['/:id/rename', '/:id/delete'], async (req, res) => {
  try {
    const deck = await db.oneOrNone('SELECT deck_id, title FROM decks WHERE deck_id = $1 AND user_id = $2',
      [req.params.id, req.session.user.user_id]);
    if (!deck) return res.status(404).send('Set not found.');
    return res.render('pages/manage-set', { ...deck, isDelete: req.path.endsWith('/delete') });
  } catch (error) {
    console.error('Unable to load set settings:', error.code);
    return res.status(500).send('Unable to load your set. Please try again.');
  }
});

router.post('/:id/rename', async (req, res) => {
  try {
    const deck = await db.oneOrNone('SELECT deck_id, title FROM decks WHERE deck_id = $1 AND user_id = $2',
      [req.params.id, req.session.user.user_id]);
    if (!deck) return res.status(404).send('Set not found.');
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 100) {
      return res.status(400).render('pages/manage-set', { ...deck, title, error: true, message: 'Enter a name up to 100 characters.' });
    }
    const updated = await db.oneOrNone('UPDATE decks SET title = $1 WHERE deck_id = $2 AND user_id = $3 RETURNING deck_id',
      [title, deck.deck_id, req.session.user.user_id]);
    if (!updated) return res.status(404).send('Set not found.');
    return res.redirect(`/decks/${deck.deck_id}`);
  } catch (error) {
    console.error('Unable to rename set:', error.code);
    return res.status(500).send('Unable to rename your set. Please try again.');
  }
});

router.post('/:id/delete', async (req, res) => {
  try {
    const deck = await db.oneOrNone('DELETE FROM decks WHERE deck_id = $1 AND user_id = $2 RETURNING deck_id',
      [req.params.id, req.session.user.user_id]);
    if (!deck) return res.status(404).send('Set not found.');
    return res.redirect('/home');
  } catch (error) {
    console.error('Unable to delete set:', error.code);
    return res.status(500).send('Unable to delete your set. Please try again.');
  }
});

router.get(['/:id/cards/:cardId/image', '/:id/cards/:cardId/back-image'], async (req, res) => {
  const ids = [req.params.id, req.params.cardId];
  if (ids.some(id => !/^[1-9]\d*$/.test(id) || Number(id) > 2147483647)) {
    return res.status(404).send('Image not found.');
  }
  const back = req.path.endsWith('/back-image');
  try {
    const card = await db.oneOrNone(
      back ?
        `SELECT f.back_image_data AS image_data, f.back_image_type AS image_type
         FROM flashcards f JOIN decks d ON d.deck_id = f.deck_id
         WHERE d.deck_id = $1 AND f.card_id = $2 AND d.user_id = $3 AND f.back_image_data IS NOT NULL` :
        `SELECT f.image_data, f.image_type FROM flashcards f JOIN decks d ON d.deck_id = f.deck_id
         WHERE d.deck_id = $1 AND f.card_id = $2 AND d.user_id = $3 AND f.image_data IS NOT NULL`,
      [req.params.id, req.params.cardId, req.session.user.user_id]
    );
    if (!card) return res.status(404).send('Image not found.');
    res.set({ 'Content-Type': card.image_type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    return res.send(card.image_data);
  } catch (error) {
    console.error('Unable to load image:', error.code);
    return res.status(500).send('Unable to load image.');
  }
});

router.use('/:id/study', require('./studyRoutes'));

router.get('/:id', async (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) { //Postgres max int value, make sure it doest exceed that
    return res.status(404).send('Set not found.');
  }
  try {
    const deck = await db.oneOrNone(
      'SELECT deck_id, title, description FROM decks WHERE deck_id = $1 AND user_id = $2',
      [req.params.id, req.session.user.user_id]
    );
    if (!deck) return res.status(404).send('Set not found.');
    const cards = await db.any(
      'SELECT card_id, question, answer, image_type, back_image_type, front_type IN (\'image-text\', \'image-both\') AS "showFrontText" FROM flashcards WHERE deck_id = $1 ORDER BY card_id', [deck.deck_id]
    );
    return res.render('pages/set', { ...deck, cards });
  } catch (error) {
    console.error('Unable to load set:', error.code);
    return res.status(500).send('Unable to load your set. Please try again.');
  }
});

module.exports = router;
