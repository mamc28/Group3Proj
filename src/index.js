// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars'); //to enable express to work with handlebars
const Handlebars = require('handlebars'); // to include the templating engine responsible for compiling templates
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server. We'll learn more about it in Part C.

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

// Authentication Required
// app.use(auth); Removing this line of code

//Instead we will use auth in our routes that require the user to be authenticated

//For eg: /discover route will look as follows:

//app.get('/discover', auth, (req,res) => {
//  ....
//});

//do the same for logout

// TODO - Include your API routes here
app.get('/', (req, res) => {
  res.redirect('/login'); //this will call the /anotherRoute route in the API
});
app.get('/register', (req, res) => {
  res.render('pages/register');
});
app.post('/register', async(req, res) => {
    const hash = await bcrypt.hash(req.body.password, 10);
    const { username } = req.body;
    await db.none('INSERT INTO users(username, password) VALUES($1, $2) ON CONFLICT (username) DO NOTHING', [username, hash]);
    res.redirect('/login');
});
app.get('/login', (req, res) => {
    res.render('pages/login');
});
app.post('/login', async(req, res) => {
    const {username, password} = req.body;
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);

    if (!user) {
        return res.redirect('/register');
    }
    const match = await bcrypt.compare(req.body.password, user.password);
    if (match) {
        req.session.user = user;
        req.session.save();
        res.redirect('/discover'); // redirect to a protected route after successful login
    } else {
        res.render('pages/login', { message: 'Incorrect username or password.', error: true });
    }
});
app.get('/discover', auth, async (req, res) => {
    axios({
  url: `https://app.ticketmaster.com/discovery/v2/events.json`,
  method: 'GET',
  dataType: 'json',
  headers: {
    'Accept-Encoding': 'application/json',
  },
  params: {
    apikey: process.env.API_KEY,
    keyword: 'football', //you can choose any artist/event here
    size: 10, // you can choose the number of events you would like to return
  },
})
  .then(results => {
    console.log(results.data._embedded?.events?.[0]?.dates); // the results will be displayed on the terminal if the docker containers are running // Send some parameters

    res.render('pages/discover', { events: results.data._embedded.events || []

    });
})
  .catch(error => {
    // Handle errors
    console.error(error);

    res.render('pages/discover', { events: [],
        message: 'Unable to load events. Please try again later.',
        error: true
     });

  });
});
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