/* script.js
   - Works with optional socket.io server.
   - If no socket.io present, the demo simulates scanning results.
*/

const socket = (typeof io === 'function') ? io() : null;
let chart = null;
let monitoring = false;
let simulateTimer = null;

const startBtn = document.getElementById('scanBtn');
const stopBtn = document.getElementById('stopBtn');
const scoreValue = document.getElementById('scoreValue');
const scoreBar = document.getElementById('scoreBar');
const lastChecked = document.getElementById('lastChecked');
const issuesList = document.getElementById('issues');
const toasts = document.getElementById('toasts');
const critCountEl = document.getElementById('critCount');
const modCountEl = document.getElementById('modCount');
const safeCountEl = document.getElementById('safeCount');
const urlInput = document.getElementById('url');

/* Utility: update score display and progress */
function updateScoreDisplay(score) {
  scoreValue.innerText = score;
  scoreBar.style.width = `${Math.max(0, Math.min(100, score))}%`;
  if (score >= 70) {
    scoreBar.style.background = 'linear-gradient(90deg,#6F5EF8,#5AD3D1)';
    scoreValue.style.background = 'rgba(111,94,248,0.08)';
  } else if (score >= 40) {
    scoreBar.style.background = 'orange';
    scoreValue.style.background = 'rgba(255,165,0,0.06)';
  } else {
    scoreBar.style.background = 'red';
    scoreValue.style.background = 'rgba(255,0,80,0.04)';
  }
}

/* Toast / notification */
function pushToast(text, important = false) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerText = text;
  if (important) {
    el.style.borderColor = 'rgba(255,80,80,0.22)';
  }
  toasts.prepend(el);
  setTimeout(() => el.remove(), 6000);
}

/* Render issues with severity badges */
function renderIssues(issues) {
  issuesList.innerHTML = '';
  let crit = 0, mod = 0, safe = 0;

  if (!issues || !issues.length) {
    const li = document.createElement('li');
    li.innerText = '✅ No issues detected';
    li.className = 'badge safe';
    issuesList.appendChild(li);
    safeCountEl.innerText = 1;
    critCountEl.innerText = 0;
    modCountEl.innerText = 0;
    return;
  }

  issues.forEach((it, idx) => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.innerText = it.title || "Unknown issue";

    const badge = document.createElement('div');
    if (it.severity === 'critical') {
      badge.className = 'badge critical';
      badge.innerText = '❌ Critical';
      crit++;
    } else if (it.severity === 'moderate') {
      badge.className = 'badge moderate';
      badge.innerText = '⚠ Moderate';
      mod++;
    } else {
      badge.className = 'badge safe';
      badge.innerText = '✅ Safe';
      safe++;
    }

    li.appendChild(left);
    li.appendChild(badge);
    setTimeout(() => li.classList.add('show'), 20 + idx * 40);
    issuesList.appendChild(li);
  });

  critCountEl.innerText = crit;
  modCountEl.innerText = mod;
  safeCountEl.innerText = safe;
}

/* Chart: show rolling last 20 points */
function ensureChart() {
  if (chart) return;
  const ctx = document.getElementById('scoreChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Trust Score',
        data: [],
        borderColor: '#6F5EF8',
        tension: 0.2,
        fill: true,
        backgroundColor: 'rgba(111,94,248,0.08)',
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100 } },
      plugins: { legend: { display: false } }
    }
  });
}

/* Add new datapoint to chart */
function pushDataPoint(ts, score) {
  ensureChart();
  chart.data.labels.push(ts);
  chart.data.datasets[0].data.push(score);
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update('none');
}

/* Simulation (for demo if no socket server) */
function simulateScanCycle() {
  const ts = new Date().toLocaleTimeString();
  const base = Math.round(40 + Math.sin(Date.now() / 5000) * 25 + (Math.random() * 10 - 5));
  const score = Math.max(0, Math.min(100, base));
  const issues = [];

  if (score < 35) {
    issues.push({ title: 'Deceptive CTA placement', severity: 'critical' });
    issues.push({ title: 'Hard-to-find unsubscribe', severity: 'moderate' });
  } else if (score < 60) {
    issues.push({ title: 'Aggressive urgency banner', severity: 'moderate' });
    issues.push({ title: 'Pre-checked opt-in', severity: 'moderate' });
  } else {
    issues.push({ title: 'Clear pricing disclosure', severity: 'safe' });
  }

  publishUpdate({ timestamp: ts, score, issues });
}

/* Handle incoming update */
function publishUpdate(data) {
  if (!monitoring) return;
  updateScoreDisplay(data.score);
  lastChecked.innerText = data.timestamp || new Date().toLocaleTimeString();
  renderIssues(data.issues || []);

  pushDataPoint(data.timestamp || new Date().toLocaleTimeString(), data.score);

  if (data.score < 30) {
    pushToast(`Trust score dropped to ${data.score} — investigate immediately`, true);
  } else if ((data.issues || []).some(i => i.severity === 'critical')) {
    pushToast('Critical issue detected: ' + (data.issues.find(i => i.severity === 'critical')?.title || ''), true);
  }
}

/* Start/Stop control */
function startMonitoring(targetUrl) {
  if (monitoring) return;
  monitoring = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  pushToast('Monitoring started for ' + targetUrl);

  if (chart) { chart.destroy(); chart = null; }
  critCountEl.innerText = '0'; modCountEl.innerText = '0'; safeCountEl.innerText = '0';
  issuesList.innerHTML = '';

  if (socket) {
    socket.emit('startMonitoring', targetUrl);
  } else {
    simulateScanCycle();
    simulateTimer = setInterval(simulateScanCycle, 2500);
  }
}

function stopMonitoring() {
  if (!monitoring) return;
  monitoring = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  pushToast('Monitoring stopped');

  if (socket) {
    socket.emit('stopMonitoring');
  } else {
    clearInterval(simulateTimer);
  }
}

/* Optional sound alert */
function playAlert() {
  try {
    const oscCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = oscCtx.createOscillator();
    const g = oscCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 520;
    g.gain.value = 0.02;
    o.connect(g);
    g.connect(oscCtx.destination);
    o.start();
    setTimeout(() => { o.stop(); oscCtx.close(); }, 180);
  } catch (e) { }
}

/* Socket listener */
if (socket) {
  socket.on('connect', () => {
    pushToast('Connected to server (socket)');
  });
  socket.on('disconnect', () => {
    pushToast('Socket disconnected — demo simulation will run', true);
  });
  socket.on('update', (payload) => {
    publishUpdate(payload);
  });
}

/* wire UI */
startBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) return alert('Please enter a URL to scan');
  startMonitoring(url);
});
stopBtn.addEventListener('click', stopMonitoring);

document.getElementById('uploadFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  pushToast(`Uploaded file: ${f.name}`);
});

document.getElementById('askAi').addEventListener('click', () => {
  pushToast('AI Assistant: (demo) try "How to fix deceptive CTA?"');
});

/* Initial demo */
ensureChart();
publishUpdate({ 
  timestamp: new Date().toLocaleTimeString(), 
  score: 78, 
  issues: [{ title: 'Clear pricing disclosure', severity: 'safe' }] 
});
