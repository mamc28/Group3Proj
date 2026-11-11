const { db } = require('./db');

async function loadProgress(userId) {
  // Use the account's calendar day, with a safe fallback for older/invalid settings.
  let { timezone } = await db.one(
    `SELECT COALESCE((SELECT name FROM pg_timezone_names WHERE name = u.timezone LIMIT 1), 'UTC') AS timezone
     FROM users u WHERE user_id = $1`, [userId]);
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); }
  catch { timezone = 'UTC'; }
  const [sets, activity, history] = await db.task(async t => {
    const sets = await t.any(
      `SELECT d.deck_id, d.title,
         COUNT(f.card_id)::int AS total,
         COUNT(f.card_id) FILTER (WHERE p.last_reviewed_at IS NOT NULL)::int AS studied,
         COUNT(f.card_id) FILTER (WHERE p.next_review_at IS NULL OR p.next_review_at <= CURRENT_TIMESTAMP)::int AS ready,
         COUNT(f.card_id) FILTER (WHERE p.last_reviewed_at IS NULL AND p.next_review_at IS NULL)::int AS new,
         MIN(p.next_review_at) FILTER (WHERE p.next_review_at > CURRENT_TIMESTAMP) AS next_review_at
       FROM decks d LEFT JOIN flashcards f ON f.deck_id = d.deck_id
       LEFT JOIN user_card_progress p ON p.card_id = f.card_id AND p.user_id = $1
       WHERE d.user_id = $1 GROUP BY d.deck_id ORDER BY ready DESC, d.created_at DESC, d.deck_id DESC`, [userId]);
    const activity = await t.any(
      `WITH daily AS (
         SELECT (r.reviewed_at AT TIME ZONE $2)::date AS day, COUNT(*)::int AS reviews,
           COUNT(*) FILTER (WHERE r.rating <> 'again')::int AS recalled
         FROM card_reviews r JOIN flashcards f ON f.card_id = r.card_id JOIN decks d ON d.deck_id = f.deck_id
         WHERE r.user_id = $1 AND d.user_id = $1
           AND r.reviewed_at >= (((CURRENT_TIMESTAMP AT TIME ZONE $2)::date - 13)::timestamp AT TIME ZONE $2)
           AND r.reviewed_at <= CURRENT_TIMESTAMP
         GROUP BY day
       ), days AS (
         SELECT (CURRENT_TIMESTAMP AT TIME ZONE $2)::date - ago AS day FROM generate_series(13, 0, -1) AS ago
       )
       SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS day, TO_CHAR(days.day, 'Mon DD') AS label,
         COALESCE(daily.reviews, 0)::int AS reviews, COALESCE(daily.recalled, 0)::int AS recalled
       FROM days LEFT JOIN daily ON daily.day = days.day ORDER BY days.day`, [userId, timezone]);
    const history = await t.one(
      `SELECT COUNT(*)::int AS total_reviews
       FROM card_reviews r JOIN flashcards f ON f.card_id = r.card_id JOIN decks d ON d.deck_id = f.deck_id
       WHERE r.user_id = $1 AND d.user_id = $1 AND r.reviewed_at <= CURRENT_TIMESTAMP`, [userId]);
    return [sets, activity, history];
  });
  const totals = sets.reduce((sum, set) => ({
    total: sum.total + set.total, studied: sum.studied + set.studied,
    ready: sum.ready + set.ready, new: sum.new + set.new,
  }), { total: 0, studied: 0, ready: 0, new: 0 });
  const recentReviews = activity.reduce((sum, day) => sum + day.reviews, 0);
  const recentRecalled = activity.reduce((sum, day) => sum + day.recalled, 0);
  const peak = Math.max(1, ...activity.map(day => day.reviews));
  const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' });
  const nextDates = sets.filter(set => set.next_review_at).map(set => set.next_review_at);
  return {
    timezone, totals, totalReviews: history.total_reviews, recentReviews,
    todayReviews: activity[activity.length - 1].reviews,
    activeDays: activity.filter(day => day.reviews > 0).length,
    hasReviews: recentReviews > 0,
    recallPercent: recentReviews ? Math.round(recentRecalled / recentReviews * 100) : null,
    recentRecalled,
    nextReview: nextDates.length ? dateFormat.format(new Date(Math.min(...nextDates.map(Number)))) : null,
    activity: activity.map(day => ({ ...day, barHeight: Math.round(day.reviews / peak * 100) })),
    sets: sets.map(set => ({ ...set, due: set.ready - set.new,
      coverage: set.total ? Math.round(set.studied / set.total * 100) : 0,
      nextReview: set.next_review_at ? dateFormat.format(set.next_review_at) : null,
    })),
    studySet: sets.find(set => set.ready > 0),
  };
}

module.exports = { loadProgress };
