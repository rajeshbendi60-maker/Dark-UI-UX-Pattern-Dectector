// background.js (service worker)
console.log('Background service worker loaded.');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;
  if (msg.action === 'scanResults') {
    // Received scan results from content script; append/save to storage (keeps last 50)
    chrome.storage.local.get({darkux_findings: []}, (res) => {
      const arr = res.darkux_findings || [];
      arr.unshift({
        timestamp: Date.now(),
        url: msg.url,
        findings: msg.findings
      });
      chrome.storage.local.set({darkux_findings: arr.slice(0, 50)});
    });
  } else if (msg.action === 'getFindings') {
    // Popup asked for stored findings — reply with them
    chrome.storage.local.get({darkux_findings: []}, (res) => {
      sendResponse({status: 'ok', findings: res.darkux_findings || []});
    });
    // indicate async response
    return true;
  } else if (msg.action === 'clearFindings') {
    chrome.storage.local.set({darkux_findings: []}, () => sendResponse({status: 'cleared'}));
    return true;
  }
});
