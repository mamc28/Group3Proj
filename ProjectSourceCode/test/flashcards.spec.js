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
