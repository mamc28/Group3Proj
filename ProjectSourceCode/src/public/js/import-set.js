
document.addEventListener('DOMContentLoaded', () => {
    const openButton = document.getElementById('import-set-button');
    const dialog = document.getElementById('import-set-dialog');
    const fileInput = document.getElementById('import-set-file');

    const preview = document.getElementById('import-set-preview');
    const previewTitle = document.getElementById('import-preview-title');
    const previewDescription = document.getElementById('import-preview-description');
    const previewCount = document.getElementById('import-preview-count');
    const previewCards = document.getElementById('import-preview-cards');

    const status = document.getElementById('import-set-status');
    const cancelButton = document.getElementById('cancel-import-set');
    const confirmButton = document.getElementById('confirm-import-set');

    let importedData = null;

    // Open the import dialog.
    openButton.addEventListener('click', () => {
        fileInput.value = '';
        importedData = null;

        preview.hidden = true;
        previewCards.replaceChildren();
        status.textContent = ''; //safety measure to ensure that the file isn't treated as js or html
        confirmButton.disabled = true;

        dialog.showModal();
    });

    // Read and preview the selected JSON file.
    fileInput.addEventListener('change', async () => {
        importedData = null;
        confirmButton.disabled = true;
        preview.hidden = true;
        previewCards.replaceChildren();
        status.textContent = '';

        const file = fileInput.files[0];

        if (!file) return;

        // Allow a little room for Base64 expansion and JSON overhead.
        if (file.size > 12 * 1024 * 1024) {
            status.textContent = 'The selected file exceeds the 12 MB import limit.';
            return;
        }

        try {
            const fileText = await file.text();
            const data = JSON.parse(fileText);

            // Basic format checks. The server performs the full validation.
            if (
                !data ||
                data.format !== 'scramble-set' ||
                data.version !== 1 ||
                typeof data.title !== 'string' ||
                typeof data.description !== 'string' ||
                !Array.isArray(data.cards) ||
                data.cards.length < 1 ||
                data.cards.length > 100
            ) {
                throw new Error('This is not a supported Scramble set export.');
            }

            importedData = data;

            // Display set information.
            previewTitle.textContent = data.title;
            previewDescription.textContent =
                data.description || 'No description';

            previewCount.textContent =
                `${data.cards.length} cards`;

            // Display a preview of each card.
            data.cards.forEach((card, index) => {
                const item = document.createElement('li');

                const question = document.createElement('p');
                question.textContent = `Question: ${card.question}`;

                const answer = document.createElement('p');
                answer.textContent = `Answer: ${card.answer}`;

                const images = document.createElement('p');

                const hasFrontImage =
                    typeof card.image === 'string';

                const hasBackImage =
                    typeof card.backImage === 'string';

                if (hasFrontImage && hasBackImage) {
                    images.textContent = 'Front and back images included';
                } else if (hasFrontImage) {
                    images.textContent = 'Front image included';
                } else {
                    images.textContent = 'No images';
                }

                item.append(question, answer, images);
                previewCards.appendChild(item);
            });

            preview.hidden = false;
            confirmButton.disabled = false;

        } catch (error) {
            importedData = null;
            status.textContent =
                error.message || 'Unable to read the selected file.';
        }
    });

    // Submit the import after the user confirms.
    confirmButton.addEventListener('click', async () => {
        if (!importedData) return;

        confirmButton.disabled = true;
        fileInput.disabled = true;
        status.textContent = 'Importing set...';

        try {
            // Retrieve the session's CSRF token.
            const tokenResponse = await fetch('/decks/import-token');

            if (!tokenResponse.ok) {
                throw new Error('Unable to verify your session. Reload the page and try again.');
            }

            const tokenData = await tokenResponse.json();

            // Send the JSON file to the server.
            const response = await fetch('/decks/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-CSRF-Token': tokenData.csrfToken
                },
                body: JSON.stringify(importedData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Unable to import this set.');
            }

            // Open the newly created set.
            window.location.href = result.redirectUrl;

        } catch (error) {
            status.textContent =
                error.message || 'Something went wrong while importing the set.';

            confirmButton.disabled = false;
            fileInput.disabled = false;
        }
    });

    // Close the dialog without importing.
    cancelButton.addEventListener('click', () => {
        dialog.close();
    });
});
