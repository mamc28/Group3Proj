const router = require('express').Router();
const { loadProgress } = require('./progressData');

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const page = { isHome: true, username: req.session.user.username };
  try {
    return res.render('pages/progress', { ...page, ...await loadProgress(req.session.user.user_id) });
  } catch (error) {
    console.error('Unable to load progress:', error.code);
    return res.status(500).render('pages/progress', {
      ...page, loadFailed: true,
    });
  }
});

module.exports = router;
