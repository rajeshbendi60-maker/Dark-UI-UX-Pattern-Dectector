document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('list');
  const rescanBtn = document.getElementById('rescanBtn');
  const clearBtn = document.getElementById('clearBtn');

  function showLoading() { listEl.innerHTML = 'Loading…'; }

  function renderFindings(arr) {
    if (!arr || !arr.length) { listEl.innerHTML = '<div>No saved findings.</div>'; return; }
    listEl.innerHTML = '';
    arr.forEach(entry => {
      const wrapper = document.createElement('div');
      wrapper.className = 'finding';
      wrapper.innerHTML = `<strong>${entry.url}</strong><div class="ts">${new Date(entry.timestamp).toLocaleString()}</div>`;
      const ul = document.createElement('ul');
      (entry.findings || []).slice(0,3).forEach(f => {
        const li = document.createElement('li');
        li.textContent = f.type + (f.summary ? ' — ' + f.summary.slice(0,80) : '');
        ul.appendChild(li);
      });
      wrapper.appendChild(ul);
      wrapper.addEventListener('click', () => {
        chrome.tabs.create({active: true, url: entry.url});
      });
      listEl.appendChild(wrapper);
    });
  }

  function loadFindings() {
    showLoading();
    chrome.runtime.sendMessage({action: 'getFindings'}, (resp) => {
      if (resp && resp.findings) renderFindings(resp.findings);
      else listEl.innerHTML = 'Unable to load findings.';
    });
  }

  rescanBtn.addEventListener('click', () => {
    rescanBtn.textContent = 'Scanning…';
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0]) { rescanBtn.textContent = 'No active tab'; setTimeout(()=>rescanBtn.textContent='Rescan page',1500); return; }
      chrome.tabs.sendMessage(tabs[0].id, {action: 'rescan'}, (resp) => {
        rescanBtn.textContent = 'Rescan page';
        setTimeout(loadFindings, 800);
      });
    });
  });

  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({action: 'clearFindings'}, () => loadFindings());
  });

  loadFindings();
});
