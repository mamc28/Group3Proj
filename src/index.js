// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars'); //to enable express to work with handlebars
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords

// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
});

// database configuration
const dbConfig = {
  host: 'db', // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// test your database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.

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
app.get('/home', auth, (req, res) => {
  res.render('pages/home', {
    isHome: true,
    username: req.session.user.username,
  });
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
// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
app.listen(3000);
console.log('Server is listening on port 3000');
