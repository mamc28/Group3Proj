(() => {
  const container = document.getElementById('card-fields');
  const add = document.getElementById('add-card');
  const form = document.getElementById('create-set-form');
  if (!container || !add || !form) return;
  function renumber() {
    const cards = [...container.children];
    cards.forEach((card, index) => {
      card.querySelector('.card-number').textContent = index + 1;
      card.querySelector('.card-question').name = `cards[${index}][question]`;
      card.querySelector('.card-answer').name = `cards[${index}][answer]`;
      card.querySelector('.remove-card').hidden = cards.length === 1;
    });
    add.disabled = cards.length >= 100;
  }
  add.hidden = false;
  renumber();
  add.addEventListener('click', () => {
    if (container.children.length >= 100) return;
    const card = container.firstElementChild.cloneNode(true);
    card.querySelectorAll('textarea').forEach(input => { input.value = ''; });
    container.append(card);
    renumber();
    card.querySelector('textarea').focus();
  });
  container.addEventListener('click', event => {
    const button = event.target.closest('.remove-card');
    if (!button || container.children.length === 1) return;
    button.closest('.card-fields').remove();
    renumber();
    add.focus();
  });
  form.addEventListener('submit', () => {
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Saving…';
  });
})();
