-- Deck visibility:
-- private: only the owner can access the set
-- public: visible to accepted friends, remains editable
-- published: visible to accepted friends, permanently immutable

ALTER TABLE decks
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE decks
    ADD CONSTRAINT decks_visibility_check
    CHECK (visibility IN ('private', 'public', 'published'));