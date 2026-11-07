(() => {
  const container = document.getElementById('card-fields');
  const add = document.getElementById('add-card');
  const form = document.getElementById('create-set-form');
  if (!container || !add || !form) return;
  function renumber() {
    const cards = [...container.children];
    cards.forEach((card, index) => {
      card.querySelector('.card-number').textContent = index + 1;
      card.querySelector('.card-id').name = `cards[${index}][card_id]`;
      card.querySelector('.card-question').name = `cards[${index}][question]`;
      card.querySelector('.card-front-type').name = `cards[${index}][frontType]`;
      card.querySelector('.card-image-data').name = `cards[${index}][image]`;
      card.querySelector('.card-back-image-data').name = `cards[${index}][backImage]`;
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
    card.querySelector('.card-id').value = '';
    card.querySelectorAll('textarea').forEach(input => { input.value = ''; });
    card.querySelector('.card-front-type').value = 'text';
    card.querySelectorAll('.card-image-fields').forEach(group => {
      group.hidden = true;
      group.querySelector('.card-image-file').value = '';
      group.querySelector('.card-image-file').disabled = false;
      group.querySelector('.card-image-data').value = '';
      group.querySelector('.card-image-preview').removeAttribute('src');
      group.querySelector('.card-image-preview').hidden = true;
      group.querySelector('.card-image-error').textContent = '';
    });
    card.querySelector('.card-question-label').textContent = 'Front';
    card.querySelector('.card-answer-label').textContent = 'Back';
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
  container.addEventListener('change', event => {
    const card = event.target.closest('.card-fields');
    if (!card) return;
    if (event.target.matches('.card-front-type')) {
      const isImage = ['image', 'image-text', 'image-both'].includes(event.target.value);
      card.querySelector('.card-front-image-fields').hidden = !isImage;
      card.querySelector('.card-question-label').textContent = ['image-text', 'image-both'].includes(event.target.value) ? 'Front text' : isImage ? 'Image description' : 'Front';
      card.querySelector('.card-back-image-fields').hidden = event.target.value !== 'image-both';
      card.querySelector('.card-answer-label').textContent = event.target.value === 'image-both' ? 'Back text' : 'Back';
      return;
    }
    if (!event.target.matches('.card-image-file')) return;
    const fileInput = event.target;
    const group = fileInput.closest('.card-image-fields');
    const data = group.querySelector('.card-image-data');
    const preview = group.querySelector('.card-image-preview');
    const error = group.querySelector('.card-image-error');
    data.value = '';
    preview.removeAttribute('src');
    preview.hidden = true;
    error.textContent = '';
    const file = fileInput.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      error.textContent = 'Choose a PNG, JPEG, or WebP image up to 2 MB.';
      fileInput.value = '';
      return;
    }
    fileInput.disabled = true;
    const reader = new FileReader();
    reader.onload = () => {
      data.value = reader.result;
      preview.src = reader.result;
      preview.hidden = false;
    };
    reader.onerror = () => { error.textContent = 'Unable to read the image. Please choose it again.'; };
    reader.onloadend = () => { fileInput.disabled = false; };
    reader.readAsDataURL(file);
  });
  form.addEventListener('submit', event => {
    const imageGroups = [...container.children].flatMap(card => {
      const type = card.querySelector('.card-front-type').value;
      if (type === 'text') return [];
      const groups = [card.querySelector('.card-front-image-fields')];
      if (type === 'image-both') groups.push(card.querySelector('.card-back-image-fields'));
      return groups;
    });
    let invalid = false;
    imageGroups.forEach(group => {
      if (!group.querySelector('.card-image-data').value || group.querySelector('.card-image-file').disabled) {
        group.querySelector('.card-image-error').textContent = 'Choose an image and wait for its preview before saving.';
        invalid = true;
      }
    });
    if (invalid) { event.preventDefault(); return; }

    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Saving…';
  });
})();
