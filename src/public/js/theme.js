// Apply the saved theme before the stylesheet loads to avoid a flash of dark mode.
(() => {
  let lightMode = false;
  try { lightMode = localStorage.getItem('scramble-theme') === 'light'; }
  catch (_) { /* Theme switching still works when browser storage is unavailable. */ }

  function applyTheme() {
    document.documentElement.classList.toggle('light-mode', lightMode);
    document.querySelectorAll('.theme-toggle').forEach(button => {
      const label = lightMode ? 'Switch to dark mode' : 'Switch to light mode';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', String(lightMode));
    });
  }

  applyTheme();
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.hidden = false;
      button.addEventListener('click', () => {
        lightMode = !lightMode;
        applyTheme();
        try { localStorage.setItem('scramble-theme', lightMode ? 'light' : 'dark'); }
        catch (_) { /* Keep the chosen theme for this page if saving fails. */ }
      });
    });
  });
})();
