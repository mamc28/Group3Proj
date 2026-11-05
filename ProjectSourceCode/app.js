const express = require('express');

const app = express();

app.get('/welcome', (req, res) => {
  res.json({status: 'success', message: 'Welcome!'});
});
module.exports = app;