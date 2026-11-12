const router = require('express').Router({ mergeParams: true });
const { timingSafeEqual } = require('node:crypto');
const { db } = require('./db');
const { RATINGS, reviewIntervals } = require('./reviewScheduler');

router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  if (req.method === 'POST') {
    const submitted = Buffer.from(typeof req.body.csrfToken === 'string' ? req.body.csrfToken : '');
    const expected = Buffer.from(req.session.deckCsrf);
    if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
      return res.status(403).json({ message: 'Your study session expired. Reload the page and try again.' });
    }
  }
  next();
});

router.get('/', async (req, res) => {
  try {
    const deck = await db.oneOrNone('SELECT deck_id FROM decks WHERE deck_id = $1 AND user_id = $2',
      [req.params.id, req.session.user.user_id]);
    if (!deck) return res.status(404).json({ message: 'Set not found.' });
    const rows = await db.any(
      `SELECT f.card_id, p.last_reviewed_at, p.next_review_at,
              (p.next_review_at IS NULL OR p.next_review_at <= CURRENT_TIMESTAMP) AS due
       FROM flashcards f LEFT JOIN user_card_progress p ON p.card_id = f.card_id AND p.user_id = $2
       WHERE f.deck_id = $1 ORDER BY p.next_review_at NULLS FIRST, f.card_id`,
      [deck.deck_id, req.session.user.user_id]);
    return res.json({ cards: rows.map(row => ({ ...row, intervals: reviewIntervals(row) })) });
  } catch (error) {
    console.error('Unable to load study queue:', error.code);
    return res.status(500).json({ message: 'Unable to load your review queue. Please try again.' });
  }
});

router.post('/reviews', async (req, res) => {
  const { cardId, rating, requestId, lastReviewedAt } = req.body;
  if (!Number.isInteger(cardId) || cardId < 1 || cardId > 2147483647 ||
      !Object.hasOwn(RATINGS, rating) || typeof requestId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId) ||
      !(lastReviewedAt === null || (typeof lastReviewedAt === 'string' && Number.isFinite(Date.parse(lastReviewedAt))))) {
    return res.status(400).json({ message: 'Invalid review. Reload the study queue and try again.' });
  }
  try {
    const review = await db.tx(async t => {
      const userId = req.session.user.user_id;
      // Serialize reviews and deck edits so counters, history, and scheduling agree.
      const deck = await t.oneOrNone('SELECT deck_id FROM decks WHERE deck_id = $1 AND user_id = $2 FOR UPDATE',
        [req.params.id, userId]);
      const card = deck && await t.oneOrNone('SELECT card_id FROM flashcards WHERE card_id = $1 AND deck_id = $2',
        [cardId, deck.deck_id]);
      if (!card) throw Object.assign(new Error('Card not found.'), { status: 404 });
      const existing = await t.oneOrNone('SELECT * FROM card_reviews WHERE user_id = $1 AND request_id = $2', [userId, requestId]);
      if (existing) {
        if (existing.card_id !== cardId || existing.rating !== rating) {
          throw Object.assign(new Error('This review request was already used.'), { status: 409 });
        }
        return existing;
      }
      const progress = await t.oneOrNone('SELECT * FROM user_card_progress WHERE user_id = $1 AND card_id = $2', [userId, cardId]);
      const version = progress?.last_reviewed_at?.toISOString() || null;
      if (version !== (lastReviewedAt === null ? null : new Date(lastReviewedAt).toISOString())) {
        throw Object.assign(new Error('This card changed in another study session. Reload the queue before rating it again.'), { status: 409 });
      }
      const now = new Date();
      const next = new Date(now.getTime() + reviewIntervals(progress)[rating] * 1000);
      await t.none(
        `INSERT INTO user_card_progress(user_id, card_id, times_reviewed, times_correct, times_incorrect,
           confidence_level, last_reviewed_at, next_review_at)
         VALUES($1, $2, 1, $3, $4, $5, $6, $7)
         ON CONFLICT(user_id, card_id) DO UPDATE SET
           times_reviewed = COALESCE(user_card_progress.times_reviewed, 0) + 1,
           times_correct = COALESCE(user_card_progress.times_correct, 0) + $3,
           times_incorrect = COALESCE(user_card_progress.times_incorrect, 0) + $4,
           confidence_level = $5, last_reviewed_at = $6, next_review_at = $7`,
        [userId, cardId, rating === 'again' ? 0 : 1, rating === 'again' ? 1 : 0, RATINGS[rating], now, next]);
      return t.one(
        `INSERT INTO card_reviews(request_id, user_id, card_id, rating, reviewed_at, next_review_at)
         VALUES($1, $2, $3, $4, $5, $6) RETURNING *`, [requestId, userId, cardId, rating, now, next]);
    });
    return res.json({ card_id: review.card_id, rating: review.rating, next_review_at: review.next_review_at });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Unable to save review:', error.code);
    return res.status(500).json({ message: 'Unable to save your rating. Please retry.' });
  }
});

module.exports = router;
