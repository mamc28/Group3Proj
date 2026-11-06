const router = require('express').Router();
const { db } = require('./db');

router.get('/new', (req, res) => {
  res.render('pages/create-set', { cards: [{}] });
});

// Carry the details into the editor without saving an empty deck.
router.post('/new', (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const invalid = !title || title.length > 100;
  return res.status(invalid ? 400 : 200).render('pages/create-set', {
    title, description, cards: [{}], error: invalid,
    message: invalid ? 'Enter a name up to 100 characters.' : undefined,
  });
});

router.post('/', async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const input = req.body.cards;
  const cards = Array.isArray(input) ? input.map(card => ({
    question: typeof card?.question === 'string' ? card.question.trim() : '',
    answer: typeof card?.answer === 'string' ? card.answer.trim() : '',
  })) : [];
  const form = { title, description, cards: cards.length ? cards : [{}] };
  if (!title || title.length > 100 || !cards.length || cards.length > 100 ||
      cards.some(card => !card.question || !card.answer)) {
    return res.status(400).render('pages/create-set', {
      ...form, error: true,
      message: 'Enter a title (up to 100 characters) and both sides of 1–100 cards.',
    });
  }
  try {
    const deck = await db.tx(async transaction => {
      const created = await transaction.one(
        'INSERT INTO decks(user_id, title, description) VALUES($1, $2, $3) RETURNING deck_id',
        [req.session.user.user_id, title, description]
      );
      // Insert sequentially so card_id preserves the submitted order.
      for (const card of cards) {
        await transaction.none(
          'INSERT INTO flashcards(deck_id, question, answer) VALUES($1, $2, $3)',
          [created.deck_id, card.question, card.answer]
        );
      }
      return created;
    });
    return res.redirect(`/decks/${deck.deck_id}`);
  } catch (error) {
    console.error('Unable to create set:', error.code);
    return res.status(500).render('pages/create-set', {
      ...form, error: true, message: 'Unable to save your set. Please try again.',
    });
  }
});

router.get('/:id', async (req, res) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
    return res.status(404).send('Set not found.');
  }
  try {
    const deck = await db.oneOrNone(
      'SELECT deck_id, title, description FROM decks WHERE deck_id = $1 AND user_id = $2',
      [req.params.id, req.session.user.user_id]
    );
    if (!deck) return res.status(404).send('Set not found.');
    const cards = await db.any(
      'SELECT question, answer FROM flashcards WHERE deck_id = $1 ORDER BY card_id', [deck.deck_id]
    );
    return res.render('pages/set', { ...deck, cards });
  } catch (error) {
    console.error('Unable to load set:', error.code);
    return res.status(500).send('Unable to load your set. Please try again.');
  }
});

module.exports = router;
