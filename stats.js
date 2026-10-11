/* ---------------------------------------------------------------
   RoBlast stats page
   Reads data/stats.json (written by .github/workflows/stats.yml)
   and draws KPI tiles + Chart.js charts. "All games" adds each
   game's numbers together; rates are weighted by players.
---------------------------------------------------------------- */
(() => {
  const PALETTE = ['#3ef3ff', '#b975ff', '#ff4fd8', '#5ef1a9', '#ffc857', '#6e89ff', '#ff7a59', '#9ef0ff'];
  const state = { data: null, game: 'all', range: 30 };
  const charts = {};

  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('en-GB');
  const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (v, digits = 0) => (Number.isFinite(v) ? (Math.abs(v) >= 10000 ? compact.format(v) : nf.format(Number(v.toFixed(digits)))) : '—');
  const pct = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '—');
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  const PLATFORM_LABELS = { Computer: 'PC', Phone: 'Phone', Tablet: 'Tablet', Console: 'Console', VR: 'VR' };
  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { regionNames = null; }
  const countryName = (code) => {
    try { return (regionNames && /^[A-Z]{2}$/.test(code) && regionNames.of(code)) || code; } catch { return code; }
  };

  /* ---- data helpers ------------------------------------------- */
  const toMap = (series = []) => new Map(series.map((p) => [p.d, p.v]));

  // Retention may arrive as a fraction (0.18) or a percent (18): normalise to percent.
  function asPercent(series = []) {
    const max = Math.max(0, ...series.map((p) => p.v));
    return max <= 1 ? series.map((p) => ({ d: p.d, v: p.v * 100 })) : series;
  }

  function usableGames() {
    return (state.data?.games || []).filter((g) => !g.noAccess && g.daily && Object.keys(g.daily).length);
  }

  function selectedGames() {
    const games = usableGames();
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

  // Weighted daily average of `key` (e.g. retention) using `weightKey` (e.g. DAU).
  function weightedSeries(games, key, weightKey, transform = (s) => s) {
    const num = new Map();
    const den = new Map();
    games.forEach((g) => {
      const weights = toMap(g.daily[weightKey]);
      transform(g.daily[key] || []).forEach((p) => {
        const w = weights.get(p.d) || (games.length === 1 ? 1 : 0);
        if (!w) return;
        num.set(p.d, (num.get(p.d) || 0) + p.v * w);
        den.set(p.d, (den.get(p.d) || 0) + w);
      });
    });
    const out = new Map();
    num.forEach((v, d) => out.set(d, v / den.get(d)));
    return out;
  }

  function windowDates(dates, days, offset = 0) {
    const end = dates.length - offset * days;
    return dates.slice(Math.max(0, end - days), Math.max(0, end));
  }

  const pick = (map, dates) => dates.map((d) => (map.has(d) ? map.get(d) : null));
  const valuesOf = (arr) => arr.filter((v) => Number.isFinite(v));
  const avg = (arr) => { const v = valuesOf(arr); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  const sum = (arr) => { const v = valuesOf(arr); return v.length ? v.reduce((a, b) => a + b, 0) : NaN; };
  const max = (arr) => { const v = valuesOf(arr); return v.length ? Math.max(...v) : NaN; };

  function weightedAvg(valueMap, weightMap, dates) {
    let n = 0; let d = 0;
    dates.forEach((date) => {
      const v = valueMap.get(date); const w = weightMap.get(date) || 0;
      if (Number.isFinite(v) && w) { n += v * w; d += w; }
    });
    return d ? n / d : NaN;
  }

  /* ---- KPI tiles ---------------------------------------------- */
  function sparkline(values, color) {
    const v = values.map((x) => (Number.isFinite(x) ? x : null));
    const nums = valuesOf(v);
    if (nums.length < 2) return '';
    const lo = Math.min(...nums); const hi = Math.max(...nums); const span = hi - lo || 1;
    const pts = v.map((x, i) => (x === null ? null : `${(i / (v.length - 1)) * 100},${28 - ((x - lo) / span) * 24}`)).filter(Boolean);
    return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function delta(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return '';
    const change = ((current - previous) / Math.abs(previous)) * 100;
    const cls = change >= 0 ? 'up' : 'down';
    return `<span class="delta ${cls}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%</span>`;
  }

  function renderKpis(games, dates) {
    const cur = windowDates(dates, state.range);
    const prev = windowDates(dates, state.range, 1);
    const dau = sumSeries(games, 'dau');
    const sessions = sumSeries(games, 'sessions');
    const hours = sumSeries(games, 'playtimeHours');
    const sessionLen = weightedSeries(games, 'avgSessionMin', 'sessions');
    const d1 = weightedSeries(games, 'd1', 'dau', asPercent);
    const peak = sumSeries(games, 'peakCcu');

    const tiles = [
      { label: 'Avg daily players', value: fmt(avg(pick(dau, cur))), d: delta(avg(pick(dau, cur)), avg(pick(dau, prev))), spark: pick(dau, cur) },
      { label: 'Sessions', value: fmt(sum(pick(sessions, cur))), d: delta(sum(pick(sessions, cur)), sum(pick(sessions, prev))), spark: pick(sessions, cur) },
      { label: 'Hours played', value: fmt(sum(pick(hours, cur))), d: delta(sum(pick(hours, cur)), sum(pick(hours, prev))), spark: pick(hours, cur) },
      { label: 'Avg session', value: Number.isFinite(weightedAvg(sessionLen, sessions, cur)) ? `${weightedAvg(sessionLen, sessions, cur).toFixed(1)}m` : '—', d: delta(weightedAvg(sessionLen, sessions, cur), weightedAvg(sessionLen, sessions, prev)), spark: pick(sessionLen, cur) },
      { label: 'Day 1 retention', value: pct(weightedAvg(d1, dau, cur)), d: delta(weightedAvg(d1, dau, cur), weightedAvg(d1, dau, prev)), spark: pick(d1, cur) },
      { label: 'Peak concurrent', value: fmt(max(pick(peak, windowDates(dates, Math.min(state.range, 28))))), d: '', note: `${Math.min(state.range, 28)}D`, spark: pick(peak, windowDates(dates, Math.min(state.range, 28))) }
    ];

    const publicTotals = games.reduce((acc, g) => {
      if (g.public) {
        acc.visits += Number(g.public.visits) || 0;
        acc.favorites += Number(g.public.favorites) || 0;
        acc.playing += Number(g.public.playing) || 0;
        acc.any = true;
      }
      return acc;
    }, { visits: 0, favorites: 0, playing: 0, any: false });

    if (publicTotals.any) {
      tiles.push(
        { label: 'All-time visits', value: fmt(publicTotals.visits), d: '', note: 'ALL-TIME', spark: [] },
        { label: 'Favourites', value: fmt(publicTotals.favorites), d: '', note: 'ALL-TIME', spark: [] }
      );
    }

    $('kpi-grid').innerHTML = tiles.map((t, i) => `
      <div class="kpi hud-frame">
        <span class="kpi-label">${t.label}</span>
        <strong class="kpi-value">${t.value}</strong>
        <div class="kpi-foot">${t.d || `<span class="delta flat">${t.note || `${state.range}D`}</span>`}</div>
        ${sparkline(t.spark, PALETTE[i % PALETTE.length])}
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
      animation: { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, padding: 14 } },
        tooltip: {
          backgroundColor: 'rgba(6,5,20,.94)', borderColor: 'rgba(62,243,255,.5)', borderWidth: 1,
          titleColor: '#3ef3ff', padding: 10, cornerRadius: 2
        }
      },
      scales: {
        x: { grid: { color: 'rgba(62,243,255,.06)' }, ticks: { maxRotation: 0, autoSkipPadding: 16 } },
        y: { grid: { color: 'rgba(62,243,255,.08)' }, beginAtZero: true, ticks: { callback: (v) => compact.format(v) } }
      },
      ...extra
    };
  }

  function renderCharts(games, dates) {
    const cur = windowDates(dates, state.range);
    const labels = cur.map(shortDate);
    const multi = games.length > 1;

    // DAU: one stacked area per game, or a single glowing line.
    draw('chart-dau', {
      type: 'line',
      data: {
        labels,
        datasets: games.map((g, i) => {
          const color = PALETTE[usableGames().indexOf(g) % PALETTE.length];
          return {
            label: g.name, data: pick(toMap(g.daily.dau), cur), borderColor: color,
            backgroundColor: multi ? `${color}55` : gradient(color), fill: multi ? (i === 0 ? 'origin' : '-1') : 'origin',
            tension: 0.35, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2, spanGaps: true
          };
        })
      },
      options: baseOptions({ scales: { ...baseOptions().scales, y: { ...baseOptions().scales.y, stacked: multi } }, plugins: { ...baseOptions().plugins, legend: { display: multi, ...baseOptions().plugins.legend } } })
    });
    $('dau-note').textContent = multi ? 'Stacked by game' : '';

    // Sessions (bars) + hours played (line, right axis).
    const sessions = sumSeries(games, 'sessions');
    const hours = sumSeries(games, 'playtimeHours');
    const engagementOptions = baseOptions();
    engagementOptions.scales.y2 = { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { callback: (v) => `${compact.format(v)}h` } };
    draw('chart-engagement', {
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Sessions', data: pick(sessions, cur), backgroundColor: 'rgba(185,117,255,.55)', hoverBackgroundColor: '#b975ff', borderRadius: 2, yAxisID: 'y' },
          { type: 'line', label: 'Hours played', data: pick(hours, cur), borderColor: '#3ef3ff', backgroundColor: '#3ef3ff', tension: 0.35, pointRadius: 0, borderWidth: 2, yAxisID: 'y2', spanGaps: true }
        ]
      },
      options: engagementOptions
    });

    // Retention (percent).
    const dau = sumSeries(games, 'dau');
    const d1 = weightedSeries(games, 'd1', 'dau', asPercent);
    const d7 = weightedSeries(games, 'd7', 'dau', asPercent);
    const retentionOptions = baseOptions();
    retentionOptions.scales.y.ticks = { callback: (v) => `${v}%` };
    retentionOptions.plugins.tooltip.callbacks = { label: (c) => `${c.dataset.label}: ${pct(c.parsed.y)}` };
    draw('chart-retention', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Day 1', data: pick(d1, cur), borderColor: '#5ef1a9', backgroundColor: gradient('#5ef1a9'), fill: 'origin', tension: 0.35, pointRadius: 0, borderWidth: 2, spanGaps: true },
          { label: 'Day 7', data: pick(d7, cur), borderColor: '#ff4fd8', backgroundColor: '#ff4fd8', tension: 0.35, pointRadius: 0, borderWidth: 2, spanGaps: true }
        ]
      },
      options: retentionOptions
    });

    // New vs returning (stacked bars, last 30 days of data).
    const nr = { new: new Map(), returning: new Map() };
    games.forEach((g) => {
      Object.entries(g.newVsReturning || {}).forEach(([key, s]) => {
        const bucket = String(key).toLowerCase() === 'true' ? nr.new : nr.returning;
        s.forEach((p) => bucket.set(p.d, (bucket.get(p.d) || 0) + p.v));
      });
    });
    const nrDates = [...new Set([...nr.new.keys(), ...nr.returning.keys()])].sort().slice(-Math.min(30, state.range));
    const stackedOptions = baseOptions();
    stackedOptions.scales.x.stacked = true;
    stackedOptions.scales.y.stacked = true;
    draw('chart-newret', {
      type: 'bar',
      data: {
        labels: nrDates.map(shortDate),
        datasets: [
          { label: 'Returning', data: pick(nr.returning, nrDates), backgroundColor: 'rgba(110,137,255,.7)', borderRadius: 2 },
          { label: 'New', data: pick(nr.new, nrDates), backgroundColor: 'rgba(62,243,255,.75)', borderRadius: 2 }
        ]
      },
      options: stackedOptions
    });

    // Platforms (doughnut).
    const platforms = new Map();
    games.forEach((g) => (g.platforms || []).forEach((p) => platforms.set(p.label, (platforms.get(p.label) || 0) + p.value)));
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
    games.forEach((g) => (g.countries || []).forEach((p) => countries.set(p.label, (countries.get(p.label) || 0) + p.value)));
    const countryRows = [...countries].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const countryOptions = baseOptions({ indexAxis: 'y' });
    countryOptions.plugins.legend = { display: false };
    countryOptions.scales = {
      x: { grid: { color: 'rgba(62,243,255,.08)' }, beginAtZero: true, ticks: { callback: (v) => compact.format(v) } },
      y: { grid: { display: false } }
    };
    draw('chart-countries', {
      type: 'bar',
      data: {
        labels: countryRows.map(([k]) => countryName(k)),
        datasets: [{ label: 'Player-days', data: countryRows.map(([, v]) => v), backgroundColor: countryRows.map((_, i) => `${PALETTE[i % PALETTE.length]}bb`), borderRadius: 2 }]
      },
      options: countryOptions
    });
  }

  /* ---- Leaderboard ------------------------------------------- */
  function renderLeaderboard(dates) {
    const cur = windowDates(dates, state.range);
    const rows = usableGames().map((g) => {
      const dau = toMap(g.daily.dau);
      return {
        g,
        dau: avg(pick(dau, cur)),
        playtime: avg(pick(toMap(g.daily.avgPlaytimeMin), cur)),
        d1: weightedAvg(toMap(asPercent(g.daily.d1)), dau, cur),
        visits: g.public ? Number(g.public.visits) : NaN
      };
    }).sort((a, b) => (b.dau || 0) - (a.dau || 0));
    const top = Math.max(...rows.map((r) => r.dau || 0), 1);
    $('board-note').textContent = `Avg over ${state.range}D`;
    $('leaderboard').innerHTML = `
      <div class="lb-row lb-head"><span>#</span><span>Game</span><span>Players/day</span><span>Playtime</span><span>D1</span></div>
      ${rows.map((r, i) => `
        <button class="lb-row${state.game === r.g.universeId ? ' active' : ''}" data-game="${esc(r.g.universeId)}">
          <span class="lb-rank">${String(i + 1).padStart(2, '0')}</span>
          <span class="lb-name">${esc(r.g.icon)} ${esc(r.g.name)}<i style="width:${((r.dau || 0) / top) * 100}%;background:${PALETTE[usableGames().indexOf(r.g) % PALETTE.length]}"></i></span>
          <span>${fmt(r.dau)}</span>
          <span>${Number.isFinite(r.playtime) ? `${r.playtime.toFixed(1)}m` : '—'}</span>
          <span>${pct(r.d1)}</span>
        </button>`).join('')}`;
  }

  /* ---- Controls ----------------------------------------------- */
  function renderPills() {
    const games = state.data.games || [];
    $('game-pills').innerHTML = [
      `<button class="pill${state.game === 'all' ? ' active' : ''}" data-game="all">All games</button>`,
      ...games.map((g) => {
        const off = g.noAccess || !Object.keys(g.daily || {}).length;
        return `<button class="pill${state.game === g.universeId ? ' active' : ''}" data-game="${esc(g.universeId)}"${off ? ' disabled title="No analytics access for this game yet"' : ''}>${esc(g.icon)} ${esc(g.name)}</button>`;
      })
    ].join('');
    document.querySelectorAll('#range-pills .pill').forEach((b) => b.classList.toggle('active', Number(b.dataset.range) === state.range));
  }

  function render() {
    const games = selectedGames();
    const dates = allDates();
    renderPills();
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
