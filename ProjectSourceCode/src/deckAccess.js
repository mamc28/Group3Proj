const { db } = require('./db');

const ACCESSIBLE_DECK_SQL = `
  SELECT d.deck_id, d.user_id, d.title, d.description, d.visibility
  FROM decks d
  WHERE d.deck_id = $1
    AND (
      d.user_id = $2
      OR (
        d.visibility IN ('public', 'published')
        AND EXISTS (
          SELECT 1
          FROM friendships f
          WHERE f.user_id = $2
            AND f.friend_id = d.user_id
            AND f.status = 'accepted'
        )
      )
    )
`;

async function getAccessibleDeck(deckId, userId, database = db) {
  return database.oneOrNone(ACCESSIBLE_DECK_SQL, [deckId, userId]);
}

module.exports = { getAccessibleDeck, ACCESSIBLE_DECK_SQL };