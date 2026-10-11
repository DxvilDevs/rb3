#!/usr/bin/env node
/*
  RoBlast stats sync
  ------------------
  Runs in GitHub Actions (.github/workflows/stats.yml). Reads every game from
  games-data.js, resolves its universe ID from the place ID, queries the Roblox
  Open Cloud Analytics Query API with ROBLOX_API_KEY and writes data/stats.json
  for stats.html to chart.

  The page is a public showcase, so only growth/reach metrics are fetched
  (players, sessions, hours played, records, reach). Revenue, retention and
  session-length figures are deliberately left out of the public data file.

  Env:
    ROBLOX_API_KEY   Open Cloud key with universe.analytics:read (required)
    STATS_DAYS       days of daily history to keep (default 90)
    ROBLOX_APIS      override for https://apis.roblox.com (testing only)
    ROBLOX_GAMES     override for https://games.roblox.com (testing only)
    STATS_POST_GAP_MS  pause between analytics queries (testing only)
*/
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APIS = process.env.ROBLOX_APIS || 'https://apis.roblox.com';
const GAMES_API = process.env.ROBLOX_GAMES || 'https://games.roblox.com';
const API_KEY = process.env.ROBLOX_API_KEY;
const DAYS = Math.max(7, Math.min(365, Number(process.env.STATS_DAYS) || 90));
const BREAKDOWN_DAYS = 30;
const PERFORMANCE_DAYS = 28; // Roblox keeps performance metrics for 28 days.

// The Analytics API allows 30 query POSTs per minute per key owner.
const MIN_POST_GAP_MS = Number(process.env.STATS_POST_GAP_MS) || 2100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dayStart(offsetDays) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const ymd = (time) => String(time).slice(0, 10);
const round = (value, places = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

async function loadGames() {
  const code = await readFile(join(root, 'games-data.js'), 'utf8');
  const context = {};
  vm.runInNewContext(`${code}\nthis.__games = ROBLAST_GAMES;`, context);
  const games = Array.isArray(context.__games) ? context.__games : [];
  // De-duplicate by place ID, same as the site does.
  return [...new Map(games.map((game) => [String(game.placeId), game])).values()];
}

async function getJson(url, options = {}, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      if (attempt === attempts) throw error;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }

    const retryable = response.status === 429 || response.status >= 500;
    // 429 with code 3000 is the data point budget, not a rate limit: don't retry.
    const budget = response.status === 429 && body?.error?.code === 3000;
    if (retryable && !budget && attempt < attempts) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    return { status: response.status, body, text };
  }
  return { status: 0, body: null, text: '' };
}

async function resolveUniverseId(game) {
  if (game.universeId) return String(game.universeId);
  const { status, body } = await getJson(
    `${APIS}/universes/v1/places/${encodeURIComponent(game.placeId)}/universe`
  );
  if (status === 200 && body?.universeId) return String(body.universeId);
  throw new Error(`Could not resolve universe ID for place ${game.placeId} (HTTP ${status})`);
}

async function fetchPublicDetails(universeIds) {
  if (!universeIds.length) return new Map();
  const { status, body } = await getJson(
    `${GAMES_API}/v1/games?universeIds=${universeIds.map(encodeURIComponent).join(',')}`
  );
  const map = new Map();
  if (status === 200 && Array.isArray(body?.data)) {
    for (const entry of body.data) map.set(String(entry.id), entry);
  }
  return map;
}

let lastPostAt = 0;

async function queryMetric(universeId, request) {
  const wait = lastPostAt + MIN_POST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastPostAt = Date.now();

  const headers = { 'x-api-key': API_KEY, 'Content-Type': 'application/json' };
  let { status, body, text } = await getJson(
    `${APIS}/analytics-query-api/v1/universes/${encodeURIComponent(universeId)}/metrics`,
    { method: 'POST', headers, body: JSON.stringify(request) }
  );

  // Long-running operation: poll the returned path until done.
  for (let poll = 0; body && body.done === false && body.path && poll < 40; poll += 1) {
    await sleep(Math.min(1000 * 1.5 ** poll, 8000));
    ({ status, body, text } = await getJson(
      `${APIS}/analytics-query-api/${body.path}`,
      { headers: { 'x-api-key': API_KEY } }
    ));
  }

  if (body?.done && body.response) return body.response;
  const reason = body?.error
    ? `${body.error.code}: ${body.error.message}`
    : `HTTP ${status}${text ? ` ${text.slice(0, 160)}` : ''}`;
  const error = new Error(`${request.metric} ${reason}`);
  error.status = status;
  throw error;
}

