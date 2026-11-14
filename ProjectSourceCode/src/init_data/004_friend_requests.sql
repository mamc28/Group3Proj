-- Friend requests: a friendships row starts as 'pending' when someone sends a request,
-- and becomes 'accepted' when the other person accepts it.
-- Friendships made before requests existed count as already accepted.
ALTER TABLE friendships
    ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'accepted';