// content.js
// Lightweight dark-UX detector + highlights + floating panel
// Immediately run wrapped function to avoid leaking variables
(function() {
  // prevent double-injection
  if (window.__duxInjected) return;
  window.__duxInjected = true;

  // Utility: smart selector for an element (best-effort)
  function getSimpleSelector(el) {
    if (!el) return null;
    if (el.id) return '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/)[0];
      if (cls) return el.tagName.toLowerCase() + '.' + cls;
    }
    return el.tagName.toLowerCase();
  }

  // Remove previous highlights/badges/panel
  function clearPrevious() {
    document.querySelectorAll('.dux-highlight').forEach(e => e.classList.remove('dux-highlight'));
    document.querySelectorAll('.dux-badge, #dux-panel').forEach(e => e.remove());
  }

  // Create a floating badge near an element's bounding rect
  function createBadgeFor(el, text, id) {
    try {
      const rect = el.getBoundingClientRect();
      const badge = document.createElement('div');
      badge.className = 'dux-badge';
      badge.textContent = text;
      badge.title = text;
      badge.dataset.duId = id || '';
      // position badge at top-right of element (fixed so it stays in view)
      const left = Math.min(window.innerWidth - 10, Math.max(6, rect.left + rect.width - 8));
      const top = Math.max(6, rect.top - 6);
      badge.style.left = (left + window.scrollX) + 'px';
      badge.style.top = (top + window.scrollY) + 'px';
      // clicking badge scrolls element into view
      badge.addEventListener('click', () => {
        el.scrollIntoView({behavior: 'smooth', block: 'center'});
        // flash (briefly add outline)
        el.classList.add('dux-highlight');
        setTimeout(()=> el.classList.remove('dux-highlight'), 2000);
      });
      document.body.appendChild(badge);
    } catch (e) {
      // ignore
    }
  }

  // Create floating panel with list of findings
  function createPanel(findings) {
    const panel = document.createElement('div');
    panel.id = 'dux-panel';
    const header = document.createElement('h4');
    header.textContent = 'Dark UX findings';
    panel.appendChild(header);

    if (!findings.length) {
      const none = document.createElement('div');
      none.textContent = 'No obvious issues found on this page.';
      none.className = 'du-item';
      panel.appendChild(none);
    } else {
      findings.forEach((f, i) => {
        const item = document.createElement('div');
        item.className = 'du-item';
        item.innerHTML = `<strong>${f.type}</strong> — ${f.summary || ''} <div class="du-ts">${new Date(f.timestamp).toLocaleString()}</div>`;
        item.addEventListener('click', () => {
          // bring the element into view using stored selector if possible
          let el = null;
          if (f.selector) el = document.querySelector(f.selector);
          if (!el && f.nodePath) { try { el = eval(f.nodePath); } catch(e){} }
          if (el) {
            el.scrollIntoView({behavior: 'smooth', block: 'center'});
            el.classList.add('dux-highlight');
            setTimeout(()=> el.classList.remove('dux-highlight'), 2000);
          } else {
            // fallback: open page in new tab and highlight not possible
            window.focus();
          }
        });
        panel.appendChild(item);
      });
    }

    // Add a close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.marginTop = '6px';
    closeBtn.addEventListener('click', () => panel.remove());
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);
  }

  // Save findings to chrome.storage.local and notify background
  function saveFindings(findings) {
    try {
      // store recent findings array (keep only latest 50)
      chrome.storage.local.get({darkux_findings: []}, (res) => {
        const arr = res.darkux_findings || [];
        arr.unshift({
          timestamp: Date.now(),
          url: location.href,
          findings
        });
        const limited = arr.slice(0, 50);
        chrome.storage.local.set({darkux_findings: limited});
      });
    } catch (e) {
      // In some contexts (like file://) chrome may be undefined; ignore
    }

    // also send message to background service worker for immediate handling
    try {
      chrome.runtime.sendMessage({action: 'scanResults', url: location.href, findings});
    } catch (e) {}
  }

  // Heuristics scanner - returns array of findings
  function runScanner() {
    clearPrevious();
    const findings = [];
    const ts = Date.now();

    // 1) Pre-checked checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach((cb, idx) => {
      // defaultChecked is true if the checkbox is checked by default in DOM
      if (cb.hasAttribute('checked') || cb.defaultChecked) {
        cb.classList.add('dux-highlight');
        const sel = getSimpleSelector(cb);
        createBadgeFor(cb, 'Pre-checked', `pre-${idx}`);
        findings.push({
          type: 'Pre-checked checkbox',
          summary: cb.closest('label') ? cb.closest('label').innerText.trim().slice(0,100) : '',
          selector: sel,
          timestamp: ts
        });
      }
    });

    // 2) Hidden or obscured "cancel" or "unsubscribe" links/buttons
    const cancelWords = ['cancel', 'unsubscribe', 'opt-out', 'stop subscription', 'manage subscription'];
    const candidates = Array.from(document.querySelectorAll('a, button, input, span, div'));
    candidates.forEach((el, idx) => {
      const txt = (el.innerText || el.value || '').toLowerCase().trim();
      if (!txt) return;
      for (const w of cancelWords) {
        if (txt.includes(w)) {
          const cs = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const hiddenish = (cs.display === 'none') || (cs.visibility === 'hidden') || (parseFloat(cs.opacity || '1') < 0.05) || (rect.width < 6) || (rect.height < 6) || (cs.pointerEvents === 'none');
          if (hiddenish) {
            el.classList.add('dux-highlight');
            createBadgeFor(el, 'Hidden cancel', `hidden-${idx}`);
            findings.push({
              type: 'Hidden cancel/unsubscribe',
              summary: txt.slice(0,120),
              selector: getSimpleSelector(el),
              timestamp: ts
            });
          }
        }
      }
    });

    // 3) Auto-renew / recurring-payment text detection
    const renewalPhrases = ['auto-renew', 'auto renew', 'recurring', 'will renew', 'renewal', 'renew automatically', 'automatic charge', 'charge automatically', 'recurring billing'];
    // scan common elements where text appears
    const textEls = Array.from(document.querySelectorAll('p, span, div, li, label, small'));
    textEls.forEach((el, idx) => {
      const txt = (el.innerText || '').toLowerCase().trim();
      if (!txt) return;
      for (const p of renewalPhrases) {
        if (txt.includes(p)) {
          const rect = el.getBoundingClientRect();
          // skip if it's clearly inside a tiny element that was already flagged as tiny disclaimer; we'll still flag
          el.classList.add('dux-highlight');
          createBadgeFor(el, 'Auto-renew text', `renew-${idx}`);
          findings.push({
            type: 'Auto-renew / recurring',
            summary: txt.slice(0,140),
            selector: getSimpleSelector(el),
            timestamp: ts
          });
          break;
        }
      }
    });

    // 4) Tiny disclaimers (very small font)
    textEls.forEach((el, idx) => {
      const cs = window.getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize || '12');
      if (fontSize > 0 && fontSize < 10) {
        el.classList.add('dux-highlight');
        createBadgeFor(el, 'Tiny disclaimer', `tiny-${idx}`);
        findings.push({
          type: 'Tiny disclaimer',
          summary: (el.innerText || '').slice(0,120),
          selector: getSimpleSelector(el),
          timestamp: ts
        });
      }
    });

    // 5) Vague CTAs (generic button labels that might hide a purchase)
    const vagueLabels = ['continue', 'next', 'submit', 'ok', 'accept', 'proceed'];
    document.querySelectorAll('button, input[type="button"], input[type="submit"], a').forEach((el, idx) => {
      const txt = (el.innerText || el.value || '').toLowerCase().trim();
      if (!txt) return;
      if (vagueLabels.includes(txt)) {
        // check if nearby (within same parent) there is text about charges
        const parent = el.parentElement;
        const nearby = parent ? (parent.innerText || '').toLowerCase() : '';
        const chargeWords = ['charge', 'subscription', 'free trial', 'auto-renew', 'billing', 'cost', 'fee'];
        const hasChargeNearby = chargeWords.some(w => nearby.includes(w));
        if (hasChargeNearby) {
          el.classList.add('dux-highlight');
          createBadgeFor(el, 'Vague CTA', `vague-${idx}`);
          findings.push({
            type: 'Vague CTA (possible hidden charge)',
            summary: txt + ' — nearby: ' + nearby.slice(0,90),
            selector: getSimpleSelector(el),
            timestamp: ts
          });
        }
      }
    });

    // Create floating panel and save
    createPanel(findings);
    saveFindings(findings);

    return findings;
  }

  // Run initially
  runScanner();

  // Listen for messages (popup can ask for rescan)
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action === 'rescan') {
        const results = runScanner();
        sendResponse({status: 'done', results});
      }
      // allow asynchronous response
      return true;
    });
  } catch (e) {
    // chrome not available in some contexts — ignore
  }
})();
