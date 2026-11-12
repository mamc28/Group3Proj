const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { db, pgp } = require('./db');

const migrations = [
  '001_create.sql',
  '002_card_images.sql',
  '003_card_reviews.sql',
];

db.tx(async t => {
  for (const migration of migrations) {
    const sql = readFileSync(join(__dirname, 'init_data', migration), 'utf8');
    await t.none(sql);
  }
})
  .then(() => console.log('Database schema migrations applied.'))
  .catch(error => {
    console.error('Database schema migration failed:', error.code);
    process.exitCode = 1;
  })
  .finally(() => pgp.end());
