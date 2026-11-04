/* Prime Station — интерактив «полировка» на первом экране.
   Внизу лежит фото «после» (<img>), сверху в canvas — фото «до» (data-before).
   Полировальная машинка следует за курсором (или пальцем) и стирает «до»,
   открывая отполированный кузов. Без JS видно фото «после». */
(function () {
  'use strict';

  var box = document.querySelector('[data-polish]');
  if (!box) return;
  var canvas = box.querySelector('.polish__layer');
  var tool = box.querySelector('.polish__tool');
  var hint = box.querySelector('.polish__hint');
  var reset = box.querySelector('.polish__reset');
  var ctx = canvas && canvas.getContext && canvas.getContext('2d');
  var beforeSrc = box.getAttribute('data-before');
  if (!ctx || !beforeSrc) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var HINT_START = finePointer
    ? 'Проведите курсором по машине — отполируйте кузов'
    : 'Проведите пальцем по машине — отполируйте кузов';
  var DONE_AT = 0.8;   // доля отполированной площади кузова, после которой «до» исчезает целиком

  // Область кузова в долях кадра: x1, y1, x2, y2. Процент считается только по ней,
  // чтобы не приходилось «полировать» фон.
  var area = (box.getAttribute('data-area') || '0.1,0.4,0.9,0.85').split(',').map(Number);

  var beforeImg = new Image();
  var W = 0, H = 0, dpr = 1, radius = 40;
  var done = false, touched = false;
  var last = null;
  var pos = { x: 0, y: 0 }, view = { x: 0, y: 0 };
  var raf = 0, checkTimer = 0, spinTimer = 0, demoTimer = 0, demoRaf = 0;

  // Сетка покрытия: считаем отполированную площадь без чтения пикселей картинки
  // (так подсчёт работает и при открытии файла с диска).
  var GRID_X = 64, GRID_Y = 32, grid = new Float32Array(GRID_X * GRID_Y), cells = 0;

  /* ---------- Слой «до» ---------- */
  function paintBefore() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    // Обрезка как у object-fit: cover
    var iw = beforeImg.naturalWidth, ih = beforeImg.naturalHeight;
    var scale = Math.max(W / iw, H / ih);
    var dw = iw * scale, dh = ih * scale;
    ctx.drawImage(beforeImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    grid.fill(0);
    cells = 0;
    for (var gy = 0; gy < GRID_Y; gy++) {
      for (var gx = 0; gx < GRID_X; gx++) {
        var fx = (gx + 0.5) / GRID_X, fy = (gy + 0.5) / GRID_Y;
        if (fx >= area[0] && fx <= area[2] && fy >= area[1] && fy <= area[3]) cells++;
      }
    }
  }

  function markGrid(x, y) {
    // x, y — в пикселях canvas
    var rx = radius / W * GRID_X, ry = radius / H * GRID_Y;
    var cx = x / W * GRID_X, cy = y / H * GRID_Y;
    for (var gy = Math.max(0, Math.floor(cy - ry)); gy <= Math.min(GRID_Y - 1, Math.ceil(cy + ry)); gy++) {
      for (var gx = Math.max(0, Math.floor(cx - rx)); gx <= Math.min(GRID_X - 1, Math.ceil(cx + rx)); gx++) {
        var dx = (gx + 0.5 - cx) / rx, dy = (gy + 0.5 - cy) / ry, d = dx * dx + dy * dy;
        if (d > 1) continue;
        var i = gy * GRID_X + gx;
        grid[i] = Math.min(1, grid[i] + 0.35 * (1 - d));
      }
    }
  }

  function progress() {
    if (!cells) return 0;
    var sum = 0;
    for (var gy = 0; gy < GRID_Y; gy++) {
      for (var gx = 0; gx < GRID_X; gx++) {
        var fx = (gx + 0.5) / GRID_X, fy = (gy + 0.5) / GRID_Y;
        if (fx >= area[0] && fx <= area[2] && fy >= area[1] && fy <= area[3]) sum += grid[gy * GRID_X + gx] >= 0.6 ? 1 : 0;
      }
    }
    return sum / cells;
  }

  function scheduleCheck() {
    if (checkTimer || done) return;
    checkTimer = setTimeout(function () {
      checkTimer = 0;
      var p = progress();
      if (p >= DONE_AT) finish();
      else if (touched) hint.innerHTML = 'Отполировано <b>' + Math.round(p * 100) + '%</b>';
    }, 200);
  }

  function finish() {
    done = true;
    box.classList.add('is-done');
    box.classList.remove('is-spinning');
    hint.textContent = 'Готово — кузов отполирован';
    reset.hidden = false;
    setTimeout(function () { if (done) ctx.clearRect(0, 0, W, H); }, 850);
  }

  /* ---------- Стирание мягкой круглой кистью ---------- */
  function dab(x, y) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    g.addColorStop(0.6, 'rgba(0, 0, 0, 0.4)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    markGrid(x, y);
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

  /* ---------- Машинка плавно догоняет курсор ---------- */
  function placeTool() {
    var size = tool.offsetWidth;
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
    if (e.pointerType !== 'mouse' || !W) return;
    stopDemo();
    var p = local(e);
    pos.x = view.x = p.x; pos.y = view.y = p.y;
    placeTool();
    last = null;
    box.classList.add('is-active');
  });

  box.addEventListener('pointerdown', function (e) {
    if (e.target === reset || !W) return;
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
    if (!W) return;
    var p = local(e);
    pos.x = p.x; pos.y = p.y;
    kick();
    // Мышью полируем наведением, на сенсоре — касанием
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
    paintBefore();
    last = null;
  });

  /* ---------- Подсказка: машинка сама делает короткий проход по кузову ---------- */
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
      var x = bw * (0.3 + 0.32 * t);
      var y = bh * (0.64 + 0.06 * Math.sin(t * Math.PI * 4));
      pos.x = view.x = x; pos.y = view.y = y;
      placeTool();
      polishTo(x * dpr, y * dpr);
      if (t < 1 && !touched) demoRaf = requestAnimationFrame(step);
      else { demoRaf = 0; box.classList.remove('is-demo', 'is-spinning'); last = null; }
    })(t0);
  }

  /* ---------- Размеры ---------- */
  function setup() {
    var rect = box.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(rect.width * dpr);
    H = Math.round(rect.height * dpr);
    canvas.width = W;
    canvas.height = H;
    radius = Math.max(22, rect.width * 0.07) * dpr;
    box.style.setProperty('--tool-size', Math.round(radius / dpr * 2 * 1.2) + 'px');
    if (done) return;
    paintBefore();
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var rect = box.getBoundingClientRect();
      if (Math.round(rect.width * Math.min(window.devicePixelRatio || 1, 2)) === W) return;
      setup();   // при смене размера слой «до» рисуется заново
    }, 200);
  });

  function start() {
    box.classList.add('is-ready');
    hint.textContent = HINT_START;
    setup();
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        demoTimer = setTimeout(demo, 1400);
      }, { threshold: 0.6 });
      io.observe(box);
    }
  }

  // Ждём обе картинки: «после» в разметке и «до» для canvas
  var afterImg = box.querySelector('img');
  var pending = 2;
  function ready() { if (--pending === 0) start(); }
  beforeImg.onload = ready;
  beforeImg.onerror = function () { /* без «до» оставляем просто фото «после» */ };
  beforeImg.src = beforeSrc;
  if (afterImg && !afterImg.complete) afterImg.addEventListener('load', ready, { once: true });
  else ready();
})();
