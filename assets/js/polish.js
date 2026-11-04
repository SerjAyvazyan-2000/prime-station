/* Prime Station — интерактив «полировка» на первом экране.
   Поверх фото в canvas рисуются матовый налёт, круговые «голограммы» и царапины.
   Полировальная машинка следует за курсором (или пальцем) и стирает слой.
   Без JS или без canvas видно обычное чистое фото. */
(function () {
  'use strict';

  var box = document.querySelector('[data-polish]');
  if (!box) return;
  var canvas = box.querySelector('.polish__layer');
  var tool = box.querySelector('.polish__tool');
  var hint = box.querySelector('.polish__hint');
  var reset = box.querySelector('.polish__reset');
  var ctx = canvas && canvas.getContext && canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var HINT_START = finePointer
    ? 'Проведите курсором по фото — отполируйте царапины'
    : 'Проведите пальцем по фото — отполируйте царапины';
  var DONE_AT = 0.86;      // доля очищенной площади, после которой слой исчезает целиком

  var W = 0, H = 0, dpr = 1, radius = 40;
  var initialAlpha = 0, done = false, touched = false;
  var last = null;         // последняя точка стирания
  var pos = { x: 0, y: 0 }, view = { x: 0, y: 0 };
  var raf = 0, checkTimer = 0, spinTimer = 0, demoTimer = 0, demoRaf = 0;

  /* ---------- Детерминированный случайный генератор: царапины одинаковые при каждой загрузке ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- Рисуем «поцарапанный» слой ---------- */
  function paintDamage() {
    var r = rng(20261104);
    var s = dpr;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    // Матовый окисленный налёт, неравномерный
    ctx.fillStyle = 'rgba(176, 186, 196, 0.15)';
    ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < 14; i++) {
      var cx = r() * W, cy = r() * H, rad = (0.15 + r() * 0.35) * W;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(200, 208, 216, ' + (0.06 + r() * 0.10) + ')');
      g.addColorStop(1, 'rgba(200, 208, 216, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Мелкая пыль и точки
    for (i = 0; i < W * H / (900 * s * s); i++) {
      ctx.fillStyle = 'rgba(235, 240, 245, ' + (0.08 + r() * 0.22) + ')';
      ctx.fillRect(r() * W, r() * H, (0.6 + r() * 1.2) * s, (0.6 + r() * 1.2) * s);
    }

    ctx.lineCap = 'round';

    // Круговые «голограммы» от неправильной мойки
    for (i = 0; i < 9; i++) {
      var hx = r() * W, hy = r() * H, maxR = (0.08 + r() * 0.16) * W;
      for (var k = 0; k < 46; k++) {
        var rr = r() * maxR, a0 = r() * Math.PI * 2, len = 0.25 + r() * 0.9;
        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.07 + r() * 0.16) + ')';
        ctx.lineWidth = (0.5 + r() * 0.7) * s;
        ctx.beginPath();
        ctx.arc(hx, hy, rr, a0, a0 + len);
        ctx.stroke();
      }
    }

    // Царапины: светлая линия + тёмная тень для объёма
    function scratch(width, alpha) {
      var x = r() * W, y = r() * H;
      var ang = (r() - 0.5) * 1.4 + (r() < 0.5 ? 0 : Math.PI);
      var len = (0.06 + r() * 0.28) * W;
      var bend = (r() - 0.5) * 0.4 * len;
      var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      var mx = (x + x2) / 2 - Math.sin(ang) * bend, my = (y + y2) / 2 + Math.cos(ang) * bend;

      ctx.strokeStyle = 'rgba(0, 0, 0, ' + alpha * 0.55 + ')';
      ctx.lineWidth = width * s;
      ctx.beginPath(); ctx.moveTo(x + s, y + s); ctx.quadraticCurveTo(mx + s, my + s, x2 + s, y2 + s); ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, ' + alpha + ')';
      ctx.lineWidth = width * 0.8 * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
    }
    for (i = 0; i < 70; i++) scratch(0.6 + r() * 0.6, 0.18 + r() * 0.25);   // мелкие
    for (i = 0; i < 16; i++) scratch(1.2 + r() * 0.8, 0.45 + r() * 0.3);    // заметные
    for (i = 0; i < 4; i++)  scratch(2.0 + r() * 0.8, 0.75);                // глубокие
  }

  /* ---------- Подсчёт очищенной площади (по разреженной сетке точек) ---------- */
  function alphaSum() {
    var data = ctx.getImageData(0, 0, W, H).data, sum = 0, step = 4 * 7;
    for (var i = 3; i < data.length; i += step) sum += data[i];
    return sum;
  }

  function progress() {
    if (!initialAlpha) return 0;
    return Math.max(0, Math.min(1, 1 - alphaSum() / initialAlpha));
  }

  function scheduleCheck() {
    if (checkTimer || done) return;
    checkTimer = setTimeout(function () {
      checkTimer = 0;
      var p = progress();
      if (p >= DONE_AT) finish();
      else if (touched) hint.innerHTML = 'Отполировано <b>' + Math.round(p * 100) + '%</b>';
    }, 250);
  }

  function finish() {
    done = true;
    box.classList.add('is-done');
    box.classList.remove('is-spinning');
    hint.textContent = 'Готово — царапины убраны';
    reset.hidden = false;
    setTimeout(function () { if (done) ctx.clearRect(0, 0, W, H); }, 850);
  }

  /* ---------- Стирание мягкой круглой кистью ---------- */
  function dab(x, y) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    g.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function polishTo(x, y) {
    if (done) return;
    ctx.globalCompositeOperation = 'destination-out';
    if (last) {
      var dx = x - last.x, dy = y - last.y, dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(1, Math.ceil(dist / (radius * 0.25)));
      for (var i = 1; i <= steps; i++) dab(last.x + dx * i / steps, last.y + dy * i / steps);
    } else {
      dab(x, y);
    }
    ctx.globalCompositeOperation = 'source-over';
    last = { x: x, y: y };
    scheduleCheck();
  }

  /* ---------- Машинка: плавно догоняет курсор ---------- */
  function placeTool() {
    var size = tool.offsetWidth;
    // Центр пятна полировки совпадает с центром круга (60/120 по SVG)
    tool.style.transform = 'translate(' + (view.x - size / 2) + 'px,' + (view.y - size / 2) + 'px)';
  }

  function loop() {
    var k = reduceMotion ? 1 : 0.35;
    view.x += (pos.x - view.x) * k;
    view.y += (pos.y - view.y) * k;
    placeTool();
    if (Math.abs(pos.x - view.x) > 0.3 || Math.abs(pos.y - view.y) > 0.3) raf = requestAnimationFrame(loop);
    else raf = 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  function spin() {
    if (reduceMotion || done) return;
    box.classList.add('is-spinning');
    clearTimeout(spinTimer);
    spinTimer = setTimeout(function () { box.classList.remove('is-spinning'); }, 220);
  }

  function local(e) {
    var rect = box.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /* ---------- События указателя ---------- */
  var pressed = false;

  box.addEventListener('pointerenter', function (e) {
    if (e.pointerType !== 'mouse') return;
    stopDemo();
    var p = local(e);
    pos.x = view.x = p.x; pos.y = view.y = p.y;
    placeTool();
    last = null;
    box.classList.add('is-active');
  });

  box.addEventListener('pointerdown', function (e) {
    if (e.target === reset) return;
    stopDemo();
    pressed = true;
    var p = local(e);
    if (e.pointerType !== 'mouse') { pos.x = view.x = p.x; pos.y = view.y = p.y; placeTool(); }
    box.classList.add('is-active');
    if (box.setPointerCapture) { try { box.setPointerCapture(e.pointerId); } catch (err) { /* ничего */ } }
    last = null;
    touched = true;
    polishTo(p.x * dpr, p.y * dpr);
    spin();
  });

  box.addEventListener('pointermove', function (e) {
    var p = local(e);
    pos.x = p.x; pos.y = p.y;
    kick();
    // Мышью полируем просто наведением, на сенсоре — касанием
    if (e.pointerType === 'mouse' || pressed) {
      touched = true;
      polishTo(p.x * dpr, p.y * dpr);
      spin();
    }
  });

  function release(e) {
    pressed = false;
    last = null;
    if (e.pointerType !== 'mouse') box.classList.remove('is-active');
  }
  box.addEventListener('pointerup', release);
  box.addEventListener('pointercancel', release);
  box.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') { box.classList.remove('is-active'); last = null; }
  });

  reset.addEventListener('click', function () {
    done = false;
    touched = false;
    box.classList.remove('is-done');
    reset.hidden = true;
    hint.textContent = HINT_START;
    paintDamage();
    initialAlpha = alphaSum();
    last = null;
  });

  /* ---------- Подсказка-демонстрация: машинка сама делает пару проходов ---------- */
  function stopDemo() {
    clearTimeout(demoTimer);
    if (demoRaf) cancelAnimationFrame(demoRaf);
    demoRaf = 0;
    if (box.classList.contains('is-demo')) {
      box.classList.remove('is-demo', 'is-spinning');
      last = null;
    }
  }

  function demo() {
    if (touched || done || reduceMotion) return;
    var t0 = performance.now(), dur = 2200;
    var bw = box.clientWidth, bh = box.clientHeight;
    box.classList.add('is-demo', 'is-spinning');
    last = null;
    (function step(now) {
      var t = Math.min(1, (now - t0) / dur);
      // Небольшая «восьмёрка» в центральной части фото
      var x = bw * (0.32 + 0.36 * t);
      var y = bh * (0.42 + 0.16 * Math.sin(t * Math.PI * 3));
      pos.x = view.x = x; pos.y = view.y = y;
      placeTool();
      polishTo(x * dpr, y * dpr);
      if (t < 1 && !touched) demoRaf = requestAnimationFrame(step);
      else { demoRaf = 0; box.classList.remove('is-demo', 'is-spinning'); last = null; }
    })(t0);
  }

  /* ---------- Размеры ---------- */
  function setup(keepProgress) {
    var rect = box.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(rect.width * dpr);
    H = Math.round(rect.height * dpr);
    canvas.width = W;
    canvas.height = H;
    radius = Math.max(22, rect.width * 0.075) * dpr;
    box.style.setProperty('--tool-size', Math.round(radius / dpr * 2 * 1.2) + 'px');
    if (done && keepProgress) return;
    paintDamage();
    initialAlpha = alphaSum();
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var rect = box.getBoundingClientRect();
      if (Math.round(rect.width * Math.min(window.devicePixelRatio || 1, 2)) === W) return;
      setup(true);   // при смене размера царапины рисуются заново
    }, 200);
  });

  function start() {
    box.classList.add('is-ready');
    hint.textContent = HINT_START;
    setup(false);
    // Демонстрация, когда фото видно на экране и человек ещё не трогал его
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        demoTimer = setTimeout(demo, 1400);
      }, { threshold: 0.6 });
      io.observe(box);
    }
  }

  var img = box.querySelector('img');
  if (img && !img.complete) {
    img.addEventListener('load', start, { once: true });
    img.addEventListener('error', start, { once: true });
  } else {
    start();
  }
})();
