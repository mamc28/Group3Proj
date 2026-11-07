ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS image_data BYTEA;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS image_type TEXT;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS front_type TEXT NOT NULL DEFAULT 'text';
UPDATE flashcards SET front_type = 'image' WHERE image_data IS NOT NULL AND front_type = 'text';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS back_image_data BYTEA;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS back_image_type TEXT;
