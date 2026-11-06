const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../src');
const { db } = require('../src/db');
const bcrypt = require('bcryptjs');

chai.use(chaiHttp);
const { expect } = chai;

describe('Manual flashcard creation', () => {
  let agent;
  let userId;
  let otherUserId;
  before(async () => {
    await db.none(require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/init_data/002_card_images.sql'), 'utf8'));
    const suffix = require('node:crypto').randomUUID();
    const hash = await bcrypt.hash('FlashcardPassword123!', 10);
    const user = await db.one(
      'INSERT INTO users(username, email, password_hash) VALUES($1, $2, $3) RETURNING user_id, username',
      [`cards_${suffix}`, `cards_${suffix}@example.test`, hash]
    );
    userId = user.user_id;
    const other = await db.one(
      'INSERT INTO users(username, email, password_hash) VALUES($1, $2, $3) RETURNING user_id',
      [`other_${suffix}`, `other_${suffix}@example.test`, hash]
    );
    otherUserId = other.user_id;
    agent = chai.request.agent(app);
    const login = await agent.post('/login').redirects(0).send({
      username: user.username, password: 'FlashcardPassword123!',
    });
    expect(login).to.have.status(302);
  });
  after(async () => {
    if (agent) agent.close();
    await db.none('DELETE FROM users WHERE user_id IN ($1, $2)', [userId, otherUserId]);
  });

  it('requires login for creation and viewing', async () => {
    for (const path of ['/decks/new', '/decks/1']) {
      const res = await chai.request(app).get(path).redirects(0);
      expect(res).to.have.header('location', '/login');
    }
    const res = await chai.request(app).post('/decks').redirects(0).send({});
    expect(res).to.have.header('location', '/login');
  });

  it('carries modal details into the card editor without saving an empty set', async () => {
    const before = await db.one('SELECT COUNT(*)::int AS count FROM decks WHERE user_id = $1', [userId]);
    const res = await agent.post('/decks/new').type('form').send({
      title: ' Biology & chemistry ', description: ' First semester ',
    });
    expect(res).to.have.status(200);
    expect(res.text).to.include('value="Biology &amp; chemistry"');
    expect(res.text).to.include('First semester</textarea>');
    expect(res.text).to.include('id="card-fields"');
    const after = await db.one('SELECT COUNT(*)::int AS count FROM decks WHERE user_id = $1', [userId]);
    expect(after.count).to.equal(before.count);
    const invalid = await agent.post('/decks/new').type('form').send({ title: '   ' });
    expect(invalid).to.have.status(400);
  });

  it('saves form-encoded cards in order and lists the set on Home', async () => {
    const res = await agent.post('/decks').redirects(0).type('form').send({
      title: ' Biology ', description: ' Cell basics ',
      'cards[0][question]': ' Nucleus? ', 'cards[0][answer]': 'Contains DNA',
      'cards[1][question]': '<script>alert(1)</script>', 'cards[1][answer]': 'Second answer',
    });
    expect(res).to.have.status(302);
    const id = Number(res.headers.location.split('/').pop());
    const deck = await db.one('SELECT * FROM decks WHERE deck_id = $1', [id]);
    expect(deck.user_id).to.equal(userId);
    expect(deck.title).to.equal('Biology');
    const cards = await db.any('SELECT question, answer FROM flashcards WHERE deck_id = $1 ORDER BY card_id', [id]);
    expect(cards.map(card => card.question)).to.deep.equal(['Nucleus?', '<script>alert(1)</script>']);
    const view = await agent.get(res.headers.location);
    expect(view).to.have.status(200);
    expect(view.text).to.include('&lt;script&gt;');
    expect(view.text).not.to.include('<script>alert(1)</script>');
    const home = await agent.get('/home');
    expect(home.text).to.include(`/decks/${id}`);
    expect(home.text).to.include('2 cards');
  });

  it('saves image fronts and serves bytes only to their owner', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const res = await agent.post('/decks').redirects(0).send({
      title: 'Image set', cards: [{ frontType: 'image', image: `data:image/png;base64,${png}`,
        question: '<script>alert(1)</script>', answer: 'A pixel' }],
    });
    expect(res).to.have.status(302);
    const id = Number(res.headers.location.split('/').pop());
    const card = await db.one('SELECT card_id, image_type FROM flashcards WHERE deck_id = $1', [id]);
    expect(card.image_type).to.equal('image/png');
    const image = await agent.get(`/decks/${id}/cards/${card.card_id}/image`);
    expect(image).to.have.status(200);
    expect(image.headers['content-type']).to.include('image/png');
    expect(image.headers['x-content-type-options']).to.equal('nosniff');
    expect(Buffer.compare(image.body, Buffer.from(png, 'base64'))).to.equal(0);
    const view = await agent.get(res.headers.location);
    expect(view.text).to.include('&lt;script&gt;');
    expect(view.text).not.to.include('<script>alert(1)</script>');
    const other = await db.one('INSERT INTO decks(user_id, title) VALUES($1, $2) RETURNING deck_id', [otherUserId, 'Other']);
    await db.none('UPDATE decks SET user_id = $1 WHERE deck_id = $2', [otherUserId, id]);
    expect(await agent.get(`/decks/${id}/cards/${card.card_id}/image`)).to.have.status(404);
    expect(await agent.get(`/decks/${other.deck_id}/cards/${card.card_id}/image`)).to.have.status(404);
  });

  it('preserves mixed front types and displays image + text prompts safely', async () => {
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const res = await agent.post('/decks').redirects(0).send({
      title: 'Mixed cards', cards: [
        { frontType: 'text', question: 'Text question', answer: 'Text answer' },
        { frontType: 'image', image, question: 'Image description only', answer: 'Image answer' },
        { frontType: 'image-text', image, question: '<img src=x onerror=alert(1)> Identify this', answer: 'Combined answer' },
      ],
    });
    expect(res).to.have.status(302);
    const id = Number(res.headers.location.split('/').pop());
    const cards = await db.any('SELECT front_type FROM flashcards WHERE deck_id = $1 ORDER BY card_id', [id]);
    expect(cards.map(card => card.front_type)).to.deep.equal(['text', 'image', 'image-text']);
    const view = await agent.get(res.headers.location);
    expect(view.text).to.include(`<p class="card-text">${require('handlebars').escapeExpression('<img src=x onerror=alert(1)> Identify this')}</p>`);
    expect(view.text).not.to.include('<img src=x onerror=alert(1)>');
    expect(view.text).not.to.include('<p class="card-text">Image description only</p>');
    expect(view.text).to.include('<p class="card-text">Text question</p>');
    const invalid = await agent.post('/decks').send({
      title: 'Incomplete', cards: [{ frontType: 'image-text', image, question: 'Keep prompt', answer: '' }],
    });
    expect(invalid).to.have.status(400);
    expect(invalid.text).to.include('value="image-text" selected');
    expect(invalid.text).to.include('Keep prompt</textarea>');
    const missing = await agent.post('/decks').send({
      title: 'Missing prompt', cards: [{ frontType: 'image-text', image, question: ' ', answer: 'Answer' }],
    });
    expect(missing).to.have.status(400);
  });

  it('saves distinct images on both sides and protects the back image', async () => {
    const front = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const back = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const card = { frontType: 'image-both', image: front, backImage: back,
      question: 'Front diagram', answer: '<script>alert(1)</script>' };
    const res = await agent.post('/decks').redirects(0).send({ title: 'Both sides', cards: [card] });
    expect(res).to.have.status(302);
    const id = Number(res.headers.location.split('/').pop());
    const stored = await db.one('SELECT card_id, front_type FROM flashcards WHERE deck_id = $1', [id]);
    expect(stored.front_type).to.equal('image-both');
    for (const [route, data] of [['image', front], ['back-image', back]]) {
      const image = await agent.get(`/decks/${id}/cards/${stored.card_id}/${route}`);
      expect(image).to.have.status(200);
      expect(image.headers['content-type']).to.include('image/png');
      expect(image.headers['x-content-type-options']).to.equal('nosniff');
      expect(Buffer.compare(image.body, Buffer.from(data.split(',')[1], 'base64'))).to.equal(0);
    }
    const view = await agent.get(res.headers.location);
    expect(view.text).to.include(`/cards/${stored.card_id}/back-image`);
    expect(view.text).to.include('alt="&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(view.text).to.include('<p class="card-text">Front diagram</p>');
    expect(view.text).to.include('<p class="card-text">&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(view.text).not.to.include('<script>alert(1)</script>');
    const incomplete = await agent.post('/decks').send({ title: 'Incomplete', cards: [{ ...card, answer: '' }] });
    expect(incomplete).to.have.status(400);
    expect(incomplete.text).to.include('value="image-both" selected');
    expect(incomplete.text).to.include(`value="${require('handlebars').escapeExpression(back)}"`);
    await db.none('UPDATE decks SET user_id = $1 WHERE deck_id = $2', [otherUserId, id]);
    expect(await agent.get(`/decks/${id}/cards/${stored.card_id}/back-image`)).to.have.status(404);
    expect(await chai.request(app).get(`/decks/${id}/cards/${stored.card_id}/back-image`).redirects(0))
      .to.have.header('location', '/login');
  });

  it('rejects missing, oversized, and script-bearing back images without saving a deck', async () => {
    const front = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const payload = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
    const before = await db.one('SELECT COUNT(*)::int AS count FROM decks WHERE user_id = $1', [userId]);
    for (const backImage of ['', 'javascript:alert(1)', `data:image/svg+xml;base64,${payload}`,
      `data:image/png;base64,${payload}`, `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`]) {
      const res = await agent.post('/decks').send({ title: 'Invalid back', cards: [{
        frontType: 'image-both', image: front, backImage, question: 'Front', answer: 'Back description',
      }] });
      expect(res).to.have.status(400);
      expect(res.text).not.to.include('src="javascript:');
      expect(res.text).not.to.include('src="data:image/svg');
    }
    const after = await db.one('SELECT COUNT(*)::int AS count FROM decks WHERE user_id = $1', [userId]);
    expect(after.count).to.equal(before.count);
  });

  it('rejects script-bearing formats, spoofed MIME types, missing and oversized images', async () => {
    const payload = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
    const before = await db.one('SELECT COUNT(*)::int AS count FROM decks WHERE user_id = $1', [userId]);
    for (const image of [`data:image/svg+xml;base64,${payload}`, `data:image/png;base64,${payload}`,
      'javascript:alert(1)', '', `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`]) {
      const res = await agent.post('/decks').send({ title: 'Unsafe image', cards: [
        { frontType: 'image', image, question: 'Diagram', answer: 'Answer' },
      ] });
      expect(res).to.have.status(400);
      expect(res.text).not.to.include('src="javascript:');
      expect(res.text).not.to.include('src="data:image/svg');
    }
    const after = await db.one('SELECT COUNT(*)::int AS count FROM decks WHERE user_id = $1', [userId]);
    expect(after.count).to.equal(before.count);
  });

  it('rejects invalid input without saving a partial set and preserves entered text', async () => {
    const before = await db.one('SELECT COUNT(*)::int AS count FROM decks WHERE user_id = $1', [userId]);
    for (const body of [
      { title: 'Keep my title', cards: [{ question: 'Keep my question', answer: '  ' }] },
      { title: ' ', cards: [{ question: 'Question', answer: 'Answer' }] },
      { title: 'a'.repeat(101), cards: [{ question: 'Question', answer: 'Answer' }] },
      { title: 'No cards' },
      { title: 'Malformed', cards: [null] },
      { title: 'Too many', cards: Array.from({ length: 101 }, () => ({ question: 'Q', answer: 'A' })) },
    ]) {
      const res = await agent.post('/decks').send(body);
      expect(res).to.have.status(400);
      if (body.title === 'Keep my title') {
        expect(res.text).to.include('Keep my title');
        expect(res.text).to.include('Keep my question');
      }
    }
    const after = await db.one('SELECT COUNT(*)::int AS count FROM decks WHERE user_id = $1', [userId]);
    expect(after.count).to.equal(before.count);
  });

  async function managementToken(path) {
    const res = await agent.get(path);
    expect(res).to.have.status(200);
    return /name="csrfToken" value="([a-f0-9]+)"/.exec(res.text)[1];
  }

  async function makeManagedSet(owner = userId) {
    const deck = await db.one('INSERT INTO decks(user_id, title, description) VALUES($1, $2, $3) RETURNING deck_id',
      [owner, 'Manage me', 'Original description']);
    const card = await db.one('INSERT INTO flashcards(deck_id, question, answer) VALUES($1, $2, $3) RETURNING card_id',
      [deck.deck_id, 'Original front', 'Original back']);
    return { ...deck, ...card };
  }

  it('edits a set while keeping existing card progress and removing omitted cards', async () => {
    const { deck_id, card_id } = await makeManagedSet();
    const removed = await db.one('INSERT INTO flashcards(deck_id, question, answer) VALUES($1, $2, $3) RETURNING card_id',
      [deck_id, 'Remove this', 'Old answer']);
    await db.none('INSERT INTO user_card_progress(user_id, card_id, times_reviewed) VALUES($1, $2, 3)', [userId, card_id]);
    const csrfToken = await managementToken(`/decks/${deck_id}/edit`);
    const res = await agent.post(`/decks/${deck_id}/edit`).redirects(0).type('form').send({
      csrfToken, title: 'Edited title', description: 'Edited description',
      'cards[0][card_id]': String(card_id), 'cards[0][question]': 'Edited front', 'cards[0][answer]': 'Edited answer',
      'cards[1][question]': 'New front', 'cards[1][answer]': 'New answer',
    });
    expect(res).to.have.header('location', `/decks/${deck_id}`);
    const deck = await db.one('SELECT title, description FROM decks WHERE deck_id = $1', [deck_id]);
    expect(deck).to.deep.equal({ title: 'Edited title', description: 'Edited description' });
    const cards = await db.any('SELECT card_id, question FROM flashcards WHERE deck_id = $1 ORDER BY card_id', [deck_id]);
    expect(cards).to.have.lengthOf(2);
    expect(cards[0]).to.deep.equal({ card_id, question: 'Edited front' });
    expect(cards[1].question).to.equal('New front');
    expect(await db.oneOrNone('SELECT card_id FROM flashcards WHERE card_id = $1', [removed.card_id])).to.equal(null);
    expect((await db.one('SELECT times_reviewed FROM user_card_progress WHERE card_id = $1', [card_id])).times_reviewed).to.equal(3);
  });

  it('preserves image fronts and backs when reopening and saving an existing set', async () => {
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const created = await agent.post('/decks').redirects(0).send({ title: 'Editable images', cards: [
      { frontType: 'image-both', image, backImage: image, question: 'Front', answer: 'Back' },
    ] });
    const id = Number(created.headers.location.split('/').pop());
    const card = await db.one('SELECT card_id FROM flashcards WHERE deck_id = $1', [id]);
    const edit = await agent.get(`/decks/${id}/edit`);
    expect(edit.text).to.include('value="image-both" selected');
    expect(edit.text).to.include(`value="${require('handlebars').escapeExpression(image)}"`);
    const csrfToken = await managementToken(`/decks/${id}/edit`);
    const res = await agent.post(`/decks/${id}/edit`).redirects(0).send({ csrfToken, title: 'Images renamed', cards: [
      { card_id: String(card.card_id), frontType: 'image-both', image, backImage: image, question: 'Changed', answer: 'Back' },
    ] });
    expect(res).to.have.status(302);
    const saved = await db.one('SELECT image_data, back_image_data FROM flashcards WHERE card_id = $1', [card.card_id]);
    expect(saved.image_data.equals(saved.back_image_data)).to.equal(true);
    expect(saved.image_data.equals(Buffer.from(image.split(',')[1], 'base64'))).to.equal(true);
  });

  it('renames sets without changing their cards and validates names', async () => {
    const { deck_id, card_id } = await makeManagedSet();
    const csrfToken = await managementToken(`/decks/${deck_id}/rename`);
    const invalid = await agent.post(`/decks/${deck_id}/rename`).send({ csrfToken, title: '  ' });
    expect(invalid).to.have.status(400);
    const renamed = await agent.post(`/decks/${deck_id}/rename`).redirects(0).send({ csrfToken, title: ' New name ' });
    expect(renamed).to.have.status(302);
    expect((await db.one('SELECT title FROM decks WHERE deck_id = $1', [deck_id])).title).to.equal('New name');
    expect((await db.one('SELECT question FROM flashcards WHERE card_id = $1', [card_id])).question).to.equal('Original front');
  });

  it('requires confirmation before deleting and cascades card and progress removal', async () => {
    const { deck_id, card_id } = await makeManagedSet();
    await db.none('INSERT INTO user_card_progress(user_id, card_id) VALUES($1, $2)', [userId, card_id]);
    const csrfToken = await managementToken(`/decks/${deck_id}/delete`);
    expect(await db.oneOrNone('SELECT deck_id FROM decks WHERE deck_id = $1', [deck_id])).not.to.equal(null);
    const res = await agent.post(`/decks/${deck_id}/delete`).redirects(0).send({ csrfToken });
    expect(res).to.have.header('location', '/home');
    expect(await db.oneOrNone('SELECT deck_id FROM decks WHERE deck_id = $1', [deck_id])).to.equal(null);
    expect(await db.oneOrNone('SELECT card_id FROM flashcards WHERE card_id = $1', [card_id])).to.equal(null);
    expect(await db.oneOrNone('SELECT card_id FROM user_card_progress WHERE card_id = $1', [card_id])).to.equal(null);
  });

  it('blocks unauthorized changes, forged forms, and cards belonging to another set', async () => {
    const own = await makeManagedSet();
    const other = await makeManagedSet(otherUserId);
    const csrfToken = await managementToken(`/decks/${own.deck_id}/edit`);
    for (const action of ['edit', 'rename', 'delete']) {
      expect(await agent.get(`/decks/${other.deck_id}/${action}`)).to.have.status(404);
      expect(await agent.post(`/decks/${other.deck_id}/${action}`).send({ csrfToken })).to.have.status(404);
      expect(await agent.post(`/decks/${own.deck_id}/${action}`).send({})).to.have.status(403);
      const anonymous = await chai.request(app).post(`/decks/${own.deck_id}/${action}`).redirects(0).send({});
      expect(anonymous).to.have.header('location', '/login');
    }
    for (const cards of [
      [{ card_id: String(other.card_id), question: 'Stolen', answer: 'Bad' }],
      [{ card_id: String(own.card_id), question: 'Duplicate', answer: 'Bad' }, { card_id: String(own.card_id), question: 'Duplicate', answer: 'Bad' }],
      [{ card_id: String(own.card_id), question: '', answer: 'Bad' }],
    ]) {
      const res = await agent.post(`/decks/${own.deck_id}/edit`).send({ csrfToken, title: 'Should not save', cards });
      expect(res).to.have.status(400);
    }
    expect((await db.one('SELECT title FROM decks WHERE deck_id = $1', [own.deck_id])).title).to.equal('Manage me');
    expect((await db.one('SELECT question FROM flashcards WHERE card_id = $1', [own.card_id])).question).to.equal('Original front');
  });

  it('does not expose another user’s sets', async () => {
    const deck = await db.one(
      'INSERT INTO decks(user_id, title) VALUES($1, $2) RETURNING deck_id', [otherUserId, 'Private set']
    );
    const res = await agent.get(`/decks/${deck.deck_id}`);
    expect(res).to.have.status(404);
    const home = await agent.get('/home');
    expect(home.text).not.to.include('Private set');
    const invalid = await agent.get('/decks/999999999999999999999');
    expect(invalid).to.have.status(404);
  });
});
