const { expect } = require('chai');
const chai = require('chai');
const chaiHttp = require('chai-http');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const app = require('../src');
const { db } = require('../src/db');
const { loadProgress } = require('../src/progressData');
chai.use(chaiHttp);

describe('Study progress page', () => {
  let agent;
  let userId;
  let otherId;
  before(async () => {
    await db.none(readFileSync(join(__dirname, '../src/init_data/003_card_reviews.sql'), 'utf8'));
    const suffix = randomUUID();
    const password = 'ProgressPassword123!';
    const hash = await bcrypt.hash(password, 10);
    const user = await db.one(
      'INSERT INTO users(username, email, password_hash, timezone) VALUES($1, $2, $3, $4) RETURNING user_id, username',
      [`progress_${suffix}`, `progress_${suffix}@example.test`, hash, 'America/Denver']);
    userId = user.user_id;
    const other = await db.one('INSERT INTO users(username, email, password_hash) VALUES($1, $2, $3) RETURNING user_id',
      [`private_${suffix}`, `private_${suffix}@example.test`, hash]);
    otherId = other.user_id;
    agent = chai.request.agent(app);
    expect(await agent.post('/login').redirects(0).send({ username: user.username, password })).to.have.status(302);
  });
  afterEach(async () => { await db.none('DELETE FROM decks WHERE user_id IN ($1, $2)', [userId, otherId]); });
  after(async () => {
    if (agent) agent.close();
    await db.none('DELETE FROM users WHERE user_id IN ($1, $2)', [userId, otherId]);
  });

  async function deck(owner = userId, title = 'Progress deck') {
    return db.one('INSERT INTO decks(user_id, title) VALUES($1, $2) RETURNING deck_id', [owner, title]);
  }
  async function card(deckId) {
    return db.one('INSERT INTO flashcards(deck_id, question, answer) VALUES($1, $2, $3) RETURNING card_id', [deckId, 'Question', 'Answer']);
  }

  it('requires authentication and renders an honest empty state without NaN or percentages', async () => {
    expect(await chai.request(app).get('/progress').redirects(0)).to.have.header('location', '/login');
    const result = await loadProgress(userId);
    expect(result.totals).to.deep.equal({ total: 0, studied: 0, ready: 0, new: 0 });
    expect(result.activity).to.have.lengthOf(14);
    expect(result.activity.every(day => day.reviews === 0 && day.barHeight === 0)).to.equal(true);
    expect(result.recallPercent).to.equal(null);
    const res = await agent.get('/progress');
    expect(res).to.have.status(200);
    expect(res.headers['cache-control']).to.equal('private, no-store');
    expect(res.text).to.include('Create your first set');
    const dom = new JSDOM(res.text);
    const doc = dom.window.document;
    expect(doc.querySelector('#recall-percent').textContent).to.equal('—');
    expect(doc.querySelector('[aria-current="page"]').getAttribute('href')).to.equal('/progress');
    expect(doc.querySelectorAll('.progress-table tbody tr')).to.have.lengthOf(14);
    dom.window.close();
  });

  it('uses the same navigation order and active page on authenticated views', async () => {
    const paths = ['/home', '/decks/new', '/progress', '/friends', '/exams'];
    const expected = ['Home', 'Content (coming soon)', 'Progress', 'Friends', 'Exams'];
    for (const [index, path] of paths.entries()) {
      const res = await agent.get(path);
      expect(res).to.have.status(200);
      const dom = new JSDOM(res.text);
      const doc = dom.window.document;
      const items = [...doc.querySelectorAll('.navigation-list .navigation-item')];
      expect(items.map(item => item.textContent.trim())).to.deep.equal(expected);
      expect(items.filter(item => item.classList.contains('navigation-active'))
        .map(item => item.textContent.trim())).to.deep.equal([expected[index]]);
      dom.window.close();
    }
  });

  it('counts new/due/studied cards and reviews in the account timezone and excludes other accounts', async () => {
    const own = await deck(userId, '<script>bad()</script>');
    const empty = await deck(userId, 'Empty set');
    const fresh = await card(own.deck_id);
    const due = await card(own.deck_id);
    const future = await card(own.deck_id);
    await db.none(
      `INSERT INTO user_card_progress(user_id, card_id, times_reviewed, last_reviewed_at, next_review_at)
       VALUES($1, $2, 1, CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '1 hour'),
             ($1, $3, 1, CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '4 days')`,
      [userId, due.card_id, future.card_id]);
    await db.none(
      `INSERT INTO card_reviews(request_id, user_id, card_id, rating, reviewed_at, next_review_at)
       VALUES($1, $4, $5, 'good', ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Denver')::date)::timestamp AT TIME ZONE 'America/Denver', CURRENT_TIMESTAMP),
             ($2, $4, $5, 'again', (((CURRENT_TIMESTAMP AT TIME ZONE 'America/Denver')::date)::timestamp AT TIME ZONE 'America/Denver') - INTERVAL '30 minutes', CURRENT_TIMESTAMP),
             ($3, $4, $5, 'easy', CURRENT_TIMESTAMP - INTERVAL '20 days', CURRENT_TIMESTAMP)`,
      [randomUUID(), randomUUID(), randomUUID(), userId, due.card_id]);
    const privateDeck = await deck(otherId, 'Private progress deck');
    const privateCard = await card(privateDeck.deck_id);
    await db.none(
      `INSERT INTO card_reviews(request_id, user_id, card_id, rating, reviewed_at, next_review_at)
       VALUES($1, $2, $3, 'easy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [randomUUID(), otherId, privateCard.card_id]);
    const data = await loadProgress(userId);
    expect(data.totals).to.deep.equal({ total: 3, studied: 2, ready: 2, new: 1 });
    expect(data.totalReviews).to.equal(3);
    expect(data.recentReviews).to.equal(2);
    expect(data.todayReviews).to.equal(1);
    expect(data.activeDays).to.equal(2);
    expect(data.recallPercent).to.equal(50);
    expect(data.timezone).to.equal('America/Denver');
    expect(data.activity[13].reviews).to.equal(1);
    expect(data.activity[12].reviews).to.equal(1);
    expect(data.studySet.deck_id).to.equal(own.deck_id);
    expect(data.sets.find(set => set.deck_id === own.deck_id)).to.include({ coverage: 67, due: 1, new: 1 });
    expect(data.sets.find(set => set.deck_id === empty.deck_id)).to.include({ total: 0, coverage: 0, ready: 0 });
    expect(data.nextReview).to.be.a('string');
    const res = await agent.get('/progress');
    expect(res).to.have.status(200);
    expect(res.text).not.to.include('Private progress deck');
    expect(res.text).not.to.include('<script>bad()</script>');
    expect(res.text).to.include('&lt;script&gt;bad()&lt;/script&gt;');
    expect(res.text).to.include(`href="/decks/${own.deck_id}"`);
    expect(res.text).to.include('50%');
    // Removing a card removes its schedule and history from the page as documented.
    await db.none('DELETE FROM flashcards WHERE card_id = $1', [due.card_id]);
    const removed = await loadProgress(userId);
    expect(removed.totalReviews).to.equal(0);
    expect(removed.totals.total).to.equal(2);
  });

  it('shows a future review rather than a due count and preserves a real zero recall rate', async () => {
    const own = await deck();
    const studied = await card(own.deck_id);
    await db.none(
      `INSERT INTO user_card_progress(user_id, card_id, last_reviewed_at, next_review_at)
       VALUES($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 minute')`, [userId, studied.card_id]);
    await db.none(
      `INSERT INTO card_reviews(request_id, user_id, card_id, rating, reviewed_at, next_review_at)
       VALUES($1, $2, $3, 'again', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 minute')`,
      [randomUUID(), userId, studied.card_id]);
    const data = await loadProgress(userId);
    expect(data.totals.ready).to.equal(0);
    expect(data.studySet).to.equal(undefined);
    expect(data.hasReviews).to.equal(true);
    expect(data.recallPercent).to.equal(0);
    const res = await agent.get('/progress');
    const dom = new JSDOM(res.text);
    expect(dom.window.document.querySelector('#recall-percent').textContent).to.equal('0%');
    expect(res.text).to.include('Your next scheduled review is');
    dom.window.close();
  });

  it('falls back to UTC for an invalid saved timezone', async () => {
    await db.none('UPDATE users SET timezone = $1 WHERE user_id = $2', ['invalid/timezone', userId]);
    try {
      expect((await loadProgress(userId)).timezone).to.equal('UTC');
    } finally {
      await db.none('UPDATE users SET timezone = $1 WHERE user_id = $2', ['America/Denver', userId]);
    }
  });

  it('shows a recoverable error instead of zero statistics when loading fails', async () => {
    const originalTask = db.task;
    db.task = () => Promise.reject(Object.assign(new Error('Simulated database failure'), { code: 'TEST_FAILURE' }));
    try {
      const res = await agent.get('/progress');
      expect(res).to.have.status(500);
      expect(res.text).to.include('Progress is unavailable');
      expect(res.text).to.include('Try again');
      expect(res.text).not.to.include('id="ready-count"');
    } finally {
      db.task = originalTask;
    }
  });
});
