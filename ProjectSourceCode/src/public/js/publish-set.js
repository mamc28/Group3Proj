document.addEventListener('DOMContentLoaded', () => {
  const editForm = document.getElementById('create-set-form');
  const openButton = document.getElementById('open-publish-dialog');
  const dialog = document.getElementById('publish-dialog');
  const cancelButton = document.getElementById('cancel-publish');

  if (!editForm || !openButton || !dialog) return;

  let hasUnsavedChanges = false;

  editForm.addEventListener('input', () => {
    hasUnsavedChanges = true;
  });

  editForm.addEventListener('change', () => {
    hasUnsavedChanges = true;
  });

  openButton.addEventListener('click', () => {
    if (hasUnsavedChanges) {
      alert('Save your changes before publishing this set.');
      return;
    }

    dialog.showModal();
  });

  cancelButton.addEventListener('click', () => {
    dialog.close();
  });
});