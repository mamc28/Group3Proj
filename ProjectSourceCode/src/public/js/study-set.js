(() => {
  const session = document.querySelector('.study-session');
  const sources = new Map([...document.querySelectorAll('[data-study-source]')]
    .map(source => [Number(source.dataset.cardId), source]));
  if (!session || !sources.size) return;

  const get = id => document.getElementById(`study-${id}`);
  const card = get('card');
  const front = card.querySelector('.study-front');
  const back = card.querySelector('.study-back');
  const ratingButtons = [...session.querySelectorAll('[data-rating]')];
  const endpoint = `/decks/${session.dataset.deckId}/study`;
  let queue = [];
  let current = null;
  let flipped = false;
  let saving = false;
  let loading = false;
  let pending = null;
  let reviewed = 0;
  let refreshTimer;

  function showError(message = '') {
    get('error').textContent = message;
    get('error').hidden = !message;
  }

  function intervalLabel(seconds) {
    const number = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
    if (seconds < 3600) return `${number(seconds / 60)} min`;
    if (seconds < 86400) return `${number(seconds / 3600)} hr`;
    return `${number(seconds / 86400)} day${seconds === 86400 ? '' : 's'}`;
  }

  function reviewRequestId() {
    // getRandomValues also works when accessing a local dev server over plain HTTP.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function jsonRequest(url, options) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    if (response.redirected) throw new Error('Your session expired. Reload the page and sign in again.');
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.message || 'Unable to save your review. Please retry.');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function setSide(answerVisible) {
    flipped = answerVisible;
    card.classList.toggle('is-flipped', flipped);
    front.setAttribute('aria-hidden', String(flipped));
    back.setAttribute('aria-hidden', String(!flipped));
    front.inert = flipped;
    back.inert = !flipped;
    card.setAttribute('aria-label', flipped ? 'Show question' : 'Show answer');
    card.setAttribute('aria-describedby', `study-hint study-${flipped ? 'answer' : 'question'}`);
    get('flip').textContent = flipped ? 'Show question' : 'Flip card';
    get('ratings').hidden = !flipped;
  }

  function render() {
    current = queue[0];
    pending = null;
    get('review').hidden = false;
    get('complete').hidden = true;
    card.classList.add('is-resetting');
    setSide(false);
    for (const side of ['question', 'answer']) {
      const content = sources.get(current.card_id).querySelector(`[data-${side}]`).cloneNode(true);
      content.querySelector('h2').remove();
      get(side).replaceChildren(...content.childNodes);
    }
    void card.offsetWidth;
    card.classList.remove('is-resetting');
    for (const button of ratingButtons) {
      button.disabled = false;
      button.querySelector('span').textContent = intervalLabel(current.intervals[button.dataset.rating]);
    }
    get('flip').disabled = false;
    get('count').textContent = `${queue.length} due · ${reviewed} reviewed this visit`;
    get('progress').max = reviewed + queue.length;
    get('progress').value = reviewed;
    get('status').textContent = `${queue.length} cards due. Question shown.`;
  }

  async function loadQueue(moveFocus = false) {
    if (loading || saving) return;
    loading = true;
    clearTimeout(refreshTimer);
    showError();
    get('restart').disabled = true;
    try {
      const result = await jsonRequest(endpoint);
      // Newly added cards need a page reload to load their text and images.
      if (result.cards.some(item => !sources.has(item.card_id))) {
        throw new Error('This set has new cards. Reload the page to study the updated set.');
      }
      queue = result.cards.filter(item => item.due);
      if (queue.length) {
        render();
        if (moveFocus) card.focus();
      } else {
        current = null;
        get('review').hidden = true;
        get('complete').hidden = false;
        get('complete-title').textContent = 'All caught up for now';
        const next = result.cards.filter(item => item.next_review_at)
          .map(item => new Date(item.next_review_at)).sort((a, b) => a - b)[0];
        get('complete-description').textContent = next
          ? `Next review: ${next.toLocaleString()}. Due cards will appear here automatically.`
          : 'There are no cards to review. You can browse the set below.';
        get('count').textContent = `0 due · ${reviewed} reviewed this visit`;
        get('progress').max = Math.max(1, reviewed);
        get('progress').value = reviewed;
        get('status').textContent = get('complete-description').textContent;
        if (moveFocus) get('restart').focus();
        if (next) refreshTimer = setTimeout(() => loadQueue(), Math.min(60000, Math.max(1000, next - Date.now())));
      }
    } catch (error) {
      showError(error.message || 'Unable to load your review queue. Please try again.');
      // Keep a retry available, including if the first queue request fails.
      get('review').hidden = true;
      get('complete').hidden = false;
      get('complete-title').textContent = 'Review queue unavailable';
      get('complete-description').textContent = 'Check your connection and try again.';
    } finally {
      loading = false;
      get('restart').disabled = false;
    }
  }

  function flip() {
    if (!current || saving || loading || pending) return;
    setSide(!flipped);
    get('status').textContent = flipped ? 'Answer shown. Rate your recall to continue.' : 'Question shown.';
  }

  async function rate(rating) {
    if (!flipped || !current || saving || loading || (pending && pending.rating !== rating)) return;
    // Keep the same request ID on retry so a lost response cannot count twice.
    pending ||= {
      cardId: current.card_id, rating, requestId: reviewRequestId(),
      lastReviewedAt: current.last_reviewed_at,
      csrfToken: session.dataset.csrfToken,
    };
    saving = true;
    showError();
    session.setAttribute('aria-busy', 'true');
    get('flip').disabled = true;
    ratingButtons.forEach(button => { button.disabled = true; });
    try {
      await jsonRequest(`${endpoint}/reviews`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending),
      });
      reviewed += 1;
      pending = null;
      saving = false;
      // Refresh from persisted state, including cards that became due while studying.
      await loadQueue(true);
    } catch (error) {
      if (error.status === 409 || error.status === 404 || error.status === 400) {
        showError(error.message);
        pending = null;
        get('review').hidden = true;
        get('complete').hidden = false;
        get('complete-title').textContent = 'Reload your review queue';
        get('complete-description').textContent = 'The card changed. Check due cards to continue.';
        get('restart').focus();
      } else {
        showError(`${error.message || 'Unable to save your rating.'} Retry the same rating to continue.`);
        ratingButtons.forEach(button => { button.disabled = button.dataset.rating !== rating; });
        get('status').textContent = 'Rating not confirmed. Retry the same rating to continue.';
      }
    } finally {
      saving = false;
      session.removeAttribute('aria-busy');
    }
  }

  card.addEventListener('click', flip);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flip(); }
  });
  get('flip').addEventListener('click', flip);
  ratingButtons.forEach(button => button.addEventListener('click', () => rate(button.dataset.rating)));
  get('restart').addEventListener('click', () => loadQueue(true));
  const focusDialog = get('focus-dialog');
  const sessionMarker = document.createComment('study session position');
  session.before(sessionMarker);
  let nativeFullscreen = false;

  function restoreStudy() {
    sessionMarker.after(session);
    document.documentElement.classList.remove('study-focus-open');
    get('focus').hidden = false;
    get('exit').hidden = true;
    get('focus').focus();
  }

  async function exitFocus() {
    if (document.fullscreenElement === focusDialog) {
      try { await document.exitFullscreen(); } catch { /* The dialog can still close. */ }
    }
    if (focusDialog.open) focusDialog.close();
  }

  get('focus').addEventListener('click', () => {
    focusDialog.append(session);
    get('focus').hidden = true;
    get('exit').hidden = false;
    document.documentElement.classList.add('study-focus-open');
    focusDialog.showModal();
    get('exit').focus();
    // The modal remains a full-window study view if browser fullscreen is unavailable.
    if (focusDialog.requestFullscreen) {
      focusDialog.requestFullscreen().catch(() => {});
    }
  });
  get('exit').addEventListener('click', exitFocus);
  focusDialog.addEventListener('cancel', event => {
    event.preventDefault();
    exitFocus();
  });
  focusDialog.addEventListener('close', restoreStudy);
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === focusDialog) {
      nativeFullscreen = true;
    } else if (nativeFullscreen) {
      nativeFullscreen = false;
      if (focusDialog.open) focusDialog.close();
    }
  });

  document.getElementById('study-all-cards').open = false;
  session.hidden = false;
  loadQueue();
})();
