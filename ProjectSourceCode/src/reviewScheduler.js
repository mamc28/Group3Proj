// A small interval scheduler, not an implementation of Anki's FSRS algorithm.
const MINUTE = 60;
const DAY = 86400;
const MAX_INTERVAL = 365 * DAY;
const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 };

function reviewIntervals(progress) {
  const previous = progress?.last_reviewed_at && progress?.next_review_at
    ? Math.max(0, (new Date(progress.next_review_at) - new Date(progress.last_reviewed_at)) / 1000)
    : 0;
  return {
    again: MINUTE,
    hard: Math.min(MAX_INTERVAL, Math.max(6 * 3600, Math.round(previous * 1.2))),
    good: Math.min(MAX_INTERVAL, Math.max(DAY, Math.round(previous * 2))),
    easy: Math.min(MAX_INTERVAL, Math.max(4 * DAY, Math.round(previous * 3))),
  };
}

module.exports = { RATINGS, reviewIntervals };
