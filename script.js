const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const navLinks = [...document.querySelectorAll('.nav-link[href^="#"]')];

function updateHeader() {
  if (header) header.classList.toggle('scrolled', window.scrollY > 18);
}
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  nav.addEventListener('click', (event) => {
    if (event.target.closest('.nav-link')) {
      nav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open menu');
    }
  });
}

const sections = [...document.querySelectorAll('main section[id]')];
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
  });
}, { rootMargin: '-38% 0px -52% 0px', threshold: 0 });
sections.forEach((section) => sectionObserver.observe(section));

function gameCardTemplate(game) {
  const tags = game.tags.map((tag) => `<span>${tag}</span>`).join('');
  return `
    <article class="game-card reveal" data-roblox-place-id="${game.placeId}">
      <a class="game-art" href="${game.url}" target="_blank" rel="noreferrer">
        <img src="${game.thumbnail}" alt="${game.name}" loading="lazy" />
        <span class="game-badge">LIVE</span>
        <span class="game-play">PLAY ↗</span>
      </a>
      <div class="game-info">
        <div>
          <h3>${game.icon} ${game.name}</h3>
          <p>${game.description}</p>
        </div>
        <div class="game-meta">${tags}</div>
      </div>
    </article>`;
}

function renderGames() {
  if (!Array.isArray(ROBLAST_GAMES)) return;
  const homeGrid = document.querySelector('#games-grid');
  const catalogueGrid = document.querySelector('#catalogue-grid');
  const cards = ROBLAST_GAMES.map(gameCardTemplate).join('');
  if (homeGrid) homeGrid.innerHTML = cards;
  if (catalogueGrid) catalogueGrid.innerHTML = cards;
}

renderGames();

const reveals = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
reveals.forEach((item, index) => {
  item.style.transitionDelay = `${Math.min(index % 4, 3) * 65}ms`;
  revealObserver.observe(item);
});

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

/* ---------------------------------------------------------------
   Live Roblox studio statistics
   ---------------------------------------------------------------
   Add a game to games-data.js and it is automatically included in:
   - total games
   - live CCU
   - total visits
   - total favourites

   GitHub Pages has no backend, so Roblox requests are attempted through
   RoTunnel first, then Roblox directly, then read-only CORS relays.
---------------------------------------------------------------- */
const statsElements = {
  games: document.getElementById('stat-games'),
  ccu: document.getElementById('stat-ccu'),
  visits: document.getElementById('stat-visits'),
  favourites: document.getElementById('stat-favourites'),
  status: document.getElementById('stats-status')
};

const universeCacheKey = 'roblast-universe-ids-v2';
const statsRefreshMs = 60_000;
const fetchTimeoutMs = 4_500;
const corsProxies = [
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy/?quest='
];

let statsRequestRunning = false;

function readUniverseCache() {
  try {
    return JSON.parse(localStorage.getItem(universeCacheKey) || '{}');
  } catch {
    return {};
  }
}

function writeUniverseCache(cache) {
  try {
    localStorage.setItem(universeCacheKey, JSON.stringify(cache));
  } catch {
    // Storage can be disabled in private browsing. Runtime still works.
  }
}

function robloxProxyUrl(targetUrl) {
  return targetUrl
    .replace('https://apis.roblox.com', 'https://apis.rotunnel.com')
    .replace('https://games.roblox.com', 'https://games.rotunnel.com')
    .replace('https://groups.roblox.com', 'https://groups.rotunnel.com');
}

async function fetchJson(targetUrl) {
  const proxyUrl = robloxProxyUrl(targetUrl);
  const attempts = [...new Set([
    proxyUrl,
    targetUrl,
    `${corsProxies[0]}${encodeURIComponent(targetUrl)}`,
    `${corsProxies[1]}${encodeURIComponent(targetUrl)}`
  ])];

  for (const url of attempts) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), fetchTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (data !== null && typeof data === 'object') return data;
    } catch {
      // Network, CORS, timeout or JSON errors: try the next source.
    } finally {
      window.clearTimeout(timer);
    }
  }

  return null;
}

