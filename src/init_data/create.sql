-- 1. USERS
-- Stores user accounts and login information
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    timezone VARCHAR(100) DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--2. Decks
-- Every user can create multiple flashcard decks
CREATE TABLE IF NOT EXISTS decks (
    deck_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);

-- 3. Flashcards
-- Each deck can contain multiple flashcards
CREATE TABLE IF NOT EXISTS flashcards (
    card_id SERIAL PRIMARY KEY,
    deck_id INT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (deck_id)
        REFERENCES decks(deck_id)
        ON DELETE CASCADE
);

-- 4. User Card Progress
-- Saves spaced repetition info for each card
CREATE TABLE IF NOT EXISTS user_card_progress (
    progress_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    card_id INT NOT NULL,
    
    times_reviewed INT DEFAULT 0,
    times_correct INT DEFAULT 0,
    times_incorrect INT DEFAULT 0,


   confidence_level INT DEFAULT 0,
   next_review_at TIMESTAMPTZ,
   last_reviewed_at TIMESTAMPTZ,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    FOREIGN KEY (card_id)
        REFERENCES flashcards(card_id)
        ON DELETE CASCADE,

    UNIQUE (user_id, card_id),
    CHECK (confidence_level BETWEEN 0 AND 5)
);

-- 5. STUDY SESSIONS
-- Records each time a user studies a deck
CREATE TABLE IF NOT EXISTS study_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    deck_id INT NOT NULL,

    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,

    cards_studied INT DEFAULT 0,
    correct_answers INT DEFAULT 0,
    points_earned INT DEFAULT 0,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    FOREIGN KEY (deck_id)
        REFERENCES decks(deck_id)
        ON DELETE CASCADE
);

-- 6. Study Activity
-- Tracks daily activity for streaks and calendar display (maybe even heatmaps or other stats could be used)
CREATE TABLE IF NOT EXISTS study_activity (
    activity_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    study_date DATE NOT NULL,

    cards_reviewed INT DEFAULT 0,
    sessions_completed INT DEFAULT 0,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    UNIQUE (user_id, study_date)
);

-- 7. User Stats
-- Used for leaderboards and gamification
CREATE TABLE IF NOT EXISTS user_stats (
    user_id INT PRIMARY KEY,

    total_points INT DEFAULT 0,
    total_cards_reviewed INT DEFAULT 0,
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    last_study_date DATE,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);
