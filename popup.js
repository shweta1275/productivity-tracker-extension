// DayCheck Popup Script

let currentTab = 'sites';
let dayData = null;

// ── Utilities ────────────────────────────────────────────────────────────────
function fmtTime(seconds) {
  if (!seconds || seconds < 60) return seconds ? `${seconds}s` : '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
  return `${s}s`;
}

function fmtTimeShort(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`;
  return `${m}m`;
}

function fmtTimestamp(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function getFaviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

function getScore(summary) {
  let productive = 0, timepass = 0, neutral = 0, other = 0, total = 0;
  for (const d of Object.values(summary)) {
    total += d.seconds;
    if (d.category === 'productive') productive += d.seconds;
    else if (d.category === 'timepass') timepass += d.seconds;
    else if (d.category === 'neutral') neutral += d.seconds;
    else other += d.seconds;
  }
  if (total === 0) return { score: 0, productive, timepass, neutral, other, total };
  // Score = (productive / (productive + timepass)) * 100, neutral doesn't count either way
  const scored = productive + timepass;
  const score = scored === 0 ? 50 : Math.round((productive / scored) * 100);
  return { score, productive, timepass, neutral, other, total };
}

// ── Load data ────────────────────────────────────────────────────────────────
async function loadData() {
  // Flush current session first
  await chrome.runtime.sendMessage({ type: 'FLUSH_NOW' });

  const res = await chrome.runtime.sendMessage({ type: 'GET_TODAY' });
  dayData = res.data;

  // Update date badge
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  document.getElementById('dateBadge').textContent = new Date().toLocaleDateString('en-IN', opts);

  if (!dayData || !dayData.summary || Object.keys(dayData.summary).length === 0) {
    updateScore(null);
    renderEmpty();
    return;
  }

  const stats = getScore(dayData.summary);
  updateScore(stats);
  renderCurrentTab();
}

function updateScore(stats) {
  const numEl = document.getElementById('scoreNum');
  const verdictEl = document.getElementById('scoreVerdict');
  const subEl = document.getElementById('scoreSub');
  const ringsEl = document.getElementById('ringBars');

  if (!stats || stats.total === 0) {
    numEl.textContent = '—';
    numEl.className = 'score-number';
    verdictEl.textContent = 'No data yet today';
    subEl.textContent = 'Start browsing to track';
    ringsEl.innerHTML = '<div class="ring-bar rb-other" style="width:100%"></div>';
    return;
  }

  const { score, productive, timepass, neutral, other, total } = stats;
  numEl.textContent = score;
  numEl.className = `score-number ${score >= 65 ? 'high' : score >= 40 ? 'mid' : 'low'}`;

  if (score >= 80) { verdictEl.textContent = '🔥 Killing it today'; }
  else if (score >= 65) { verdictEl.textContent = '✅ Solid focus day'; }
  else if (score >= 45) { verdictEl.textContent = '⚖️ Mixed bag'; }
  else if (score >= 25) { verdictEl.textContent = '😬 Could be better'; }
  else { verdictEl.textContent = '📱 Mostly timepass lol'; }

  subEl.textContent = `${fmtTime(total)} total · ${fmtTime(productive)} work`;

  const pw = total > 0 ? (productive / total * 100).toFixed(1) : 0;
  const tw = total > 0 ? (timepass / total * 100).toFixed(1) : 0;
  const nw = total > 0 ? (neutral / total * 100).toFixed(1) : 0;
  const ow = total > 0 ? (other / total * 100).toFixed(1) : 0;

  ringsEl.innerHTML = `
    <div class="ring-bar rb-productive" style="width:${pw}%"></div>
    <div class="ring-bar rb-neutral" style="width:${nw}%"></div>
    <div class="ring-bar rb-timepass" style="width:${tw}%"></div>
    <div class="ring-bar rb-other" style="width:${ow}%"></div>
  `;
}

// ── Tab switch ───────────────────────────────────────────────────────────────
function switchTab(tab, btn) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCurrentTab();
}

function renderCurrentTab() {
  if (!dayData) { renderEmpty(); return; }
  if (currentTab === 'sites') renderSites();
  else if (currentTab === 'timeline') renderTimeline();
  else renderReality();
}

function renderEmpty() {
  document.getElementById('contentArea').innerHTML = `
    <div class="empty">
      <div class="empty-icon">👀</div>
      <div class="empty-text">No browsing data yet today.<br>Start using Chrome and I'll track your time.</div>
    </div>`;
}

// ── Sites tab ────────────────────────────────────────────────────────────────
function renderSites() {
  if (!dayData?.summary) { renderEmpty(); return; }

  const summary = dayData.summary;
  const cats = { productive: [], timepass: [], neutral: [], other: [] };
  let maxSeconds = 0;

  for (const [domain, info] of Object.entries(summary)) {
    const cat = info.category || 'other';
    cats[cat] = cats[cat] || [];
    cats[cat].push({ domain, ...info });
    if (info.seconds > maxSeconds) maxSeconds = info.seconds;
  }

  for (const c of Object.keys(cats)) {
    cats[c].sort((a, b) => b.seconds - a.seconds);
  }

  const catMeta = [
    { key: 'productive', label: 'Productive' },
    { key: 'timepass',   label: 'Timepass' },
    { key: 'neutral',    label: 'Neutral' },
    { key: 'other',      label: 'Other' },
  ];

  let html = '';
  for (const { key, label } of catMeta) {
    const sites = cats[key];
    if (!sites || sites.length === 0) continue;
    const catTotal = sites.reduce((s, x) => s + x.seconds, 0);

    html += `<div class="cat-block">
      <div class="cat-header">
        <div class="cat-dot ${key}"></div>
        <span class="cat-name ${key}">${label}</span>
        <span class="cat-total">${fmtTime(catTotal)}</span>
      </div>`;

    for (const site of sites.slice(0, 8)) {
      const pct = maxSeconds > 0 ? (site.seconds / maxSeconds * 100) : 0;
      const displayTitle = site.title && site.title !== site.domain
        ? site.title.replace(' - YouTube', '').replace(' | YouTube', '').substring(0, 50)
        : site.domain;
      html += `
      <div class="site-row">
        <img class="site-favicon" src="${getFaviconUrl(site.domain)}" onerror="this.style.display='none'">
        <div class="site-info">
          <div class="site-name">${displayTitle}</div>
          <div class="site-domain">${site.domain}${site.visits > 1 ? ` · ${site.visits} visits` : ''}</div>
          <div class="site-bar-wrap"><div class="site-bar ${key}" style="width:${pct}%"></div></div>
        </div>
        <div class="site-time">${fmtTimeShort(site.seconds)}</div>
      </div>`;
    }
    html += '</div>';
  }

  document.getElementById('contentArea').innerHTML = html || '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Nothing tracked yet.</div></div>';
}

// ── Timeline tab ─────────────────────────────────────────────────────────────
function renderTimeline() {
  if (!dayData?.sessions?.length) { renderEmpty(); return; }

  const sessions = [...dayData.sessions]
    .filter(s => s.seconds >= 3)
    .reverse()
    .slice(0, 60); // last 60 meaningful sessions

  let html = '';
  for (const s of sessions) {
    html += `
    <div class="timeline-item">
      <div class="tl-time">${fmtTimestamp(s.ts)}</div>
      <div class="tl-dot" style="background:${catColor(s.category)}"></div>
      <div class="tl-body">
        <div class="tl-title">${(s.title || s.domain).substring(0, 55)}</div>
        <div class="tl-domain">${s.domain}</div>
      </div>
      <div class="tl-dur">${fmtTimeShort(s.seconds)}</div>
    </div>`;
  }

  document.getElementById('contentArea').innerHTML = html;
}

function catColor(cat) {
  return { productive: '#4ade80', timepass: '#f87171', neutral: '#60a5fa', other: '#3a3944' }[cat] || '#3a3944';
}

// ── Reality Check tab ────────────────────────────────────────────────────────
function renderReality() {
  if (!dayData?.summary) { renderEmpty(); return; }

  const stats = getScore(dayData.summary);
  const { score, productive, timepass, neutral, other, total } = stats;

  // Build insight list
  const insights = [];

  // Find top productive site
  const prodSites = Object.entries(dayData.summary)
    .filter(([, v]) => v.category === 'productive')
    .sort(([, a], [, b]) => b.seconds - a.seconds);

  const tpSites = Object.entries(dayData.summary)
    .filter(([, v]) => v.category === 'timepass')
    .sort(([, a], [, b]) => b.seconds - a.seconds);

  if (prodSites.length > 0) {
    const [d, v] = prodSites[0];
    insights.push({ type: 'good', emoji: '💪', text: `Most time on <strong>${d}</strong> — ${fmtTime(v.seconds)}. That's your biggest win today.` });
  }

  if (score >= 70) {
    insights.push({ type: 'good', emoji: '🔥', text: `${score}% of your browsing was productive. Genuinely impressive.` });
  } else if (score >= 45) {
    insights.push({ type: 'info', emoji: '⚖️', text: `Focus score ${score}/100. You had a mixed day — some grind, some scroll.` });
  } else {
    insights.push({ type: 'bad', emoji: '📱', text: `Focus score ${score}/100. Timepass dominated today. Tomorrow you can fix this.` });
  }

  if (tpSites.length > 0) {
    const [d, v] = tpSites[0];
    const pct = total > 0 ? Math.round(v.seconds / total * 100) : 0;
    insights.push({ type: 'bad', emoji: '⏰', text: `<strong>${d}</strong> ate ${fmtTime(v.seconds)} (${pct}% of your day). Biggest time sink.` });
  }

  if (productive >= 3600) {
    insights.push({ type: 'good', emoji: '✅', text: `${fmtTime(productive)} of actual work done. More than most people manage.` });
  } else if (productive > 0) {
    insights.push({ type: 'info', emoji: '📚', text: `${fmtTime(productive)} of productive browsing tracked.` });
  } else {
    insights.push({ type: 'bad', emoji: '😶', text: `Zero productive sites visited today. Rough one.` });
  }

  // Check for LeetCode specifically
  const lc = dayData.summary['leetcode.com'];
  if (lc) insights.push({ type: 'good', emoji: '🧠', text: `You did LeetCode today (${fmtTime(lc.seconds)}). That's DSA prep checked off.` });

  // GitHub
  const gh = dayData.summary['github.com'];
  if (gh) insights.push({ type: 'good', emoji: '💻', text: `GitHub time: ${fmtTime(gh.seconds)}. Code was written (or at least browsed).` });

  // Total screen time warning
  if (total > 6 * 3600) {
    insights.push({ type: 'bad', emoji: '👀', text: `${fmtTime(total)} total screen time today. Your eyes need a break.` });
  }

  const insightsHtml = insights.map(i => `
    <div class="ach-item ${i.type}">
      <span class="ach-emoji">${i.emoji}</span>
      <span class="ach-text">${i.text}</span>
    </div>`).join('');

  const html = `
    <div class="reality-card">
      <div class="rc-title">📊 Today's Numbers</div>
      <div class="rc-stat-row">
        <span class="rc-stat-label">Total screen time</span>
        <span class="rc-stat-val y">${fmtTime(total)}</span>
      </div>
      <div class="rc-stat-row">
        <span class="rc-stat-label">Productive</span>
        <span class="rc-stat-val g">${fmtTime(productive)} (${total > 0 ? Math.round(productive/total*100) : 0}%)</span>
      </div>
      <div class="rc-stat-row">
        <span class="rc-stat-label">Timepass</span>
        <span class="rc-stat-val r">${fmtTime(timepass)} (${total > 0 ? Math.round(timepass/total*100) : 0}%)</span>
      </div>
      <div class="rc-stat-row">
        <span class="rc-stat-label">Neutral</span>
        <span class="rc-stat-val b">${fmtTime(neutral)}</span>
      </div>
      <div class="rc-stat-row">
        <span class="rc-stat-label">Sites visited</span>
        <span class="rc-stat-val y">${Object.keys(dayData.summary).length}</span>
      </div>
    </div>
    <div class="achievements">${insightsHtml}</div>`;

  document.getElementById('contentArea').innerHTML = html;
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById('settingsBtn').addEventListener('click', openOptions);
document.getElementById('refreshBtn').addEventListener('click', loadData);

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
});

loadData();