function series(response) {
  const values = response?.values?.[0]?.dataPoints || [];
  return values
    .filter((point) => point.status !== 'NotStatisticallySignificant')
    .map((point) => ({ d: ymd(point.time), v: round(point.value, 4) }))
    .filter((point) => point.v !== null);
}

// Roblox uses placeholder values such as RAQI_RESERVED_DIMENSION_VALUES_UNKNOWN.
const isPlaceholder = (label) => /^RAQI_|^unknown$/i.test(String(label));

function breakdownTotals(response) {
  return (response?.values || [])
    .map((entry) => {
      const key = entry.breakdowns?.[0];
      const value = round(entry.dataPoints?.reduce((sum, p) => sum + (Number(p.value) || 0), 0), 2);
      return { label: key?.displayValue || key?.value || 'Unknown', value };
    })
    .filter((entry) => entry.value !== null && !isPlaceholder(entry.label))
    .sort((a, b) => b.value - a.value);
}

function breakdownSeries(response) {
  const out = {};
  for (const entry of response?.values || []) {
    const key = entry.breakdowns?.[0];
    if (isPlaceholder(key?.value ?? 'Unknown')) continue;
    out[String(key.value)] = (entry.dataPoints || [])
      .map((point) => ({ d: ymd(point.time), v: round(point.value, 4) }))
      .filter((point) => point.v !== null);
  }
  return out;
}

// Where each job's result lives on the game record, for carrying values forward.
const FIELD_PATHS = {
  DailyActiveUsers: ['daily', 'dau'],
  Visits: ['daily', 'sessions'],
  TotalPlayTimeHours: ['daily', 'playtimeHours'],
  MonthlyActiveUsers: ['daily', 'mau'],
  PeakConcurrentPlayers: ['daily', 'peakCcu'],
  'DailyActiveUsers by IsNewUser': ['newVsReturning'],
  'DailyActiveUsers by Platform': ['platforms'],
  'DailyActiveUsers by Country': ['countries']
};

