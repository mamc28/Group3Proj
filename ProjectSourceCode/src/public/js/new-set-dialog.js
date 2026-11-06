(() => {
  const dialog = document.getElementById('new-set-dialog');
  const open = document.getElementById('open-create-set');
  const cancel = document.getElementById('cancel-create-set');
  const title = document.getElementById('new-set-title');
  if (!dialog || !open || !cancel || typeof dialog.showModal !== 'function') return;

  let closing = false;
  function closeDialog() {
    if (closing || !dialog.open) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close();
      return;
    }
    closing = true;
    dialog.classList.add('is-closing');
    let fallback;
    function finish(event) {
      if (event && (event.target !== dialog || event.animationName !== 'set-dialog-out')) return;
      clearTimeout(fallback);
      dialog.removeEventListener('animationend', finish);
      dialog.close();
      dialog.classList.remove('is-closing');
      closing = false;
    }
    dialog.addEventListener('animationend', finish);
    // Also finish if animations are disabled or interrupted.
    fallback = setTimeout(finish, 250);
  }

  open.addEventListener('click', event => {
    event.preventDefault();
    if (!dialog.open) dialog.showModal();
  });
  cancel.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog &&
        (event.clientX < bounds.left || event.clientX > bounds.right ||
         event.clientY < bounds.top || event.clientY > bounds.bottom)) closeDialog();
  });
  title.addEventListener('input', () => {
    title.setCustomValidity(title.value.trim() ? '' : 'Enter a name for your set.');
  });
})();
