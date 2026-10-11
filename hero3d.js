/* ---------------------------------------------------------------
   RoBlast 3D hero
   The RoBlast logo as a real extruded 3D model, with every game in
   games-data.js orbiting it as a planet. Loaded as an ES module
   (Three.js via the import map in index.html). If WebGL or the
   module fails, the original CSS logo stays in place.
---------------------------------------------------------------- */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Logo outlines traced from roblast-favicon.png (512x512 px space).
// Each entry is [outer, ...holes]; points are [x, y].
const LOGO_SHAPES = [[[[356,376],[253,331],[145,375],[255,348]]],[[[358,369],[257,260],[141,369],[254,322]]],[[[386,137],[269,248],[381,367],[498,255]],[[382,231],[384,231],[406,251],[385,273],[383,273],[362,251]]],[[[132,130],[16,241],[125,358],[243,248]],[[130,221],[153,245],[129,266],[106,243]]],[[[259,126],[203,179],[257,238],[314,184]],[[257,171],[269,182],[258,193],[247,182],[247,180]]]];

const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const PLANET_COLORS = ['#3ef3ff', '#ff4fd8', '#b975ff', '#5ef1a9', '#ffc857', '#6e89ff'];

const hero = document.querySelector('.hero');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

if (hero && webglAvailable()) {
  try {
    initHero3D();
  } catch (error) {
    console.warn('RoBlast 3D hero unavailable, keeping the 2D logo:', error);
  }
}

