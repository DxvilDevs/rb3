/* ---------------------------------------------------------------
   RoBlast FX layer
   Purely visual: particle network, hero parallax, scroll progress,
   holo card tilt, text decrypt, HUD clock and stat flashes.
   Everything degrades gracefully and respects reduced motion.
---------------------------------------------------------------- */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const pointer = { x: -9999, y: -9999 };

  /* Boot screen: only on the first page view of a session. */
  const boot = document.querySelector('.boot');
  if (boot) {
    try {
      if (sessionStorage.getItem('roblast-booted')) boot.classList.add('skip');
      sessionStorage.setItem('roblast-booted', '1');
    } catch {
      // Storage blocked: the CSS animation still dismisses the overlay.
    }
  }

  /* Particle network ------------------------------------------- */
  const canvas = document.getElementById('fx-canvas');
  const ctx = canvas && canvas.getContext('2d');
  let particles = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;

  function resizeCanvas() {
    if (!ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(110, Math.round((width * height) / 15000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.4,
      hue: Math.random() < 0.5 ? 186 : 275
    }));
  }

  /* Hyperdrive warp field (easter egg, see bottom of file) */
  const warp = { active: false, start: 0, duration: 7000, stars: [] };

  function spawnStar(star, near) {
    const angle = Math.random() * Math.PI * 2;
    const radius = near ? Math.random() * 80 : Math.random() * Math.max(width, height) * 0.6;
    star.x = width / 2 + Math.cos(angle) * radius;
    star.y = height / 2 + Math.sin(angle) * radius;
    star.hue = [186, 275, 318][Math.floor(Math.random() * 3)];
    star.w = Math.random() * 1.8 + 0.6;
    return star;
  }

  function drawWarp() {
    const t = (performance.now() - warp.start) / warp.duration;
    if (t >= 1) {
      warp.active = false;
      document.body.classList.remove('hyperdrive');
      return;
    }
    // Ramp up, cruise, then ease back down to the normal field.
    const intensity = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);
    for (const star of warp.stars) {
      const dx = star.x - cx;
      const dy = star.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = (1.5 + dist * 0.07) * intensity;
      const nx = dx / dist;
      const ny = dy / dist;
      star.x += nx * speed;
      star.y += ny * speed;
      if (star.x < -50 || star.x > width + 50 || star.y < -50 || star.y > height + 50) {
        spawnStar(star, true);
        continue;
      }
      const tail = speed * 5;
      ctx.strokeStyle = `hsla(${star.hue}, 100%, 72%, ${0.35 + intensity * 0.6})`;
      ctx.lineWidth = star.w;
      ctx.beginPath();
      ctx.moveTo(star.x - nx * tail, star.y - ny * tail);
      ctx.lineTo(star.x, star.y);
      ctx.stroke();
    }
  }

  function drawParticles() {
    if (warp.active) {
      drawWarp();
      return;
    }
    ctx.clearRect(0, 0, width, height);
    const linkDist = 130;

    for (const p of particles) {
      // Gentle pull towards the cursor.
      const dx = pointer.x - p.x;
      const dy = pointer.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 180 * 180) {
        p.vx += dx * 0.00004;
        p.vy += dy * 0.00004;
      }
      p.vx = Math.max(-0.8, Math.min(0.8, p.vx * 0.995));
      p.vy = Math.max(-0.8, Math.min(0.8, p.vy * 0.995));
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      if (p.y > height + 10) p.y = -10;
    }

    ctx.lineWidth = 0.6;
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < linkDist) {
          ctx.strokeStyle = `hsla(${a.hue}, 100%, 70%, ${(1 - dist / linkDist) * 0.22})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      const cd = Math.hypot(pointer.x - a.x, pointer.y - a.y);
      if (cd < 170) {
        ctx.strokeStyle = `rgba(62, 243, 255, ${(1 - cd / 170) * 0.45})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
      }
    }

    for (const p of particles) {
      ctx.fillStyle = `hsla(${p.hue}, 100%, 75%, .9)`;
      ctx.shadowColor = `hsl(${p.hue}, 100%, 65%)`;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function loop() {
    drawParticles();
    rafId = requestAnimationFrame(loop);
  }

  if (ctx) {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    if (reduceMotion) {
      drawParticles();
    } else {
      loop();
      document.addEventListener('visibilitychange', () => {
        cancelAnimationFrame(rafId);
        if (!document.hidden) loop();
      });
    }
  }

  /* Hero parallax ---------------------------------------------- */
  const iconWrap = document.querySelector('.hero-icon-wrap');

  window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (iconWrap && !reduceMotion) {
      const px = (event.clientX / window.innerWidth - 0.5) * -24;
      const py = (event.clientY / window.innerHeight - 0.5) * -18;
      iconWrap.style.setProperty('--px', `${px}px`);
      iconWrap.style.setProperty('--py', `${py}px`);
    }
  }, { passive: true });

  document.addEventListener('pointerleave', () => {
    pointer.x = -9999;
    pointer.y = -9999;
  });

  /* Scroll progress -------------------------------------------- */
  const progress = document.querySelector('.scroll-progress');
  const updateProgress = () => {
    if (!progress) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.setProperty('--progress', max > 0 ? (window.scrollY / max).toFixed(4) : 0);
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  /* Holo tilt on game cards (delegated: cards render dynamically) */
  if (finePointer && !reduceMotion) {
    document.addEventListener('pointermove', (event) => {
      const card = event.target.closest && event.target.closest('.game-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
      card.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
    }, { passive: true });

    document.addEventListener('pointerout', (event) => {
      const card = event.target.closest && event.target.closest('.game-card');
      if (!card || card.contains(event.relatedTarget)) return;
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }

  /* Text decrypt ----------------------------------------------- */
  const glyphs = '!<>-_\\/[]{}=+*^?#01ABCDEF';

  function scramble(el, finalText, duration = 900, onDone) {
    if (reduceMotion) {
      el.textContent = finalText;
      if (onDone) onDone();
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const revealCount = Math.floor(t * finalText.length);
      let out = '';
      for (let i = 0; i < finalText.length; i += 1) {
        const ch = finalText[i];
        out += i < revealCount || ch === ' ' ? ch : glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    };
    requestAnimationFrame(step);
  }

  const scrambleObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      scramble(el, el.dataset.final);
      scrambleObserver.unobserve(el);
    });
  }, { threshold: 0.6 });

  document.querySelectorAll('[data-scramble]').forEach((el) => {
    el.dataset.final = el.textContent.trim();
    scrambleObserver.observe(el);
  });

  /* Live stats: decrypt-flash whenever script.js writes a value */
  document.querySelectorAll('.stat strong').forEach((el) => {
    let busy = false;
    new MutationObserver(() => {
      if (busy) return;
      const value = el.textContent;
      if (!value || value === '—') return;
      busy = true;
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      scramble(el, value, 650, () => {
        // Release on the next tick so this final write is ignored.
        window.setTimeout(() => { busy = false; }, 0);
      });
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });

  /* Easter egg: HYPERDRIVE --------------------------------------
     Desktop: Konami code (up up down down left right left right B A).
     Touch:   tap the big glitch title 5 times quickly.
  ---------------------------------------------------------------- */
  let toastTimer = 0;

  function showHyperToast() {
    let toast = document.querySelector('.hyper-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'hyper-toast';
      toast.setAttribute('role', 'status');
      toast.innerHTML = '<span class="hyper-toast-tag">CHEAT CODE ACCEPTED</span><strong></strong>';
      document.body.appendChild(toast);
    }
    const line = toast.querySelector('strong');
    line.textContent = '';
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    scramble(line, 'HYPERDRIVE ENGAGED', 700);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 6200);
  }

  function engageHyperdrive() {
    if (warp.active) return;
    showHyperToast();
    if (reduceMotion || !ctx) return;

    const flash = document.createElement('div');
    flash.className = 'hyper-flash';
    document.body.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove());

    warp.stars = Array.from({ length: Math.min(320, Math.round((width * height) / 4500)) }, () => spawnStar({}, false));
    warp.start = performance.now();
    warp.active = true;
    document.body.classList.add('hyperdrive');
  }

  const konami = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let konamiIndex = 0;
  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    if (key === konami[konamiIndex]) {
      konamiIndex += 1;
      if (konamiIndex === konami.length) {
        konamiIndex = 0;
        engageHyperdrive();
      }
    } else {
      konamiIndex = key === konami[0] ? 1 : 0;
    }
  });

  let taps = [];
  document.querySelectorAll('.glitch').forEach((title) => {
    title.addEventListener('click', () => {
      const now = Date.now();
      taps = taps.filter((time) => now - time < 3000);
      taps.push(now);
      if (taps.length >= 5) {
        taps = [];
        engageHyperdrive();
      }
    });
  });

  console.log('%c[ROBLAST.SYS] %cpsst… try ↑ ↑ ↓ ↓ ← → ← → B A', 'color:#3ef3ff;font-weight:bold', 'color:#b975ff');

  /* HUD clock -------------------------------------------------- */
  const clock = document.getElementById('hud-clock');
  if (clock) {
    const tick = () => { clock.textContent = new Date().toISOString().slice(11, 19); };
    tick();
    window.setInterval(tick, 1000);
  }
})();
