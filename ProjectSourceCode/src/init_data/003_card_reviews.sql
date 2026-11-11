-- Individual review events also provide retry deduplication after a lost response.
CREATE TABLE IF NOT EXISTS card_reviews (
    review_id BIGSERIAL PRIMARY KEY,
    request_id UUID NOT NULL,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    card_id INT NOT NULL REFERENCES flashcards(card_id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
    reviewed_at TIMESTAMPTZ NOT NULL,
    next_review_at TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_card_reviews_user_card ON card_reviews(user_id, card_id, reviewed_at);
