/* ─────────────────────────────────────────────────────────────────────────
   Gig checklist — rendering + state. Reads window.GIG_GEAR /
   GIG_CABLE_RULES / GIG_NOTES from gear-data.js; edit that file to change
   what the app knows, not this one.

   State model, persisted to localStorage under STORAGE_KEY:
     {
       gigName: string,
       gigDate: string (yyyy-mm-dd),
       gigNotes: string,
       qty:    { [gearId]: number }   -- how many of each item you're bringing
       packed: { [gearId]: bool }     -- gear physically packed
       cabled: { [cableKey]: bool }   -- cable run physically packed
       choice: { [cableKey]: number } -- which option index picked, for
                                          cable rules with an either/or
     }
   ───────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const STORAGE_KEY = 'gigChecklist:v1';

  const defaultState = () => ({
    gigName: '',
    gigDate: '',
    gigNotes: '',
    qty: {},
    packed: {},
    cabled: {},
    choice: {},
  });

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {
      console.warn('gig checklist: failed to load saved state', e);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('gig checklist: failed to save state', e);
    }
  }

  function qty(id) {
    return state.qty[id] || 0;
  }

  // Stable key for a cable-rule line — used for its checkbox/choice state.
  // Index-based (not text-based) so renaming a `need` label later doesn't
  // silently reset everyone's saved "packed" checkmarks.
  function cableKey(sourceId, ruleIndex) {
    return `${sourceId}::${ruleIndex}`;
  }

  // ── Rendering ────────────────────────────────────────────────────────

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => {
      if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function renderGearSections() {
    const root = document.getElementById('gear-sections');
    root.innerHTML = '';

    Object.entries(window.GIG_GEAR).forEach(([groupId, group]) => {
      const card = el('div', { class: 'panel gear-group' });
      card.appendChild(el('h2', {}, [group.title]));

      const grid = el('div', { class: 'gear-grid' });
      group.items.forEach((item) => {
        const current = qty(item.id);
        const row = el('div', { class: 'gear-row' + (current > 0 ? ' active' : '') });

        const label = el('label', { class: 'gear-name' }, [
          el('input', {
            type: 'checkbox',
            'data-role': 'gear-include',
            'data-id': item.id,
            ...(current > 0 ? { checked: 'checked' } : {}),
          }),
          el('span', {}, [item.name]),
          el('span', { class: 'gear-sub' }, [item.sub]),
        ]);
        row.appendChild(label);

        const stepper = el('div', { class: 'stepper' }, [
          el('button', { type: 'button', 'data-role': 'qty-down', 'data-id': item.id }, ['−']),
          el('span', { class: 'qty-value', 'data-role': 'qty-value', 'data-id': item.id }, [String(current)]),
          el('button', { type: 'button', 'data-role': 'qty-up', 'data-id': item.id, 'data-max': item.max }, ['+']),
        ]);
        row.appendChild(stepper);

        const packLabel = el('label', { class: 'pack-check' }, [
          el('input', {
            type: 'checkbox',
            'data-role': 'gear-packed',
            'data-id': item.id,
            ...(state.packed[item.id] ? { checked: 'checked' } : {}),
            ...(current === 0 ? { disabled: 'disabled' } : {}),
          }),
          el('span', {}, ['Packed']),
        ]);
        row.appendChild(packLabel);

        grid.appendChild(row);
      });
      card.appendChild(grid);
      root.appendChild(card);
    });
  }

  function renderCables() {
    const root = document.getElementById('cable-sections');
    root.innerHTML = '';

    let anyRendered = false;

    window.GIG_CABLE_RULES.forEach((sourceRule) => {
      if (qty(sourceRule.sourceId) === 0) return;

      const lines = sourceRule.cables.filter((c) => c.when(qty));
      if (!lines.length) return;
      anyRendered = true;

      const card = el('div', { class: 'panel cable-group' });
      card.appendChild(el('h2', {}, [`Cables — ${sourceRule.sourceName}`]));

      lines.forEach((line) => {
        const idx = sourceRule.cables.indexOf(line);
        const key = cableKey(sourceRule.sourceId, idx);
        const count = line.count(qty);

        const row = el('div', { class: 'cable-row' });
        row.appendChild(el('div', { class: 'cable-need' }, [
          `${line.need} `,
          el('span', { class: 'cable-count' }, [`× ${count}`]),
        ]));

        if (line.fixed) {
          row.appendChild(el('label', { class: 'cable-check' }, [
            el('input', {
              type: 'checkbox',
              'data-role': 'cable-packed',
              'data-key': key,
              ...(state.cabled[key] ? { checked: 'checked' } : {}),
            }),
            el('span', {}, [line.fixed]),
          ]));
        } else if (line.options) {
          const chosen = state.choice[key];
          const optWrap = el('div', { class: 'cable-options' });
          line.options.forEach((opt, optIdx) => {
            optWrap.appendChild(el('label', { class: 'cable-option' }, [
              el('input', {
                type: 'radio',
                name: `choice-${key}`,
                'data-role': 'cable-choice',
                'data-key': key,
                value: String(optIdx),
                ...(chosen === optIdx ? { checked: 'checked' } : {}),
              }),
              el('span', {}, [opt]),
            ]));
          });
          row.appendChild(optWrap);

          row.appendChild(el('label', { class: 'cable-check' + (chosen === undefined ? ' disabled' : '') }, [
            el('input', {
              type: 'checkbox',
              'data-role': 'cable-packed',
              'data-key': key,
              ...(state.cabled[key] ? { checked: 'checked' } : {}),
              ...(chosen === undefined ? { disabled: 'disabled' } : {}),
            }),
            el('span', {}, ['Packed']),
          ]));
        }

        card.appendChild(row);
      });

      root.appendChild(card);
    });

    if (!anyRendered) {
      root.appendChild(el('p', { class: 'empty-note' }, [
        'Pick a mixer or all-in-one unit above (Alpha Theta Euphonia or AlphaTheta OMNIS-DUO) to see what cables it needs.',
      ]));
    }
  }

  function renderNotes() {
    const root = document.getElementById('notes-section');
    root.innerHTML = '';
    const active = window.GIG_NOTES.filter((n) => n.when(qty));
    if (!active.length) {
      root.style.display = 'none';
      return;
    }
    root.style.display = 'block';
    root.innerHTML = '';
    root.appendChild(el('h2', {}, ['Notes']));
    const list = el('ul', { class: 'note-list' });
    active.forEach((n) => list.appendChild(el('li', {}, [n.text])));
    root.appendChild(list);
  }

  function renderSummary() {
    const totalGear = Object.values(state.qty).reduce((a, b) => a + b, 0);
    const packedGear = Object.entries(state.qty)
      .filter(([id, n]) => n > 0 && state.packed[id]).length;
    const gearWithQty = Object.entries(state.qty).filter(([, n]) => n > 0).length;

    let cableTotal = 0;
    let cablePacked = 0;
    window.GIG_CABLE_RULES.forEach((sourceRule) => {
      if (qty(sourceRule.sourceId) === 0) return;
      sourceRule.cables.forEach((line, idx) => {
        if (!line.when(qty)) return;
        cableTotal++;
        const key = cableKey(sourceRule.sourceId, idx);
        if (state.cabled[key]) cablePacked++;
      });
    });

    document.getElementById('summary').textContent =
      `${totalGear} item${totalGear === 1 ? '' : 's'} across ${gearWithQty} gear line${gearWithQty === 1 ? '' : 's'} ` +
      `(${packedGear}/${gearWithQty} packed) · ${cableTotal} cable run${cableTotal === 1 ? '' : 's'} ` +
      `(${cablePacked}/${cableTotal} packed)`;
  }

  function renderAll() {
    document.getElementById('gig-name').value = state.gigName;
    document.getElementById('gig-date').value = state.gigDate;
    document.getElementById('gig-notes').value = state.gigNotes;
    renderGearSections();
    renderCables();
    renderNotes();
    renderSummary();
  }

  // ── Event wiring (delegated — the lists get rebuilt on every change) ──

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role="qty-up"], [data-role="qty-down"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const max = Number(btn.dataset.max || Infinity);
    const current = qty(id);
    if (btn.dataset.role === 'qty-up') {
      state.qty[id] = Math.min(max, current + 1);
    } else {
      state.qty[id] = Math.max(0, current - 1);
    }
    if (state.qty[id] === 0) {
      delete state.packed[id];
    }
    saveState();
    renderAll();
  });

  document.addEventListener('change', (e) => {
    const t = e.target;

    if (t.matches('[data-role="gear-include"]')) {
      const id = t.dataset.id;
      state.qty[id] = t.checked ? Math.max(1, qty(id)) : 0;
      if (!t.checked) delete state.packed[id];
      saveState();
      renderAll();
      return;
    }

    if (t.matches('[data-role="gear-packed"]')) {
      state.packed[t.dataset.id] = t.checked;
      saveState();
      renderSummary();
      return;
    }

    if (t.matches('[data-role="cable-packed"]')) {
      state.cabled[t.dataset.key] = t.checked;
      saveState();
      renderSummary();
      return;
    }

    if (t.matches('[data-role="cable-choice"]')) {
      state.choice[t.dataset.key] = Number(t.value);
      saveState();
      renderCables();
      renderSummary();
      return;
    }

    if (t.id === 'gig-name') { state.gigName = t.value; saveState(); return; }
    if (t.id === 'gig-date') { state.gigDate = t.value; saveState(); return; }
    if (t.id === 'gig-notes') { state.gigNotes = t.value; saveState(); return; }
  });

  document.getElementById('new-gig-btn').addEventListener('click', () => {
    if (!confirm('Start a new gig? This clears everything currently checked.')) return;
    state = defaultState();
    saveState();
    renderAll();
  });

  document.getElementById('print-btn').addEventListener('click', () => window.print());

  renderAll();
})();
