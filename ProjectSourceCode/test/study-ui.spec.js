const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const Handlebars = require('handlebars');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const template = Handlebars.compile(readFileSync(join(__dirname, '../src/views/pages/set.hbs'), 'utf8'));
const script = readFileSync(join(__dirname, '../src/public/js/study-set.js'), 'utf8');
const intervals = { again: 60, hard: 21600, good: 86400, easy: 345600 };
const item = (card_id, due = true) => ({ card_id, due, last_reviewed_at: null,
  next_review_at: due ? null : new Date(Date.now() + 60000).toISOString(), intervals });
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

describe('Confidence-rating study interactions', () => {
  let dom;
  function setup(fetch) {
    dom = new JSDOM(template({ deck_id: 1, csrfToken: 'token', title: 'Study', cards: [
      { card_id: 10, question: 'Question one', answer: 'Answer one' },
      { card_id: 20, question: 'Question two', answer: 'Answer two', showFrontText: true, image_type: 'image/png', back_image_type: 'image/png' },
    ] }), { url: 'http://localhost/decks/1', runScripts: 'outside-only' });
    dom.window.fetch = fetch;
    dom.window.eval(script);
    return dom.window.document;
  }
  afterEach(() => dom?.window.close());

  it('reveals ratings only on the answer and advances only after a successful save', async () => {
    let finishSave;
    let posts = 0;
    let rated = false;
    const doc = setup(async (url, options) => {
      if (!options?.method) return response({ cards: [item(10, !rated), item(20)] });
      posts += 1;
      const body = JSON.parse(options.body);
      expect(body).to.include({ cardId: 10, rating: 'good', lastReviewedAt: null, csrfToken: 'token' });
      return new Promise(resolve => { finishSave = () => { rated = true; resolve(response({})); }; });
    });
    await settle();
    expect(doc.getElementById('study-ratings').hidden).to.equal(true);
    doc.querySelector('[data-rating="good"]').click();
    expect(posts).to.equal(0);
    const card = doc.getElementById('study-card');
    card.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(doc.getElementById('study-ratings').hidden).to.equal(false);
    expect(doc.querySelector('[data-rating="again"] span').textContent).to.equal('1 min');
    doc.querySelector('[data-rating="good"]').click();
    doc.querySelector('[data-rating="good"]').click();
    expect(posts).to.equal(1);
    expect(doc.getElementById('study-question').textContent).to.include('Question one');
    finishSave();
    await settle();
    expect(doc.getElementById('study-question').textContent).to.include('Question two');
    expect(doc.getElementById('study-question').querySelector('img').src).to.include('/cards/20/image');
    expect(doc.getElementById('study-answer').querySelector('img').src).to.include('/cards/20/back-image');
    expect(doc.getElementById('study-ratings').hidden).to.equal(true);
    expect(doc.getElementById('study-count').textContent).to.include('1 reviewed');
  });

  it('retries a failed rating with the same request ID and prevents other ratings', async () => {
    const requests = [];
    const doc = setup(async (url, options) => {
      if (!options?.method) return response({ cards: requests.length > 1 ? [] : [item(10)] });
      requests.push(JSON.parse(options.body));
      return requests.length === 1 ? response({ message: 'Temporary failure' }, 500) : response({});
    });
    await settle();
    doc.getElementById('study-flip').click();
    doc.querySelector('[data-rating="again"]').click();
    await settle();
    expect(doc.getElementById('study-error').textContent).to.include('Retry the same rating');
    expect(doc.querySelector('[data-rating="easy"]').disabled).to.equal(true);
    doc.querySelector('[data-rating="again"]').click();
    await settle();
    expect(requests).to.have.lengthOf(2);
    expect(requests[0].requestId).to.equal(requests[1].requestId);
    expect(doc.getElementById('study-complete-title').textContent).to.equal('All caught up for now');
  });

  it('reloads after a stale review instead of allowing an overwrite', async () => {
    let gets = 0;
    const doc = setup(async (url, options) => {
      if (!options?.method) { gets++; return response({ cards: gets === 1 ? [item(10)] : [item(20)] }); }
      return response({ message: 'Card changed in another session' }, 409);
    });
    await settle();
    doc.getElementById('study-flip').click();
    doc.querySelector('[data-rating="hard"]').click();
    await settle();
    expect(doc.getElementById('study-review').hidden).to.equal(true);
    expect(doc.getElementById('study-complete-title').textContent).to.equal('Reload your review queue');
    doc.getElementById('study-restart').click();
    await settle();
    expect(doc.getElementById('study-question').textContent).to.include('Question two');
    expect(doc.getElementById('study-ratings').hidden).to.equal(true);
  });

  it('shows future review time, and brings a card back when it becomes due', async () => {
    let due = false;
    const doc = setup(async () => response({ cards: [item(10, due)] }));
    await settle();
    expect(doc.getElementById('study-review').hidden).to.equal(true);
    expect(doc.getElementById('study-complete-description').textContent).to.include('Next review:');
    due = true;
    doc.getElementById('study-restart').click();
    await settle();
    expect(doc.getElementById('study-review').hidden).to.equal(false);
    expect(doc.getElementById('study-question').textContent).to.include('Question one');
  });

  it('keeps the current answer when entering and exiting distraction-free studying', async () => {
    const doc = setup(async () => response({ cards: [item(10)] }));
    await settle();
    const dialog = doc.getElementById('study-focus-dialog');
    // jsdom does not implement native modal/fullscreen behavior.
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new dom.window.Event('close')); };
    doc.getElementById('study-flip').click();
    doc.getElementById('study-focus').click();
    expect(dialog.contains(doc.querySelector('.study-session'))).to.equal(true);
    expect(doc.getElementById('study-ratings').hidden).to.equal(false);
    dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
    await settle();
    expect(dialog.contains(doc.querySelector('.study-session'))).to.equal(false);
    expect(doc.getElementById('study-ratings').hidden).to.equal(false);
    expect(doc.activeElement.id).to.equal('study-focus');
  });

  it('allows retry after an initial queue failure', async () => {
    let gets = 0;
    const doc = setup(async () => ++gets === 1
      ? response({ message: 'Queue unavailable' }, 500) : response({ cards: [item(10)] }));
    await settle();
    expect(doc.getElementById('study-complete-title').textContent).to.equal('Review queue unavailable');
    doc.getElementById('study-restart').click();
    await settle();
    expect(doc.getElementById('study-review').hidden).to.equal(false);
  });
});
