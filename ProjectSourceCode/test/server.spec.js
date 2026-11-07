const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../src');
const {db, pgp} = require('../src/db');
const bcrypt = require('bcryptjs');

chai.use(chaiHttp);
const {expect} = chai;

// Root hook: close the shared database pool after all tests in this process.
// Keep other suites in this file or reuse these imports in separate files.
after(() => {
  pgp.end();
});

describe('GET /register', () => {
  it('renders the registration page', async () => {
    const res = await chai.request(app).get('/register');
    expect(res).to.have.status(200);
    expect(res.text).to.include('Register');
  });
});

// Add your registration tests below.

describe('POST /register', () => {
  const {randomUUID} = require('node:crypto');
  const uniqueId = randomUUID();
  const testUser = {
    username: `lab10_${uniqueId}`,
    email: `lab10_${uniqueId}@example.test`,
    password: 'TestPassword123!',
  };

  async function removeTestUser() {
    await db.none('DELETE FROM users WHERE username = $1', [testUser.username]);
  }

  beforeEach(removeTestUser);
  afterEach(removeTestUser);

  it('creates exactly one user for valid input', async () => {
    const res = await chai.request(app)
      .post('/register')
      .redirects(0)
      .send(testUser);

    expect(res).to.have.status(302);
    expect(res).to.have.header('location', '/login');

    const rows = await db.any(
      'SELECT username, email, password_hash FROM users WHERE username = $1',
      [testUser.username]
    );
    expect(rows).to.have.lengthOf(1);
    expect(rows[0].username).to.equal(testUser.username);
    expect(rows[0].email).to.equal(testUser.email);
    expect(rows[0].password_hash).not.to.equal(testUser.password);
    expect(await bcrypt.compare(testUser.password, rows[0].password_hash)).to.equal(
      true
    );
  });

  it('rejects registration when the password is missing', async () => {
    const res = await chai.request(app).post('/register').send({
      username: testUser.username,
      email: testUser.email,
    });

    expect(res).to.have.status(400);
    expect(res.text).to.include('Enter a username, email, and password.');

    const rows = await db.any(
      'SELECT username FROM users WHERE username = $1',
      [testUser.username]
    );
    expect(rows).to.have.lengthOf(0);
  });
});