function getPath(object, path) {
  return path.reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function setPath(object, path, value) {
  const last = path[path.length - 1];
  const parent = path.slice(0, -1).reduce((node, key) => (node[key] ??= {}), object);
  parent[last] = value;
}

async function collectGame(game, universeId, publicInfo, previous) {
  const end = iso(dayStart(0));
  const daily = (metric, days = DAYS) => ({
    metric, granularity: 'OneDay', startTime: iso(dayStart(-days)), endTime: end
  });

  const result = {
    placeId: String(game.placeId),
    universeId,
    name: game.name || publicInfo?.name,
    icon: game.icon || '',
    url: game.url,
    created: publicInfo?.created || null,
    public: publicInfo ? {
      visits: publicInfo.visits ?? null,
      playing: publicInfo.playing ?? null,
      favorites: publicInfo.favoritedCount ?? null
    } : null,
    daily: {},
    newVsReturning: {},
    platforms: [],
    countries: [],
    errors: []
  };

  const jobs = [
    ['DailyActiveUsers', daily('DailyActiveUsers'), (r) => { result.daily.dau = series(r); }],
    ['Visits', daily('Visits'), (r) => { result.daily.sessions = series(r); }],
    ['TotalPlayTimeHours', daily('TotalPlayTimeHours'), (r) => { result.daily.playtimeHours = series(r); }],
    ['MonthlyActiveUsers', daily('MonthlyActiveUsers', 7), (r) => { result.daily.mau = series(r); }],
    ['PeakConcurrentPlayers', daily('PeakConcurrentPlayers', PERFORMANCE_DAYS), (r) => { result.daily.peakCcu = series(r); }],
    ['DailyActiveUsers by IsNewUser',
      { ...daily('DailyActiveUsers', BREAKDOWN_DAYS), breakdown: ['IsNewUser'] },
      (r) => { result.newVsReturning = breakdownSeries(r); }],
    ['DailyActiveUsers by Platform',
      { ...daily('DailyActiveUsers', BREAKDOWN_DAYS), granularity: 'None', breakdown: ['Platform'] },
      (r) => { result.platforms = breakdownTotals(r); }],
    ['DailyActiveUsers by Country',
      { ...daily('DailyActiveUsers', BREAKDOWN_DAYS), granularity: 'None', breakdown: ['Country'], limit: 100 },
      (r) => { result.countries = breakdownTotals(r); }]
  ];

  for (const [label, request, apply] of jobs) {
    try {
      apply(await queryMetric(universeId, request));
    } catch (error) {
      result.errors.push({ metric: label, status: error.status || null, message: error.message });
      console.warn(`  ! ${game.name}: ${error.message}`);
      // Transient Roblox errors (5xx / 429): keep the last good value instead of dropping it.
      const transient = !error.status || error.status >= 500 || error.status === 429;
      const kept = transient && previous ? getPath(previous, FIELD_PATHS[label]) : undefined;
      if (kept !== undefined) {
        setPath(result, FIELD_PATHS[label], kept);
        console.warn(`    kept previous ${label} data for ${game.name}`);
      }
      // No access to this experience: don't burn the rate limit on the rest.
      if (error.status === 401 || error.status === 403) {
        result.noAccess = true;
        break;
      }
    }
  }
  return result;
}

async function main() {
  if (!API_KEY) {
    console.error('ROBLOX_API_KEY is not set. Add it under Settings > Secrets and variables > Actions.');
    process.exit(1);
  }

  const games = await loadGames();
  console.log(`Found ${games.length} game(s) in games-data.js`);

  const resolved = [];
  for (const game of games) {
    try {
      const universeId = await resolveUniverseId(game);
      console.log(`  ${game.name}: place ${game.placeId} -> universe ${universeId}`);
      resolved.push({ game, universeId });
    } catch (error) {
      console.warn(`  ! ${game.name}: ${error.message}`);
    }
  }

  const publicDetails = await fetchPublicDetails(resolved.map((entry) => entry.universeId));
  const outPath = join(root, 'data', 'stats.json');
  let previousFile = null;
  try {
    previousFile = JSON.parse(await readFile(outPath, 'utf8'));
  } catch {
    // First run: nothing to carry forward.
  }
  const previousByUniverse = new Map((previousFile?.games || []).map((g) => [String(g.universeId), g]));
  const output = {
    generatedAt: new Date().toISOString(),
    rangeDays: DAYS,
    breakdownDays: BREAKDOWN_DAYS,
    games: []
  };

  for (const { game, universeId } of resolved) {
    console.log(`Querying ${game.name} (universe ${universeId})…`);
    output.games.push(await collectGame(game, universeId, publicDetails.get(universeId), previousByUniverse.get(universeId)));
  }

  // Every analytics call failing with 401/403 means the key or its permissions
  // are wrong: fail the run loudly instead of publishing an empty file.
  const allErrors = output.games.flatMap((game) => game.errors);
  const authFailures = allErrors.filter((error) => error.status === 401 || error.status === 403);
  const anyData = output.games.some((game) => Object.keys(game.daily).length);
  if (!anyData) {
    console.error(authFailures.length
      ? 'Every analytics request was rejected (401/403). Check that ROBLOX_API_KEY is valid and has universe.analytics:read for these experiences.'
      : 'No analytics data was returned for any game.');
    process.exit(1);
  }
  for (const game of output.games) {
    if (game.noAccess) {
      console.warn(`  ! ${game.name} (universe ${game.universeId}): API key has no analytics access to this experience.`);
    }
  }

  // Keep the previous timestamp when nothing else changed, so scheduled runs
  // only produce a commit when there's genuinely new data.
  if (previousFile) {
    const strip = ({ generatedAt, ...rest }) => JSON.stringify(rest);
    if (strip(previousFile) === strip(output)) output.generatedAt = previousFile.generatedAt;
  }

  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(output)}\n`);
  console.log(`Wrote data/stats.json (${output.games.length} games, ${allErrors.length} metric error(s)).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
