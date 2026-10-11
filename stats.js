/* ---------------------------------------------------------------
   RoBlast stats page
   Reads data/stats.json (written by .github/workflows/stats.yml)
   and draws KPI tiles + Chart.js charts. "All games" adds each
   game's numbers together.
---------------------------------------------------------------- */
(() => {
  const PALETTE = ['#3ef3ff', '#b975ff', '#ff4fd8', '#5ef1a9', '#ffc857', '#6e89ff', '#ff7a59', '#9ef0ff'];
  const state = { data: null, game: 'all', range: 30 };
  const charts = {};

  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('en-GB');
  const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (v, digits = 0) => (Number.isFinite(v) ? (Math.abs(v) >= 10000 ? compact.format(v) : nf.format(Number(v.toFixed(digits)))) : '—');
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  const PLATFORM_LABELS = { Computer: 'PC', Phone: 'Phone', Tablet: 'Tablet', Console: 'Console', VR: 'VR' };
  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { regionNames = null; }
  const countryName = (code) => {
    try { return (regionNames && /^[A-Z]{2}$/.test(code) && regionNames.of(code)) || code; } catch { return code; }
  };

  /* ---- data helpers ------------------------------------------- */
  const toMap = (series = []) => new Map(series.map((p) => [p.d, p.v]));

  const isPlaceholder = (label) => /^RAQI_|^unknown$/i.test(String(label));

  // Display names come from games-data.js when available (Roblox titles can carry tags like "[NEW]").
  const localNames = new Map(
    (typeof ROBLAST_GAMES !== 'undefined' && Array.isArray(ROBLAST_GAMES) ? ROBLAST_GAMES : [])
      .map((game) => [String(game.placeId), game.name])
  );

  function usableGames() {
    return (state.data?.games || []).filter((g) => !g.noAccess && g.daily && Object.keys(g.daily).length);
  }

  // Showcase thresholds: quiet games and small records stay off the page.
  const MIN_SESSIONS = 100;
  const MIN_RECORD_CONCURRENT = 100;

  // Games with real activity inside the selected window.
  function activeGames(dates) {
    const cur = new Set(windowDates(dates, state.range));
    return usableGames().filter((g) => (g.daily.sessions || [])
      .reduce((total, p) => total + (cur.has(p.d) ? p.v : 0), 0) >= MIN_SESSIONS);
  }

  function selectedGames(dates) {
    const games = activeGames(dates);
    return state.game === 'all' ? games : games.filter((g) => g.universeId === state.game);
  }

  function allDates() {
    const set = new Set();
    usableGames().forEach((g) => Object.values(g.daily).forEach((s) => s.forEach((p) => set.add(p.d))));
    return [...set].sort();
  }

  function sumSeries(games, key) {
    const out = new Map();
    games.forEach((g) => (g.daily[key] || []).forEach((p) => out.set(p.d, (out.get(p.d) || 0) + p.v)));
    return out;
  }

  function windowDates(dates, days, offset = 0) {
    const end = dates.length - offset * days;
    return dates.slice(Math.max(0, end - days), Math.max(0, end));
  }

  const pick = (map, dates) => dates.map((d) => (map.has(d) ? map.get(d) : null));
  const valuesOf = (arr) => arr.filter((v) => Number.isFinite(v));
  const sum = (arr) => { const v = valuesOf(arr); return v.length ? v.reduce((a, b) => a + b, 0) : NaN; };
  const max = (arr) => { const v = valuesOf(arr); return v.length ? Math.max(...v) : NaN; };

  /* ---- KPI tiles ---------------------------------------------
     Showcase framing: totals, records and reach. Period-over-period
     changes are only shown when they're gains.
  ---------------------------------------------------------------- */
  function cumulative(values) {
    let total = 0;
    return values.map((v) => (total += Number.isFinite(v) ? v : 0));
  }

  function sparkline(values, color) {
    const v = values.map((x) => (Number.isFinite(x) ? x : null));
    const nums = valuesOf(v);
    if (nums.length < 2) return '';
    const lo = Math.min(...nums); const hi = Math.max(...nums); const span = hi - lo || 1;
    const pts = v.map((x, i) => (x === null ? null : `${(i / (v.length - 1)) * 100},${28 - ((x - lo) / span) * 24}`)).filter(Boolean);
    return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function gain(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return '';
    const change = ((current - previous) / previous) * 100;
    return change >= 1 ? `<span class="delta up">▲ ${change.toFixed(change >= 100 ? 0 : 1)}%</span>` : '';
  }

  function renderKpis(games, dates) {
    const cur = windowDates(dates, state.range);
    const prev = windowDates(dates, state.range, 1);
    const sessions = sumSeries(games, 'sessions');
    const hours = sumSeries(games, 'playtimeHours');
    const dau = sumSeries(games, 'dau');
    const peak = sumSeries(games, 'peakCcu');
    const mau = games.reduce((total, g) => {
      const latest = (g.daily.mau || []).slice(-1)[0];
      return total + (latest ? latest.v : 0);
    }, 0);
    const countries = new Set();
    games.forEach((g) => (g.countries || []).filter((c) => !isPlaceholder(c.label)).forEach((c) => countries.add(c.label)));
    // All-time public totals count every game (even ones without analytics access).
    const publicGames = state.game === 'all' ? (state.data.games || []) : games;
    const publicTotals = publicGames.reduce((acc, g) => {
      acc.visits += Number(g.public?.visits) || 0;
      acc.favorites += Number(g.public?.favorites) || 0;
      return acc;
    }, { visits: 0, favorites: 0 });

    const rangeLabel = `LAST ${state.range} DAYS`;
    const tiles = [
      { label: 'Monthly players', value: mau, note: 'LAST 30 DAYS' },
      { label: 'Sessions played', value: sum(pick(sessions, cur)), d: gain(sum(pick(sessions, cur)), sum(pick(sessions, prev))), note: rangeLabel, spark: cumulative(pick(sessions, cur)) },
      { label: 'Hours played', value: sum(pick(hours, cur)), d: gain(sum(pick(hours, cur)), sum(pick(hours, prev))), note: rangeLabel, spark: cumulative(pick(hours, cur)) },
      { label: 'Record day', value: max(pick(dau, dates)), note: 'PLAYERS IN ONE DAY' },
      { label: 'Record concurrent', value: max(pick(peak, dates)), min: MIN_RECORD_CONCURRENT, note: 'PLAYERS AT ONCE' },
      { label: 'Countries reached', value: countries.size, suffix: countries.size >= 100 ? '+' : '', note: 'LAST 30 DAYS' },
      { label: 'All-time visits', value: publicTotals.visits, note: 'ALL-TIME' },
      { label: 'Favourites', value: publicTotals.favorites, note: 'ALL-TIME' }
    ].filter((t) => Number.isFinite(t.value) && t.value > 0 && t.value >= (t.min || 0));

    // Pick a column count that fills rows evenly on desktop (e.g. 6 tiles -> 3 x 2).
    $('kpi-grid').style.setProperty('--cols', { 1: 1, 2: 2, 3: 3, 5: 3, 6: 3, 9: 3 }[tiles.length] || 4);
    $('kpi-grid').innerHTML = tiles.map((t, i) => `
      <div class="kpi hud-frame">
        <span class="kpi-label">${t.label}</span>
        <strong class="kpi-value">${fmt(t.value)}${t.suffix || ''}</strong>
        <div class="kpi-foot">${t.d || `<span class="delta flat">${t.note}</span>`}</div>
        ${t.spark ? sparkline(t.spark, PALETTE[i % PALETTE.length]) : ''}
      </div>`).join('');
  }

  /* ---- Charts ------------------------------------------------- */
  const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  function gradient(color) {
    return (context) => {
      const { ctx, chartArea } = context.chart;
      if (!chartArea) return `${color}33`;
      const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, `${color}66`);
      g.addColorStop(1, `${color}00`);
      return g;
    };
  }

  function draw(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), config);
  }

  function baseOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, padding: 14 } },
        tooltip: {
          backgroundColor: 'rgba(6,5,20,.94)', borderColor: 'rgba(62,243,255,.5)', borderWidth: 1,
          titleColor: '#3ef3ff', padding: 10, cornerRadius: 2,
          callbacks: { label: (c) => `${c.dataset.label}: ${nf.format(Math.round(c.parsed.y ?? c.parsed.x ?? c.parsed))}` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(62,243,255,.06)' }, ticks: { maxRotation: 0, autoSkipPadding: 16 } },
        y: { grid: { color: 'rgba(62,243,255,.08)' }, beginAtZero: true, ticks: { callback: (v) => compact.format(v) } }
      },
      ...extra
    };
  }

  function growthLine(id, label, values, labels, color) {
    draw(id, {
      type: 'line',
      data: { labels, datasets: [{ label, data: values, borderColor: color, backgroundColor: gradient(color), fill: 'origin', tension: 0.3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2.5 }] },
      options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } } })
    });
  }

  function renderCharts(games, dates) {
    const cur = windowDates(dates, state.range);
    const labels = cur.map(shortDate);
    const multi = games.length > 1;

    // Sessions played: running total, stacked by game so the top line is the studio total.
    const sessionOptions = baseOptions();
    sessionOptions.scales.y.stacked = multi;
    sessionOptions.plugins.legend.display = multi;
    draw('chart-sessions', {
      type: 'line',
      data: {
        labels,
        datasets: games.map((g, i) => {
          const color = PALETTE[usableGames().indexOf(g) % PALETTE.length];
          return {
            label: g.name, data: cumulative(pick(toMap(g.daily.sessions), cur)), borderColor: color,
            backgroundColor: multi ? `${color}55` : gradient(color), fill: multi ? (i === 0 ? 'origin' : '-1') : 'origin',
            tension: 0.3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2
          };
        })
      },
      options: sessionOptions
    });
    $('sessions-note').textContent = `Running total · ${state.range}D`;

    growthLine('chart-hours', 'Hours played', cumulative(pick(sumSeries(games, 'playtimeHours'), cur)), labels, '#3ef3ff');

    // New players gained (from the new vs returning breakdown, up to 30 days).
    const fresh = new Map();
    games.forEach((g) => Object.entries(g.newVsReturning || {}).forEach(([key, s]) => {
      if (!['true', 'new'].includes(String(key).toLowerCase())) return;
      s.forEach((p) => fresh.set(p.d, (fresh.get(p.d) || 0) + p.v));
    }));
    const freshDates = [...fresh.keys()].sort().slice(-Math.min(30, state.range));
    growthLine('chart-newplayers', 'New players', cumulative(pick(fresh, freshDates)), freshDates.map(shortDate), '#5ef1a9');

    // Platforms (doughnut).
    const platforms = new Map();
    games.forEach((g) => (g.platforms || []).filter((p) => !isPlaceholder(p.label)).forEach((p) => platforms.set(p.label, (platforms.get(p.label) || 0) + p.value)));
    const platformRows = [...platforms].sort((a, b) => b[1] - a[1]);
    const platformTotal = platformRows.reduce((s, [, v]) => s + v, 0) || 1;
    draw('chart-platforms', {
      type: 'doughnut',
      data: {
        labels: platformRows.map(([k]) => PLATFORM_LABELS[k] || k),
        datasets: [{ data: platformRows.map(([, v]) => v), backgroundColor: PALETTE, borderColor: '#0b0a20', borderWidth: 3, hoverOffset: 8 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { position: 'right', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, padding: 12 } },
          tooltip: { ...baseOptions().plugins.tooltip, callbacks: { label: (c) => `${c.label}: ${((c.parsed / platformTotal) * 100).toFixed(1)}%` } }
        }
      }
    });

    // Top countries (horizontal bars).
    const countries = new Map();
    games.forEach((g) => (g.countries || []).filter((p) => !isPlaceholder(p.label)).forEach((p) => countries.set(p.label, (countries.get(p.label) || 0) + p.value)));
    const countryRows = [...countries].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const countryOptions = baseOptions({ indexAxis: 'y' });
    countryOptions.plugins.legend = { display: false };
    countryOptions.plugins.tooltip.callbacks = { label: (c) => `${nf.format(Math.round(c.parsed.x))} player-days` };
    countryOptions.scales = {
      x: { grid: { color: 'rgba(62,243,255,.08)' }, beginAtZero: true, ticks: { callback: (v) => compact.format(v) } },
      y: { grid: { display: false } }
    };
    draw('chart-countries', {
      type: 'bar',
      data: {
        labels: countryRows.map(([k]) => countryName(k)),
        datasets: [{ label: 'Players', data: countryRows.map(([, v]) => v), backgroundColor: countryRows.map((_, i) => `${PALETTE[i % PALETTE.length]}bb`), borderRadius: 2 }]
      },
      options: countryOptions
    });
  }

  /* ---- Leaderboard ------------------------------------------- */
  function renderLeaderboard(dates) {
    const cur = windowDates(dates, state.range);
    const rows = activeGames(dates).map((g) => ({
      g,
      sessions: sum(pick(toMap(g.daily.sessions), cur)),
      hours: sum(pick(toMap(g.daily.playtimeHours), cur)),
      visits: g.public ? Number(g.public.visits) : NaN
    })).sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
    const top = Math.max(...rows.map((r) => r.sessions || 0), 1);
    $('board-note').textContent = `Last ${state.range} days`;
    $('leaderboard').innerHTML = `
      <div class="lb-row lb-head"><span>#</span><span>Game</span><span>Sessions</span><span>Hours</span><span>All-time visits</span></div>
      ${rows.map((r, i) => `
        <button class="lb-row${state.game === r.g.universeId ? ' active' : ''}" data-game="${esc(r.g.universeId)}">
          <span class="lb-rank">${String(i + 1).padStart(2, '0')}</span>
          <span class="lb-name">${esc(r.g.icon)} ${esc(r.g.name)}<i style="width:${((r.sessions || 0) / top) * 100}%;background:${PALETTE[usableGames().indexOf(r.g) % PALETTE.length]}"></i></span>
          <span>${fmt(r.sessions)}</span>
          <span>${fmt(r.hours)}</span>
          <span>${fmt(r.visits)}</span>
        </button>`).join('')}`;
  }

  /* ---- Controls ----------------------------------------------- */
  function renderPills(dates) {
    const games = activeGames(dates);
    $('game-pills').innerHTML = [
      `<button class="pill${state.game === 'all' ? ' active' : ''}" data-game="all">All games</button>`,
      ...games.map((g) => `<button class="pill${state.game === g.universeId ? ' active' : ''}" data-game="${esc(g.universeId)}">${esc(g.icon)} ${esc(g.name)}</button>`)
    ].join('');
    document.querySelectorAll('#range-pills .pill').forEach((b) => b.classList.toggle('active', Number(b.dataset.range) === state.range));
  }

  function render() {
    const dates = allDates();
    // A game that has no activity in the new range drops back to "All games".
    if (state.game !== 'all' && !activeGames(dates).some((g) => g.universeId === state.game)) state.game = 'all';
    const games = selectedGames(dates);
    renderPills(dates);
    renderKpis(games, dates);
    if (window.Chart) renderCharts(games, dates);
    renderLeaderboard(dates);
  }

  function timeAgo(isoTime) {
    const mins = Math.round((Date.now() - new Date(isoTime)) / 60000);
    if (!Number.isFinite(mins)) return 'unknown';
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  }

  document.addEventListener('click', (event) => {
    const gameBtn = event.target.closest('[data-game]');
    if (gameBtn && !gameBtn.disabled && state.data) {
      state.game = gameBtn.dataset.game === state.game && gameBtn.closest('#leaderboard') ? 'all' : gameBtn.dataset.game;
      render();
      return;
    }
    const rangeBtn = event.target.closest('[data-range]');
    if (rangeBtn && state.data) {
      state.range = Number(rangeBtn.dataset.range);
      render();
    }
  });

  async function init() {
    if (window.Chart) {
      Chart.defaults.color = '#a9b6d6';
      Chart.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif';
      Chart.defaults.font.size = 11;
      Chart.defaults.borderColor = 'rgba(62,243,255,.1)';
    }
    try {
      const response = await fetch('data/stats.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.data = await response.json();
      (state.data.games || []).forEach((g) => { g.name = localNames.get(String(g.placeId)) || g.name; });
      if (!usableGames().length) throw new Error('No usable games');
    } catch (error) {
      console.info('RoBlast stats unavailable:', error.message);
      $('sync-text').textContent = 'Awaiting first sync';
      $('sync-chip').classList.add('offline');
      $('stats-empty').hidden = false;
      return;
    }
    $('sync-text').textContent = `Synced ${timeAgo(state.data.generatedAt)}`;
    $('sync-chip').title = new Date(state.data.generatedAt).toLocaleString('en-GB');
    $('stats-controls').hidden = false;
    $('stats-content').hidden = false;
    render();
  }

  init();
})();