function initHero3D() {
  /* ---- DOM layers: planets behind / canvas / planets in front ---- */
  const root = document.createElement('div');
  root.className = 'hero-3d';
  root.setAttribute('aria-hidden', 'false');
  const backLayer = document.createElement('div');
  backLayer.className = 'planet-layer back';
  const frontLayer = document.createElement('div');
  frontLayer.className = 'planet-layer front';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  renderer.domElement.className = 'hero-3d-canvas';
  renderer.domElement.setAttribute('aria-label', 'RoBlast logo in 3D. Drag to spin.');
  renderer.domElement.setAttribute('role', 'img');
  root.append(backLayer, renderer.domElement, frontLayer);
  hero.insertBefore(root, hero.querySelector('.hero-inner'));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  camera.position.set(0, 0.6, 13);

  // Studio reflections for the glossy logo.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  /* ---- Lights: white key, cyan + pink rims, purple core ---- */
  scene.add(new THREE.AmbientLight(0x6a4cff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 5, 8);
  scene.add(key);
  const rimCyan = new THREE.PointLight(0x3ef3ff, 60, 30);
  rimCyan.position.set(-6, 2, 3);
  scene.add(rimCyan);
  const rimPink = new THREE.PointLight(0xff4fd8, 55, 30);
  rimPink.position.set(6, -2, 3);
  scene.add(rimPink);
  const core = new THREE.PointLight(0x8d4bff, 40, 20);
  core.position.set(0, 0, -3);
  scene.add(core);

  /* ---- The logo model ---- */
  const system = new THREE.Group();
  scene.add(system);
  const logo = new THREE.Group();
  system.add(logo);

  const xs = LOGO_SHAPES.flat(2).map((p) => p[0]);
  const ys = LOGO_SHAPES.flat(2).map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const unit = 5.2 / (Math.max(...xs) - Math.min(...xs)); // logo ~5.2 units wide
  const toVec = ([x, y]) => new THREE.Vector2((x - cx) * unit, -(y - cy) * unit);

  const shapes = LOGO_SHAPES.map(([outer, ...holes]) => {
    const shape = new THREE.Shape(outer.map(toVec));
    holes.forEach((hole) => shape.holes.push(new THREE.Path(hole.map(toVec))));
    return shape;
  });

  const depth = 0.95;
  const bevel = 0.07;
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.045, bevelSegments: 4, curveSegments: 1
  });
  geometry.translate(0, 0, -depth / 2);

  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), -3);
  const faceMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xeee8ff, roughness: 0.3, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.12,
    emissive: 0x8f74ff, emissiveIntensity: 0.06, envMapIntensity: 0.75, clippingPlanes: [clipPlane]
  });
  const sideMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x7b3bff, roughness: 0.25, metalness: 0.6, clearcoat: 0.7,
    emissive: 0x4a14c8, emissiveIntensity: 0.7, envMapIntensity: 1.5, clippingPlanes: [clipPlane]
  });
  const logoMesh = new THREE.Mesh(geometry, [faceMaterial, sideMaterial]);
  logo.add(logoMesh);

  // Neon outline on the front and back faces.
  const outlineFront = new THREE.LineBasicMaterial({ color: 0x3ef3ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, clippingPlanes: [clipPlane] });
  const outlineBack = new THREE.LineBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, clippingPlanes: [clipPlane] });
  LOGO_SHAPES.forEach((rings) => rings.forEach((ring) => {
    const pts = ring.map(toVec);
    [[depth / 2 + bevel + 0.004, outlineFront], [-depth / 2 - bevel - 0.004, outlineBack]].forEach(([z, material]) => {
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, z)));
      logo.add(new THREE.LineLoop(lineGeometry, material));
    });
  }));

  // Soft purple glow behind the model.
  const glowTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(186,111,255,0.85)');
    grad.addColorStop(0.35, 'rgba(141,75,255,0.35)');
    grad.addColorStop(1, 'rgba(141,75,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
  glow.scale.set(10, 7, 1);
  glow.position.z = -1.2;
  system.add(glow);

  // Scan beam used by the "materialise" intro.
  const scanBeam = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x3ef3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  scanBeam.position.z = 0.6;
  logo.add(scanBeam);

  /* ---- Orbits, planets, asteroid belt, stars ---- */
  const games = (typeof ROBLAST_GAMES !== 'undefined' && Array.isArray(ROBLAST_GAMES)) ? ROBLAST_GAMES : [];
  const orbitGroup = new THREE.Group();
  orbitGroup.rotation.set(1.16, 0, -0.18); // tilt the plane of the solar system
  system.add(orbitGroup);

  const planets = games.map((game, index) => {
    const radius = 3.3 + index * 0.42;
    const tilt = (index % 2 ? 1 : -1) * (0.05 + index * 0.025);
    const color = PLANET_COLORS[index % PLANET_COLORS.length];

    const orbit = new THREE.Group();
    orbit.rotation.x = tilt;
    orbitGroup.add(orbit);

    const ringPoints = Array.from({ length: 160 }, (_, i) => {
      const a = (i / 160) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    });
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPoints),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    orbit.add(ring);

    const anchor = new THREE.Object3D();
    orbit.add(anchor);

    // HTML planet: real <img> + link, positioned from the 3D anchor every frame.
    const el = document.createElement('a');
    el.className = 'planet';
    el.href = game.url || '#';
    el.target = '_blank';
    el.rel = 'noreferrer';
    el.style.setProperty('--planet', color);
    el.setAttribute('aria-label', `Play ${game.name} on Roblox`);
    el.innerHTML = `
      <span class="planet-body">${game.thumbnail ? `<img src="${escapeText(game.thumbnail)}" alt="" loading="lazy" decoding="async" />` : `<b>${escapeText(game.icon || '★')}</b>`}</span>
      <span class="planet-label"><strong>${escapeText(game.name)}</strong><em>Play ↗</em></span>`;
    // If a thumbnail fails to load, show the game's emoji instead of a broken image.
    const img = el.querySelector('.planet-body img');
    if (img) {
      img.addEventListener('error', () => {
        const fallback = document.createElement('b');
        fallback.textContent = game.icon || '★';
        img.replaceWith(fallback);
      }, { once: true });
    }
    backLayer.appendChild(el);

    return {
      el, anchor, radius,
      angle: (index / Math.max(games.length, 1)) * Math.PI * 2 + 0.4,
      speed: 0.16 / Math.sqrt(radius / 3.3) * (index % 2 ? 0.85 : 1),
      inFront: false
    };
  });

  // Asteroid belt: a glittering ring of particles between the orbits.
  const beltCount = window.innerWidth < 700 ? 500 : 1100;
  const beltPositions = new Float32Array(beltCount * 3);
  const beltColors = new Float32Array(beltCount * 3);
  const beltPalette = ['#3ef3ff', '#b975ff', '#ff4fd8', '#ffffff'].map((c) => new THREE.Color(c));
  for (let i = 0; i < beltCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 4.05 + (Math.random() - 0.5) * 0.8 * Math.random();
    beltPositions.set([Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.22], i * 3);
    const c = beltPalette[Math.floor(Math.random() * beltPalette.length)];
    beltColors.set([c.r, c.g, c.b], i * 3);
  }
  const beltGeometry = new THREE.BufferGeometry();
  beltGeometry.setAttribute('position', new THREE.BufferAttribute(beltPositions, 3));
  beltGeometry.setAttribute('color', new THREE.BufferAttribute(beltColors, 3));
  const belt = new THREE.Points(beltGeometry, new THREE.PointsMaterial({
    size: 0.035, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  orbitGroup.add(belt);

  // Deep starfield.
  const starCount = window.innerWidth < 700 ? 350 : 900;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(18 + Math.random() * 30);
    v.z -= 10;
    starPositions.set([v.x, v.y, v.z], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    color: 0xd8ccff, size: 0.08, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(stars);

  /* ---- Framing: logo sits on the right on desktop, behind the copy on mobile ---- */
  let width = 1;
  let height = 1;
  let mobile = false;

  function resize() {
    width = root.clientWidth || hero.clientWidth;
    height = root.clientHeight || hero.clientHeight;
    mobile = width <= 820;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Shift the projection centre instead of moving the model, so the logo
    // lands where the old 2D logo was without distorting perspective.
    const centreX = mobile ? 0.7 : 0.7;
    const centreY = mobile ? 0.58 : 0.47;
    camera.setViewOffset(width, height, (0.5 - centreX) * width, (0.5 - centreY) * height, width, height);
    camera.position.z = mobile ? 25 : 14.2;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(root);

  /* ---- Interaction: drag to spin (with momentum), mouse parallax, scroll ---- */
  const spin = { angle: 0, velocity: 0, dragging: false, lastX: 0 };
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const canvas = renderer.domElement;

  canvas.addEventListener('pointerdown', (event) => {
    spin.dragging = true;
    spin.lastX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
    root.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!spin.dragging) return;
    const dx = event.clientX - spin.lastX;
    spin.lastX = event.clientX;
    spin.angle += dx * 0.01;
    spin.velocity = dx * 0.01;
  });
  const endDrag = () => {
    spin.dragging = false;
    root.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  window.addEventListener('pointermove', (event) => {
    parallax.tx = (event.clientX / window.innerWidth - 0.5) * 2;
    parallax.ty = (event.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  /* ---- Render loop (paused when the hero is off-screen or the tab is hidden) ---- */
  const clock = new THREE.Clock();
  const introDuration = reduceMotion ? 0 : 1.8;
  let elapsed = 0;
  let introStart = performance.now();
  let visible = true;
  let running = false;
  const tmp = new THREE.Vector3();
  const logoCentre = new THREE.Vector3();

  const copy = hero.querySelector('.hero-copy');
  let copyRight = 0;

  function placePlanets() {
    // Planets ghost out while they pass behind the headline column (desktop).
    copyRight = !mobile && copy ? copy.getBoundingClientRect().right - root.getBoundingClientRect().left + 30 : 0;
    logoCentre.setFromMatrixPosition(logo.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    for (const planet of planets) {
      planet.anchor.position.set(Math.cos(planet.angle) * planet.radius, Math.sin(planet.angle) * planet.radius, 0);
      planet.anchor.updateMatrixWorld();
      tmp.setFromMatrixPosition(planet.anchor.matrixWorld);
      const viewZ = tmp.clone().applyMatrix4(camera.matrixWorldInverse).z;
      tmp.project(camera);
      const x = (tmp.x + 1) / 2 * width;
      const y = (1 - tmp.y) / 2 * height;
      // Perspective size + depth cue (farther planets are smaller and dimmer).
      const scale = THREE.MathUtils.clamp(camera.position.z / -viewZ, 0.55, 1.6) * (mobile ? 0.62 : 1);
      const behind = viewZ < logoCentre.z;
      if (behind === planet.inFront || planet.el.parentNode === null) {
        (behind ? backLayer : frontLayer).appendChild(planet.el);
        planet.inFront = !behind;
      }
      planet.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      const overCopy = x < copyRight;
      planet.el.classList.toggle('ghost', overCopy);
      planet.el.classList.toggle('flip', x > width - 230);
      planet.el.style.opacity = overCopy ? '0.16' : (behind ? '0.72' : '1');
      planet.el.style.zIndex = String(Math.round(1000 + viewZ * 10));
    }
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const hyper = document.body.classList.contains('hyperdrive');
    const t = reduceMotion ? 0 : elapsed;

    // Intro: the logo materialises bottom-to-top behind a scan beam.
    const intro = introDuration ? Math.min((performance.now() - introStart) / 1000 / introDuration, 1) : 1;
    const eased = 1 - Math.pow(1 - intro, 3);
    clipPlane.constant = THREE.MathUtils.lerp(-2.2, 2.6, eased);
    scanBeam.position.y = clipPlane.constant;
    scanBeam.material.opacity = intro < 1 ? 0.9 : Math.max(0, scanBeam.material.opacity - dt * 3);

    // Spin: user drag with momentum, settling back into a gentle idle sway.
    if (!spin.dragging) {
      spin.angle += spin.velocity;
      spin.velocity *= 0.94;
      if (Math.abs(spin.velocity) < 0.0005) spin.angle *= 0.985;
    }
    const scroll = THREE.MathUtils.clamp(window.scrollY / Math.max(hero.offsetHeight, 1), 0, 1);
    // Resting three-quarter angle so the extruded sides always read as 3D.
    logo.rotation.y = -0.5 + spin.angle + Math.sin(t * 0.45) * 0.28 + scroll * 1.4 + (hyper ? elapsed * 6 : 0);
    logo.rotation.x = 0.16 + Math.sin(t * 0.33) * 0.07;
    logo.position.y = Math.sin(t * 0.8) * 0.12;

    // Orbits.
    const orbitSpeed = (hyper ? 9 : 1) * (reduceMotion ? 0 : 1);
    planets.forEach((planet) => { planet.angle += planet.speed * dt * orbitSpeed; });
    belt.rotation.z += dt * 0.04 * orbitSpeed;
    stars.rotation.y += dt * 0.01 * (hyper ? 12 : 1);

    // Camera: mouse parallax + pull back as the hero scrolls away.
    parallax.x += (parallax.tx - parallax.x) * 0.05;
    parallax.y += (parallax.ty - parallax.y) * 0.05;
    system.rotation.y = parallax.x * 0.12;
    system.rotation.x = parallax.y * 0.06;
    system.position.y = scroll * 1.6;
    glow.material.opacity = 0.75 + Math.sin(t * 1.6) * 0.15;

    system.updateMatrixWorld();
    camera.updateMatrixWorld();
    placePlanets();
    renderer.render(scene, camera);
  }

  function loop() {
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    frame();
    requestAnimationFrame(loop);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(loop);
  }

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) start();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

  hero.classList.add('has-3d');
  if (reduceMotion) {
    // One still frame: fully built logo, planets in place, no motion.
    elapsed = introDuration;
    frame();
    window.addEventListener('resize', () => requestAnimationFrame(frame));
  } else {
    start();
  }
}
