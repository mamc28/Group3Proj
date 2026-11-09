// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars'); //to enable express to work with handlebars
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords
const { db } = require('./db');
const flashcardRoutes = require('./flashcardRoutes');

// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
});

// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '8mb' })); // specify the usage of JSON for parsing request body.

// initialize session variables
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: '8mb',
  })
);

// *****************************************************
// <!-- Section 4 : API Routes -->
// *****************************************************
// Authentication Middleware.
const auth = (req, res, next) => {
  if (!req.session.user) {
    // Default to login page.
    return res.redirect('/login');
  }
  next();
};

app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/home' : '/login');
});
app.get('/register', (req, res) => {
  res.render('pages/register');
});
app.use('/decks', auth, flashcardRoutes);
app.get('/home', auth, async (req, res) => {
  try {
    const userId = req.session.user.user_id;

    const recentSets = await db.any(
      `SELECT d.deck_id, d.title AS name, COUNT(f.card_id)::int AS "cardCount"
       FROM decks d LEFT JOIN flashcards f ON f.deck_id = d.deck_id
       WHERE d.user_id = $1 GROUP BY d.deck_id ORDER BY d.created_at DESC, d.deck_id DESC`,
      [userId]
    );
    const streak = await db.oneOrNone(
      `SELECT current_streak, longest_streak, last_login_date
       FROM user_stats
       WHERE user_id = $1`,
      [userId]
    );


    res.render('pages/home', { isHome: true, username: req.session.user.username, recentSets });
  } catch (error) {
    console.error('Unable to load sets:', error.code);
    res.status(500).render('pages/home', {
      isHome: true, username: req.session.user.username,
      message: 'Unable to load your sets. Please try again.', error: true,
    });
  }
});
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (typeof username !== 'string' || !username.trim() || username.length > 50 ||
      typeof email !== 'string' || !email.trim() || email.length > 100 ||
      typeof password !== 'string' || !password) {
    return res.status(400).render('pages/register', {
      message: 'Enter a username, email, and password.', error: true,
    });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.none(
      'INSERT INTO users(username, email, password_hash) VALUES($1, $2, $3)',
      [username.trim(), email.trim(), hash]
    );
    return res.redirect('/login');
  } catch (error) {
    const duplicate = error.code === '23505';
    console.error('Registration failed:', error.code);
    return res.status(duplicate ? 409 : 500).render('pages/register', {
      message: duplicate ? 'That username or email is already registered.' :
        'Unable to register. Please try again after the database is ready.',
      error: true,
    });
  }
});
app.all('/login', (req, res, next) => {
  res.locals.isLogin = true;
  next();
});
app.get('/login', (req, res) => {
  res.render('pages/login');
});
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).render('pages/login', {
      message: 'Enter your username and password.', error: true,
    });
  }
  try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).render('pages/login', {
        message: 'Incorrect username or password.', error: true,
      });
    }
    //Updating login time for engagement stuff.
    await db.none(
      `UPDATE users
       SET last_login = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [user.user_id]
    );
    // Call streak function
    await updateLoginStreak(user.user_id);
    req.session.regenerate(err => {
      if (err) return loginSessionError(res);
      req.session.user = { user_id: user.user_id, username: user.username };
      req.session.save(err => {
        if (err) return loginSessionError(res);
        return res.redirect('/home');
      });
    });
  } catch (error) {
    console.error('Login failed:', error.code);
    return loginSessionError(res);
  }
});
function loginSessionError(res) {
  return res.status(500).render('pages/login', {
    message: 'Unable to log in. Please try again later.', error: true,
  });
}
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.render('pages/logout', {
                message: "Unable to logout.",
                error: true
            });
        }
    res.render('pages/logout', {
        message: "Logged out Successfully.",        
        error: false
        });
    });
});

// Friends page: search users by username and list the user's friends.
app.get('/friends', auth, async (req, res) => {
  const userId = req.session.user.user_id;
  const search = (req.query.search || '').trim();

  try {
    const friends = await db.any(
      `SELECT users.user_id, users.username
       FROM friendships
       JOIN users ON users.user_id = friendships.friend_id
       WHERE friendships.user_id = $1
       ORDER BY users.username`,
      [userId]
    );

    // Only search when something was typed. Leaves out yourself and people already added.
    let results = [];
    if (search) {
      results = await db.any(
        `SELECT user_id, username
         FROM users
         WHERE username ILIKE $1
           AND user_id <> $2
           AND user_id NOT IN (SELECT friend_id FROM friendships WHERE user_id = $2)
         ORDER BY username
         LIMIT 10`,
        ['%' + search + '%', userId]
      );
    }

    res.render('pages/friends', {
      isHome: true, // uses the same dashboard layout as the home page
      username: req.session.user.username,
      search,
      searched: search !== '',
      results,
      friends,
    });
  } catch (error) {
    console.error('Friends page failed:', error.code);
    res.render('pages/friends', {
      isHome: true,
      username: req.session.user.username,
      message: 'Unable to load friends. Please try again later.',
      error: true,
    });
  }
});

// Add a friend from the search results.
app.post('/friends/add', auth, async (req, res) => {
  try {
    await db.none(
      `INSERT INTO friendships (user_id, friend_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.session.user.user_id, req.body.friend_id]
    );
  } catch (error) {
    console.error('Add friend failed:', error.code);
  }
  res.redirect('/friends');
});

// Remove a friend from the list.
app.post('/friends/remove', auth, async (req, res) => {
  try {
    await db.none(
      'DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2',
      [req.session.user.user_id, req.body.friend_id]
    );
  } catch (error) {
    console.error('Remove friend failed:', error.code);
  }
  res.redirect('/friends');
});

/// Separate function to update streak; didn't want to nest this whole thing
async function updateLoginStreak(userId) {
  await db.none(`
      INSERT INTO user_stats (
          user_id,
          current_streak,
          longest_streak,
          last_login_date
      )
      SELECT
          user_id,
          1,
          1,
          (CURRENT_TIMESTAMP AT TIME ZONE timezone)::DATE
      FROM users
      WHERE user_id = $1

      ON CONFLICT (user_id)
      DO UPDATE SET

          current_streak = CASE
              WHEN user_stats.last_login_date = EXCLUDED.last_login_date
                  THEN user_stats.current_streak

              WHEN user_stats.last_login_date = EXCLUDED.last_login_date - 1
                  THEN user_stats.current_streak + 1

              ELSE 1
          END,

          longest_streak = GREATEST(
              user_stats.longest_streak,
              CASE
                  WHEN user_stats.last_login_date = EXCLUDED.last_login_date
                      THEN user_stats.current_streak

                  WHEN user_stats.last_login_date = EXCLUDED.last_login_date - 1
                      THEN user_stats.current_streak + 1

                  ELSE 1
              END
          ),

          last_login_date = EXCLUDED.last_login_date;
  `, [userId]);
}


// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
if (require.main === module) {
  app.listen(3000, () => {
    console.log('Server is listening on port 3000');
  });
}

module.exports = app;
