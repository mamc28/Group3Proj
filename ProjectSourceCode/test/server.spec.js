const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../src');
const legacyApp = require('../app');
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

describe('GET /progress on the legacy app entry point', () => {
  it('uses the progress route and requires authentication', async () => {
    const res = await chai.request(legacyApp).get('/progress').redirects(0);
    expect(res).to.have.status(302);
    expect(res).to.have.header('location', '/login');
  });
});

// Add your registration tests below.
describe('POST /register', () => {
  const {randomUUID} = require('node:crypto');
  const testUser = {
    username: `lab10_${randomUUID()}`,
    email: `lab10_${randomUUID()}@example.com`,
    password: 'TestPassword123!',
  };

  async function removeTestUser() {
    await db.none('DELETE FROM users WHERE username = $1', [testUser.username]);
  }

  beforeEach(removeTestUser);
  afterEach(removeTestUser);

  it('creates exactly one user for valid input', async () => {
    // Act: submit the request through the actual registration route.
    const res = await chai.request(app)
    .post('/register')
    .redirects(0)
    .send(testUser);

    // Assert: verify both the response and the saved record.
    expect(res).to.have.status(302);
    expect(res.headers.location).to.equal('/login');

    const rows = await db.any(
      'SELECT username, password_hash FROM users WHERE username = $1',
      [testUser.username]
    );
    expect(rows).to.have.lengthOf(1);
    expect(rows[0].username).to.equal(testUser.username);
    expect(rows[0].password_hash).not.to.equal(testUser.password);
    expect(await bcrypt.compare(testUser.password, rows[0].password_hash)).to.equal(
      true
    );
  });

  // TODO: Add an async test that submits this username without a password.
  // Assert the documented rejection response and zero matching database rows.
 it('rejects registration with missing password', async () => {
    const invalidUser = {
      username: testUser.username};

      const res = await chai.request(app)
      .post('/register')
      .send(invalidUser);

      expect(res).to.have.status(400);

      const rows = await db.any(
        'SELECT username FROM users WHERE username = $1',
        [testUser.username]
      );
      expect(rows).to.have.lengthOf(0);
  });
});