async function resolveUniverseId(game, cache) {
  if (game.universeId) return String(game.universeId);
  if (cache[game.placeId]) return String(cache[game.placeId]);

  const data = await fetchJson(
    `https://apis.roblox.com/universes/v1/places/${encodeURIComponent(game.placeId)}/universe`
  );

  if (data && data.universeId) {
    cache[game.placeId] = String(data.universeId);
    writeUniverseCache(cache);
    return String(data.universeId);
  }

  return null;
}

async function fetchGameStats(game, cache) {
  const universeId = await resolveUniverseId(game, cache);
  if (!universeId) return { status: 'unresolved', game, universeId: null };

  const [detailsData, favouriteData] = await Promise.all([
    fetchJson(`https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(universeId)}`),
    fetchJson(`https://games.roblox.com/v1/games/${encodeURIComponent(universeId)}/favorites/count`)
  ]);

  const entry = detailsData && Array.isArray(detailsData.data)
    ? detailsData.data[0]
    : null;

  if (!entry) {
    return { status: 'no-data', game, universeId };
  }

  const playing = Number.isFinite(Number(entry.playing)) ? Number(entry.playing) : null;
  const visits = Number.isFinite(Number(entry.visits)) ? Number(entry.visits) : null;
  const favourites = favouriteData && Number.isFinite(Number(favouriteData.favoritesCount))
    ? Number(favouriteData.favoritesCount)
    : null;

  return {
    status: 'ok',
    game,
    universeId,
    playing,
    visits,
    favourites
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '—';

  return new Intl.NumberFormat('en-GB', {
    notation: 'compact',
    maximumFractionDigits: value >= 100_000 ? 1 : 2
  }).format(value);
}

function formatUpdatedTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

async function updateLiveStats() {
  if (!statsElements.games || !Array.isArray(ROBLAST_GAMES) || !ROBLAST_GAMES.length) return;
  if (statsRequestRunning) return;

  statsRequestRunning = true;

  const games = [
    ...new Map(
      ROBLAST_GAMES.map((game) => [String(game.placeId), game])
    ).values()
  ];

  // Total Games is intentionally driven by the catalogue/config, so adding
  // another game immediately increases the displayed studio total.
  statsElements.games.textContent = formatNumber(games.length);

  if (statsElements.status) {
    statsElements.status.textContent = 'Updating live Roblox stats…';
  }

  try {
    const cache = readUniverseCache();

    const settled = await Promise.all(
      games.map((game) => fetchGameStats(game, cache))
    );

    const usable = settled.filter((result) => result.status === 'ok');
    const expectedGames = games.length;

    let totalCCU = 0;
    let totalVisits = 0;
    let totalFavourites = 0;

    let ccuSeen = 0;
    let visitsSeen = 0;
    let favouritesSeen = 0;

    for (const result of usable) {
      if (Number.isFinite(result.playing)) {
        totalCCU += result.playing;
        ccuSeen += 1;
      }

      if (Number.isFinite(result.visits)) {
        totalVisits += result.visits;
        visitsSeen += 1;
      }

      if (Number.isFinite(result.favourites)) {
        totalFavourites += result.favourites;
        favouritesSeen += 1;
      }
    }

    const hasCCU = ccuSeen === expectedGames;
    const hasVisits = visitsSeen === expectedGames;
    const hasFavourites = favouritesSeen === expectedGames;

    statsElements.ccu.textContent = hasCCU ? formatNumber(totalCCU) : '—';
    statsElements.visits.textContent = hasVisits ? formatNumber(totalVisits) : '—';
    statsElements.favourites.textContent = hasFavourites ? formatNumber(totalFavourites) : '—';

    const unavailable = expectedGames - usable.length;

    if (statsElements.status) {
      const suffix = unavailable
        ? ` · ${unavailable} game${unavailable === 1 ? '' : 's'} unavailable`
        : '';

      statsElements.status.textContent =
        `Updated ${formatUpdatedTime(new Date())}${suffix}`;
    }
  } catch (error) {
    console.warn('RoBlast live stats update failed:', error);

    if (statsElements.status) {
      statsElements.status.textContent =
        'Roblox stats are temporarily unavailable. Retrying automatically…';
    }
  } finally {
    statsRequestRunning = false;
  }
}

updateLiveStats();
if (statsElements.games) {
  window.setInterval(updateLiveStats, statsRefreshMs);
}

