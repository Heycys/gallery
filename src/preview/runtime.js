// Preview runtime: injected at the top of every preview page by cli/preview.mjs.
// Gives the page the toolbar state (theme, width, its own options) and Gallery's tooltip, toast, confirm and menu,
// drawn with Gallery's own classes, so a page only writes what is new.
(() => {
  const listeners = new Set();
  let state = (() => { try { return { ...parent.__pvState }; } catch { return {}; } })();

  const ICON = {
    close: '<svg viewBox="0 0 20 20"><path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/></svg>',
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3.25v9.5M3.25 8h9.5"/></svg>',
    more: '<svg viewBox="0 0 16 16" class="fill"><circle cx="3.25" cy="8" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="12.75" cy="8" r="1.25"/></svg>',
    rename: '<svg viewBox="0 0 20 20"><path d="M12.75 4.25 15.75 7.25 7.5 15.5l-3.75.75.75-3.75z"/></svg>',
    duplicate: '<svg viewBox="0 0 20 20"><rect x="6.75" y="6.75" width="9.5" height="9.5" rx="1.75"/><path d="M13.25 6.75v-1.5a1.5 1.5 0 0 0-1.5-1.5h-6.5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 1.5 1.5h1.5"/></svg>',
    trash: '<svg viewBox="0 0 20 20"><path d="M3.75 5.75h12.5M8 5.75V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.25M5.25 5.75l.7 9.6a1.5 1.5 0 0 0 1.5 1.4h5.1a1.5 1.5 0 0 0 1.5-1.4l.7-9.6"/></svg>',
    folder: '<svg viewBox="0 0 24 24" class="lu"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" class="lu"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    file: '<svg viewBox="0 0 24 24" class="lu"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>',
    puzzle: '<svg viewBox="0 0 24 24" class="lu"><path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/></svg>',
    column: '<svg viewBox="0 0 24 24" class="lu"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>',
    window: '<svg viewBox="0 0 24 24" class="lu"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/></svg>',
    server: '<svg viewBox="0 0 24 24" class="lu"><rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/></svg>',
    bot: '<svg viewBox="0 0 24 24" class="lu"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>',
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function apply(next, key) {
    state = { ...state, ...next };
    document.documentElement.dataset.theme = state.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.style.colorScheme = state.theme === 'dark' ? 'dark' : 'light';
    for (const fn of listeners) fn(state, key);
  }
  addEventListener('message', e => { if (e.data?.pv === 'state') apply(e.data.state, e.data.key); });
  if (!state.theme) try { parent.postMessage({ pv: 'hello' }, '*'); } catch {}

  // Tooltip: Gallery shows one for any [data-tip] (data-tip-delay in ms, default 450).
  // Gone at once when the pointer presses, anything scrolls, the wheel turns, the window loses the focus, or the element is taken out, hidden or moved.
  let tipEl = null, tipTimer = 0, tipFrame = 0;
  const hideTip = () => { clearTimeout(tipTimer); cancelAnimationFrame(tipFrame); tipEl?.classList.remove('show'); };
  const tipGone = t => !t.isConnected || !t.getClientRects().length || getComputedStyle(t).visibility === 'hidden';
  document.addEventListener('mouseover', e => {
    const t = e.target.closest?.('[data-tip]');
    hideTip();
    if (!t || !t.dataset.tip || document.body.classList.contains('pv-dragging')) return;
    tipTimer = setTimeout(() => {
      if (tipGone(t)) return;
      tipEl ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'tip' }));
      tipEl.textContent = t.dataset.tip;
      const r = t.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      const y = r.bottom + 6 + h > innerHeight - 8 ? r.top - h - 6 : r.bottom + 6;
      tipEl.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
      tipEl.classList.add('show');
      const at = t.getBoundingClientRect();
      const watch = () => {
        const now = t.getBoundingClientRect();
        if (tipGone(t) || Math.abs(now.left - at.left) > 2 || Math.abs(now.top - at.top) > 2 || Math.abs(now.width - at.width) > 2 || Math.abs(now.height - at.height) > 2) hideTip();
        else tipFrame = requestAnimationFrame(watch);
      };
      tipFrame = requestAnimationFrame(watch);
    }, Number(t.dataset.tipDelay) || 450);
  });
  document.addEventListener('pointerdown', hideTip, true);
  addEventListener('scroll', hideTip, true);
  addEventListener('wheel', hideTip, { capture: true, passive: true });
  addEventListener('blur', hideTip);

  let toastTimer = 0;
  function toast(text, { action, onAction, tone } = {}) {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (tone === 'error' ? ' error' : '');
    t.setAttribute('role', 'status');
    t.innerHTML = '<span>' + esc(text) + '</span>' + (action ? '<button type="button">' + esc(action) + '</button>' : '');
    t.querySelector('button')?.addEventListener('click', () => { t.remove(); onAction?.(); });
    document.body.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 200); }, 4000);
  }

  let modal = null;
  function confirm({ title, message, actions = [{ id: 'cancel', label: '取消' }, { id: 'ok', label: '确定', primary: true }] }) {
    return new Promise(done => {
      modal?.end('cancel');
      const m = document.createElement('div');
      m.className = 'modal dialog-overlay';
      m.innerHTML = '<div class="dialog" role="alertdialog" aria-modal="true"><div class="dialog-title">' + esc(title) + '</div>' +
        (message ? '<div class="dialog-message">' + esc(message) + '</div>' : '') + '<div class="dialog-actions">' +
        actions.map(a => '<button type="button" class="dialog-btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '') + '" data-a="' + esc(a.id) + '">' + esc(a.label) + '</button>').join('') + '</div></div>';
      const back = document.activeElement;
      const end = id => { m.remove(); modal = null; back?.focus?.({ preventScroll: true }); done(id); };
      m.addEventListener('pointerdown', e => { if (e.target === m) end('cancel'); });
      m.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) end(b.dataset.a); });
      document.body.append(m);
      modal = { end };
      (m.querySelector('.primary') || m.querySelector('button')).focus();
    });
  }

  // items: { icon, label, danger, disabled, tip, run } or '-' for a line. Returns a function that closes it.
  let menuEl = null, menuAnchor = null, menuDone = null;
  function closeMenu() {
    if (!menuEl) return;
    menuEl.remove(); menuEl = null;
    menuAnchor?.classList.remove('pv-menu-open'); menuAnchor?.setAttribute?.('aria-expanded', 'false');
    const d = menuDone; menuAnchor = menuDone = null; d?.();
  }
  function menu(anchor, items, { align = 'start', onClose } = {}) {
    closeMenu(); hideTip();
    menuEl = document.createElement('div');
    menuEl.className = 'menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.style.zIndex = 1600;
    menuEl.innerHTML = items.filter(Boolean).map((it, i) => it === '-' ? '<div class="menu-sep"></div>' :
      '<div class="menu-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' off' : '') + '" role="menuitem" data-i="' + i + '"' +
      (it.disabled ? ' aria-disabled="true"' : '') + (it.tip ? ' data-tip="' + esc(it.tip) + '"' : '') + '>' +
      (it.icon ? '<span class="mi-icon">' + (ICON[it.icon] || it.icon) + '</span>' : '') + '<span class="mi-label">' + esc(it.label) + '</span></div>').join('');
    document.body.append(menuEl);
    const r = anchor.getBoundingClientRect(), w = menuEl.offsetWidth;
    menuEl.style.left = Math.max(8, Math.min(align === 'end' ? r.right - w : r.left, innerWidth - w - 8)) + 'px';
    menuEl.style.top = (r.bottom + 4 + menuEl.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - 4 - menuEl.offsetHeight) : r.bottom + 4) + 'px';
    menuAnchor = anchor; menuDone = onClose;
    anchor.classList.add('pv-menu-open'); anchor.setAttribute?.('aria-expanded', 'true');
    const list = items.filter(Boolean);
    menuEl.addEventListener('click', e => {
      const el = e.target.closest('.menu-item');
      if (!el || el.classList.contains('off')) return;
      const it = list[el.dataset.i];
      closeMenu();
      it.run?.();
    });
    return closeMenu;
  }
  document.addEventListener('pointerdown', e => {
    if (menuEl && !menuEl.contains(e.target) && !menuAnchor?.contains(e.target)) closeMenu();
  }, true);
  // Escape closes what is on top first: the confirm, then the menu; only then does the page see it.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (modal) { e.stopImmediatePropagation(); e.preventDefault(); modal.end('cancel'); }
    else if (menuEl) { e.stopImmediatePropagation(); e.preventDefault(); const a = menuAnchor; closeMenu(); a?.focus?.({ preventScroll: true }); }
  }, true);

  // A Gallery window behind the page's dialog: <body data-backdrop="gallery">.
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.backdrop !== 'gallery') return;
    const b = document.createElement('div');
    b.className = 'pv-backdrop';
    b.setAttribute('aria-hidden', 'true');
    b.innerHTML = '<div class="pv-backdrop-side"><i style="width:40%"></i><i style="width:70%"></i><i style="width:55%"></i><i style="width:80%"></i><i style="width:62%"></i></div>' +
      '<div class="pv-backdrop-main"><i style="width:36%;height:22px"></i><i style="width:90%"></i><i style="width:84%"></i><i style="width:72%"></i></div>';
    document.body.prepend(b);
  });
  const style = document.createElement('style');
  style.textContent = 'body{margin:0;font-family:var(--font);font-size:14px;background:var(--bacPri);color:var(--texPri)}' +
    '.pv-backdrop{position:fixed;inset:0;display:flex}.pv-backdrop-side{width:270px;flex:none;box-sizing:border-box;background:var(--sidBac);padding:56px 16px;display:flex;flex-direction:column;gap:16px}' +
    '.pv-backdrop-main{flex:1;min-width:0;padding:72px 64px;display:flex;flex-direction:column;gap:18px}.pv-backdrop i{display:block;height:10px;border-radius:5px;background:var(--bacTerTra)}' +
    '@media (max-width:700px){.pv-backdrop-side{display:none}}';
  document.head.prepend(style);

  window.preview = {
    get config() { try { return JSON.parse(document.getElementById('preview-config')?.textContent || '{}'); } catch { return {}; } },
    get state() { return state; },
    on(fn) { listeners.add(fn); fn(state, null); return () => listeners.delete(fn); },
    set(next) { try { parent.postMessage({ pv: 'set', state: next }, '*'); } catch {} },
    toast, confirm, menu, closeMenu, hideTip, icon: ICON, esc,
  };
  apply({});
})();
