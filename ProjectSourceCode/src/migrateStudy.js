const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { db, pgp } = require('./db');

db.tx(t => t.none(readFileSync(join(__dirname, 'init_data/003_card_reviews.sql'), 'utf8')))
  .then(() => console.log('Study review migration applied.'))
  .catch(error => {
    console.error('Study review migration failed:', error.code);
    process.exitCode = 1;
  })
  .finally(() => pgp.end());
