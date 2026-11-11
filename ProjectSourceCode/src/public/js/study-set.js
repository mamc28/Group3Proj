(() => {
  const session = document.querySelector('.study-session');
  const sources = [...document.querySelectorAll('[data-study-source]')];
  if (!session || !sources.length) return;

  const get = id => document.getElementById(`study-${id}`);
  const card = get('card');
  const front = card.querySelector('.study-front');
  const back = card.querySelector('.study-back');
  // Presentation state stays separate from future rating and scheduling logic.
  let index = 0;
  let flipped = false;

  function setSide(answerVisible) {
    flipped = answerVisible;
    card.classList.toggle('is-flipped', flipped);
    front.setAttribute('aria-hidden', String(flipped));
    back.setAttribute('aria-hidden', String(!flipped));
    front.inert = flipped;
    back.inert = !flipped;
    card.setAttribute('aria-label', flipped ? 'Show question' : 'Show answer');
    get('flip').textContent = flipped ? 'Show question' : 'Flip card';
  }

  function render() {
    // Reset without rotating the next card through the previous answer.
    card.classList.add('is-resetting');
    setSide(false);
    for (const side of ['question', 'answer']) {
      const content = sources[index].querySelector(`[data-${side}]`).cloneNode(true);
      content.querySelector('h2').remove();
      get(side).replaceChildren(...content.childNodes);
    }
    void card.offsetWidth;
    card.classList.remove('is-resetting');
    get('previous').disabled = index === 0;
    get('next').textContent = index === sources.length - 1 ? 'Finish review' : 'Next';
    get('count').textContent = `Card ${index + 1} of ${sources.length}`;
    get('progress').value = index;
    get('status').textContent = `Card ${index + 1} of ${sources.length}. Question shown.`;
  }

  function flip() {
    setSide(!flipped);
    get('status').textContent = `Card ${index + 1} of ${sources.length}. ${flipped ? 'Answer' : 'Question'} shown.`;
  }

  function next() {
    if (index < sources.length - 1) {
      index += 1;
      render();
    } else {
      get('review').hidden = true;
      get('complete').hidden = false;
      get('progress').value = sources.length;
      get('count').textContent = `${sources.length} cards reviewed`;
      get('status').textContent = 'Finished reviewing.';
      get('restart').focus();
    }
  }

  function previous() {
    if (index > 0) { index -= 1; render(); }
  }

  card.addEventListener('click', flip);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      flip();
    }
  });
  session.addEventListener('keydown', event => {
    if (get('review').hidden || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      if (event.key === 'ArrowRight') next(); else previous();
    }
  });
  get('flip').addEventListener('click', flip);
  get('previous').addEventListener('click', previous);
  get('next').addEventListener('click', next);
  get('restart').addEventListener('click', () => {
    index = 0;
    get('complete').hidden = true;
    get('review').hidden = false;
    render();
    card.focus();
  });
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

  render();
  document.getElementById('study-all-cards').open = false;
  session.hidden = false;
})();
