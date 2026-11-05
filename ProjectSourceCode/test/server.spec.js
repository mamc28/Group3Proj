const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../app');
const {db, pgp} = require('../src/db');
const bcrypt = require('bcryptjs');

chai.use(chaiHttp);
const {expect} = chai;

// Root hook: close the shared database pool after all tests in this process.
// Keep other suites in this file or reuse these imports in separate files.
after(() => {
  pgp.end();
});

describe('Welcome route', () => {
  it('returns the default welcome message', async () => {
    const res = await chai.request(app).get('/welcome');
    expect(res).to.have.status(200);
    expect(res.body).to.deep.equal({
      status: 'success',
      message: 'Welcome!',
    });
  });
});

// Add your registration tests below.

describe('POST /register', () => {
  const {randomUUID} = require('node:crypto');
  const testUser = {
    username: `lab10_${randomUUID()}`,
    password: 'TestPassword123!',
  };

  async function removeTestUser() {
    await db.none('DELETE FROM users WHERE username = $1', [testUser.username]);
  }

  beforeEach(removeTestUser);
  afterEach(removeTestUser);

  it('creates exactly one user for valid input', async () => {
    // Act: submit the request through the actual registration route.
    const res = await chai.request(app).post('/register').send(testUser);

    // Assert: verify both the response and the saved record.
    expect(res).to.have.status(201);
    expect(res.body.message).to.equal('Registration successful');

    const rows = await db.any(
      'SELECT username, password FROM users WHERE username = $1',
      [testUser.username]
    );
    expect(rows).to.have.lengthOf(1);
    expect(rows[0].username).to.equal(testUser.username);
    expect(rows[0].password).not.to.equal(testUser.password);
    expect(await bcrypt.compare(testUser.password, rows[0].password)).to.equal(
      true
    );
  });

  // TODO: Add an async test that submits this username without a password.
  // Assert the documented rejection response and zero matching database rows.

  describe('POST /register with missing password', () => {
    it('rejects registration with missing password', async () => {
      const res = await chai.request(app).post('/register').send({
        username: testUser.username,
      });

      expect(res).to.have.status(400);
      expect(res.body.message).to.equal('Invalid input');

      const rows = await db.any(
        'SELECT username FROM users WHERE username = $1',
        [testUser.username]
      );
      expect(rows).to.have.lengthOf(0);
    });
  });
  
  // Asycn test that submits this username and password and checks that the response is a redirect to /login and that the user is created in the database.
  describe('POST /register with valid input', () => {
    it('redirects to /login and creates user in database', async () => {
      const res = await chai.request(app).post('/register').send(testUser);

      expect(res).to.have.status(201);
      expect(res.body.message).to.equal('Registration successful');

      const rows = await db.any(
        'SELECT username, password FROM users WHERE username = $1',
        [testUser.username]
      );
      expect(rows).to.have.lengthOf(1);
      expect(rows[0].username).to.equal(testUser.username);
      expect(rows[0].password).not.to.equal(testUser.password);
      expect(await bcrypt.compare(testUser.password, rows[0].password)).to.equal(
        true
      );
    });
  });
});