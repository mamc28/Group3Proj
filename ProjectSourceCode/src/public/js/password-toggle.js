// Show/hide password button for the login and register forms.
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.password-toggle').forEach(button => {
      const input = document.getElementById(button.getAttribute('aria-controls'));
      if (!input) return;
  
      button.hidden = false;
      button.addEventListener('click', () => {
        const showing = input.type === 'password';
        input.type = showing ? 'text' : 'password';
  
        const label = showing ? 'Hide password' : 'Show password';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', String(showing));
      });
  
      // Hide the password again before the form is sent, so the browser
      // doesn't remember the field as plain text.
      if (input.form) {
        input.form.addEventListener('submit', () => { input.type = 'password'; });
      }
    });
  });