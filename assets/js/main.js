/* Prime Station: мобильное меню, текущий раздел, карта по нажатию, год.
   Весь контент доступен без JS; скрипт только улучшает поведение. */
(function () {
  'use strict';

  var root = document.documentElement;
  var burger = document.querySelector('.burger');
  var nav = document.getElementById('site-nav');
  var desktop = window.matchMedia('(min-width: 1024px)');

  /* ---------- Мобильное меню ---------- */
  function isOpen() { return burger && burger.getAttribute('aria-expanded') === 'true'; }

  function setMenu(open, returnFocus) {
    if (!burger || !nav) return;
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    nav.classList.toggle('is-open', open);
    root.classList.toggle('menu-open', open);
    if (open) {
      var first = nav.querySelector('a');
      if (first) first.focus();
    } else if (returnFocus) {
      burger.focus();
    }
  }

  if (burger && nav) {
    burger.addEventListener('click', function () { setMenu(!isOpen()); });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a') && isOpen()) setMenu(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) setMenu(false, true);
    });

    // Фокус ушёл за пределы меню и кнопки — закрываем, не блокируя навигацию
    nav.addEventListener('focusout', function (e) {
      if (!isOpen()) return;
      var next = e.relatedTarget;
      if (next && !nav.contains(next) && next !== burger) setMenu(false);
    });

    var onChange = function () { if (desktop.matches && isOpen()) setMenu(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onChange);
    else if (desktop.addListener) desktop.addListener(onChange);
  }

  /* ---------- Подсветка текущего раздела ---------- */
  if (nav && 'IntersectionObserver' in window) {
    var links = {};
    Array.prototype.forEach.call(nav.querySelectorAll('a[href^="#"]'), function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].removeAttribute('aria-current'); });
        var link = links[entry.target.id];
        if (link) link.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(links).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  /* ---------- Карта загружается только по нажатию ---------- */
  var mapBtn = document.querySelector('[data-map-src]');
  if (mapBtn) {
    mapBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var box = document.getElementById('map');
      var frame = document.createElement('iframe');
      frame.src = mapBtn.getAttribute('data-map-src');
      frame.title = 'Prime Station на Яндекс Картах';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      frame.setAttribute('allowfullscreen', '');
      box.appendChild(frame);
      var ph = box.querySelector('.map__placeholder');
      if (ph) ph.hidden = true;
      frame.focus();
    });
  }

  /* ---------- Плавное появление при прокрутке ---------- */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealSelector = [
    '.section__head', '.reviews__text', '.reviews__actions',
    '.card', '.price-nav', '.price-group', '.price-cta',
    '.work', '.step', '.steps__btn', '.faq details',
    '.contacts__card', '.map', '.footer__grid > *'
  ].join(',');

  if ('IntersectionObserver' in window && !reduceMotion) {
    var items = document.querySelectorAll(revealSelector);

    Array.prototype.forEach.call(items, function (el) {
      el.setAttribute('data-reveal', '');
      // Соседние элементы одного ряда появляются по очереди
      var siblings = Array.prototype.filter.call(el.parentNode.children, function (s) { return s.matches(revealSelector); });
      var index = siblings.indexOf(el);
      if (index > 0) el.style.setProperty('--reveal-delay', Math.min(index * 90, 450) + 'ms');
    });

    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    Array.prototype.forEach.call(items, function (el) { revealer.observe(el); });
    root.classList.add('reveal-ready');

    // Переход по якорю или поиск по странице: показать элемент сразу, без ожидания
    var showNow = function (target) {
      if (!target) return;
      var el = target.closest('[data-reveal]') || target;
      Array.prototype.forEach.call(el.querySelectorAll('[data-reveal]'), function (c) { c.classList.add('is-visible'); });
      if (el.hasAttribute('data-reveal')) el.classList.add('is-visible');
    };
    window.addEventListener('hashchange', function () { showNow(document.getElementById(location.hash.slice(1))); });
    document.addEventListener('focusin', function (e) {
      var host = e.target.closest && e.target.closest('[data-reveal]');
      if (host) host.classList.add('is-visible');
    });
    // Низ страницы: последние элементы могут не дойти до зоны срабатывания
    window.addEventListener('scroll', function () {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        Array.prototype.forEach.call(items, function (el) { el.classList.add('is-visible'); });
      }
    }, { passive: true });
    window.addEventListener('beforeprint', function () {
      Array.prototype.forEach.call(items, function (el) { el.classList.add('is-visible'); });
    });
  }

  /* ---------- Тень шапки после начала прокрутки ---------- */
  var header = document.querySelector('.header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Уведомление о cookie ---------- */
  var note = document.getElementById('cookie-note');
  var KEY = 'ps-cookie-note-closed';
  if (note) {
    var closed = false;
    try { closed = window.localStorage.getItem(KEY) === '1'; } catch (err) { /* хранилище недоступно */ }
    if (!closed) note.hidden = false;

    var ok = note.querySelector('[data-cookie-ok]');
    var closeNote = function () {
      try { window.localStorage.setItem(KEY, '1'); } catch (err) { /* хранилище недоступно */ }
      note.classList.add('is-leaving');
      setTimeout(function () { note.hidden = true; }, reduceMotion ? 0 : 250);
    };
    if (ok) ok.addEventListener('click', closeNote);
    var more = note.querySelector('a[href="#cookies"]');
    if (more) more.addEventListener('click', function () { closeNote(); });
  }

  /* ---------- Текущий год ---------- */
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
