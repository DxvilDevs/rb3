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

  function drawParticles() {
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

  /* HUD clock -------------------------------------------------- */
  const clock = document.getElementById('hud-clock');
  if (clock) {
    const tick = () => { clock.textContent = new Date().toISOString().slice(11, 19); };
    tick();
    window.setInterval(tick, 1000);
  }
})();
