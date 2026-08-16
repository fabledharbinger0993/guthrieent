// form-widget.js
// Popup submission form widget — drop-in for the Guthrie site
// Submits to /api/submit (Pages Function). No secrets in the browser.
// Builder panel removed — visitors see a clean form only.

(function () {
  'use strict';

  // --- Form config (edit here or load from backend) ---
  const CONFIG = {
    title: 'Booking & Submission',
    description: 'Fill out the details below and press submit.',
    fields: [
      { id: 'name', type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true },
      { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', required: true },
      { id: 'purpose', type: 'textarea', label: 'Purpose / Notes', placeholder: 'Tell us about the request', required: false },
      {
        id: 'options', type: 'checkbox', label: 'Preferences',
        options: [{ id: 'opt1', label: 'Option A' }, { id: 'opt2', label: 'Option B' }]
      },
    ],
  };

  // --- Inject styles ---
  const style = document.createElement('style');
  style.textContent = `
    .gf-open-btn{position:fixed;right:24px;bottom:24px;background:#0b84ff;color:#fff;border:none;
      padding:12px 20px;border-radius:999px;cursor:pointer;font-weight:600;font-size:15px;
      box-shadow:0 6px 18px rgba(11,132,255,.25);z-index:9998;transition:transform .15s}
    .gf-open-btn:hover{transform:scale(1.05)}
    .gf-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;
      background:rgba(0,0,0,.45);z-index:9999}
    .gf-overlay.show{display:flex}
    .gf-popup{background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(2,6,23,.15);
      width:95%;max-width:520px;max-height:86vh;overflow:auto;padding:28px;
      transform:translateY(20px);opacity:0;transition:all .18s ease}
    .gf-overlay.show .gf-popup{transform:none;opacity:1}
    .gf-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
    .gf-title{font-size:22px;font-weight:700;margin:0}
    .gf-desc{color:#6b7280;font-size:14px;margin-top:4px}
    .gf-close{background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;padding:0 4px;line-height:1}
    .gf-close:hover{color:#0f1722}
    .gf-field{margin-top:16px}
    .gf-field label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}
    .gf-field input[type=text],.gf-field input[type=email],.gf-field textarea{
      width:100%;padding:10px 12px;border:1px solid #e6e9ef;border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box}
    .gf-field textarea{min-height:100px;resize:vertical}
    .gf-field input:focus,.gf-field textarea:focus{outline:none;border-color:#0b84ff;box-shadow:0 0 0 3px rgba(11,132,255,.12)}
    .gf-field .gf-err{color:#ef4444;font-size:12px;margin-top:4px;display:none}
    .gf-checks{display:flex;flex-direction:column;gap:8px}
    .gf-checks label{font-weight:400;display:flex;align-items:center;gap:8px;cursor:pointer}
    .gf-actions{margin-top:24px;display:flex;gap:10px;align-items:center}
    .gf-submit{background:#0b84ff;color:#fff;border:none;padding:12px 24px;border-radius:10px;
      font-weight:600;cursor:pointer;font-size:15px}
    .gf-submit:hover{background:#0a66d3}
    .gf-submit:disabled{opacity:.6;cursor:not-allowed}
    .gf-success{background:#ecfdf5;color:#065f46;padding:14px;border-radius:8px;font-weight:600;margin-top:16px;display:none}
    .gf-error-msg{background:#fef2f2;color:#991b1b;padding:14px;border-radius:8px;font-weight:600;margin-top:16px;display:none}
    .gf-required{color:#ef4444}
    @media(max-width:600px){.gf-popup{padding:20px}}
  `;
  document.head.appendChild(style);

  // --- Build DOM ---
  const overlay = document.createElement('div');
  overlay.className = 'gf-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="gf-popup" role="dialog" aria-modal="true" aria-labelledby="gfTitle">
      <div class="gf-header">
        <div>
          <h2 class="gf-title" id="gfTitle">${esc(CONFIG.title)}</h2>
          <p class="gf-desc">${esc(CONFIG.description)}</p>
        </div>
        <button class="gf-close" aria-label="Close form">×</button>
      </div>
      <form id="gfForm" novalidate>
        <div id="gfFields"></div>
        <div class="gf-actions">
          <button type="submit" class="gf-submit">Submit</button>
        </div>
        <div class="gf-success" id="gfSuccess"></div>
        <div class="gf-error-msg" id="gfError"></div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const openBtn = document.createElement('button');
  openBtn.className = 'gf-open-btn';
  openBtn.textContent = 'Submit / Book';
  document.body.appendChild(openBtn);

  // --- Render fields ---
  const fieldsContainer = overlay.querySelector('#gfFields');
  CONFIG.fields.forEach(field => {
    const wrapper = document.createElement('div');
    wrapper.className = 'gf-field';
    wrapper.dataset.fieldId = field.id;

    const label = document.createElement('label');
    label.setAttribute('for', 'gf_' + field.id);
    label.innerHTML = esc(field.label) + (field.required ? ' <span class="gf-required">*</span>' : '');
    wrapper.appendChild(label);

    if (field.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.id = 'gf_' + field.id;
      ta.name = field.id;
      ta.placeholder = field.placeholder || '';
      if (field.required) ta.required = true;
      wrapper.appendChild(ta);
    } else if (field.type === 'checkbox') {
      const checks = document.createElement('div');
      checks.className = 'gf-checks';
      (field.options || []).forEach(opt => {
        const lbl = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = field.id;
        cb.value = opt.label;
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + opt.label));
        checks.appendChild(lbl);
      });
      wrapper.appendChild(checks);
    } else {
      const input = document.createElement('input');
      input.type = field.type;
      input.id = 'gf_' + field.id;
      input.name = field.id;
      input.placeholder = field.placeholder || '';
      if (field.required) input.required = true;
      wrapper.appendChild(input);
    }

    const errDiv = document.createElement('div');
    errDiv.className = 'gf-err';
    errDiv.id = 'gf_err_' + field.id;
    wrapper.appendChild(errDiv);

    fieldsContainer.appendChild(wrapper);
  });

  // --- Interactions ---
  const form = overlay.querySelector('#gfForm');
  const successDiv = overlay.querySelector('#gfSuccess');
  const errorDiv = overlay.querySelector('#gfError');

  function openPopup() {
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closePopup() {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', openPopup);
  overlay.querySelector('.gf-close').addEventListener('click', closePopup);
  overlay.addEventListener('click', e => { if (e.target === overlay) closePopup(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });

  // --- Collect form data ---
  function collectData() {
    const data = {};
    CONFIG.fields.forEach(field => {
      if (field.type === 'checkbox') {
        const checked = [...form.querySelectorAll(`input[name="${field.id}"]:checked`)].map(i => i.value);
        data[field.id] = checked;
      } else {
        data[field.id] = form.querySelector(`#gf_${field.id}`)?.value?.trim() || '';
      }
    });
    return data;
  }

  // --- Submit ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    successDiv.style.display = 'none';
    errorDiv.style.display = 'none';

    CONFIG.fields.forEach(f => {
      const err = overlay.querySelector('#gf_err_' + f.id);
      if (err) err.style.display = 'none';
    });

    const data = collectData();
    const submitBtn = form.querySelector('.gf-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (result.success) {
        successDiv.textContent = result.message || 'Submission received!';
        successDiv.style.display = 'block';
        form.reset();
        setTimeout(closePopup, 2500);
      } else if (result.errors) {
        Object.entries(result.errors).forEach(([field, msg]) => {
          const err = overlay.querySelector('#gf_err_' + field);
          if (err) { err.textContent = msg; err.style.display = 'block'; }
        });
      } else {
        errorDiv.textContent = result.error || 'Something went wrong. Please try again.';
        errorDiv.style.display = 'block';
      }
    } catch (err) {
      errorDiv.textContent = 'Network error. Please check your connection and try again.';
      errorDiv.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  });

  // --- HTML escape helper ---
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }
})();