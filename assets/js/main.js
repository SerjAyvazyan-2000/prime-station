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

  /* ---------- Текущий год ---------- */
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
