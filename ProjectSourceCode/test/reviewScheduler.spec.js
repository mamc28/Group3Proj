const { expect } = require('chai');
const { reviewIntervals } = require('../src/reviewScheduler');

describe('Review interval scheduling', () => {
  it('starts new cards with minute, hour, and day intervals', () => {
    expect(reviewIntervals(null)).to.deep.equal({ again: 60, hard: 21600, good: 86400, easy: 345600 });
  });
  it('grows established intervals, resets Again, and caps long intervals', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const schedule = days => reviewIntervals({ last_reviewed_at: start, next_review_at: new Date(+start + days * 86400000) });
    expect(schedule(10)).to.deep.equal({ again: 60, hard: 12 * 86400, good: 20 * 86400, easy: 30 * 86400 });
    expect(schedule(365)).to.deep.equal({ again: 60, hard: 365 * 86400, good: 365 * 86400, easy: 365 * 86400 });
    expect(reviewIntervals({ last_reviewed_at: start, next_review_at: new Date(+start - 1000) })).to.deep.equal(reviewIntervals(null));
  });
});
