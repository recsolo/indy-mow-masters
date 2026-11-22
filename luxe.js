/* Indy Mow Masters — shared UI behaviour (nav, reveal, 3D tilt, year).
   Everything here is progressive enhancement: the site works without it. */
(function () {
  var root = document.documentElement;
  root.classList.add('lx-js');

  function ready(fn) {
    if (document.readyState !== 'loading') { fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
  }

  ready(function () {
    /* footer year */
    document.querySelectorAll('#yr, [data-year]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });

    /* mobile menu */
    var burger = document.querySelector('.lx-burger');
    var nav = document.getElementById('lx-nav');
    if (burger && nav) {
      var setOpen = function (open) {
        nav.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      burger.addEventListener('click', function () {
        setOpen(burger.getAttribute('aria-expanded') !== 'true');
      });
      nav.addEventListener('click', function (e) {
        if (e.target.closest('a')) { setOpen(false); }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { setOpen(false); }
      });
    }

    /* mark the current page in the nav */
    var here = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    document.querySelectorAll('.lx-nav a').forEach(function (a) {
      var path = a.getAttribute('href').split('#')[0].replace(/\/$/, '') || '/';
      if (path === here) { a.setAttribute('aria-current', 'page'); }
    });

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* scroll reveal */
    var revealEls = document.querySelectorAll('.lx-reveal');
    if (reduce || !('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      revealEls.forEach(function (el) { io.observe(el); });
    }

    /* pointer tilt — fine pointers only, never on touch */
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (fine && !reduce) {
      document.querySelectorAll('[data-tilt]').forEach(function (el) {
        var max = parseFloat(el.getAttribute('data-tilt')) || 5;
        var frame = 0;
        el.addEventListener('pointermove', function (e) {
          var r = el.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width;
          var py = (e.clientY - r.top) / r.height;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(function () {
            el.style.setProperty('--ry', ((px - 0.5) * 2 * max).toFixed(2) + 'deg');
            el.style.setProperty('--rx', ((0.5 - py) * 2 * max).toFixed(2) + 'deg');
            el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
            el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
          });
        });
        el.addEventListener('pointerleave', function () {
          cancelAnimationFrame(frame);
          ['--rx', '--ry', '--gx', '--gy'].forEach(function (p) { el.style.removeProperty(p); });
        });
      });
    }
  });
})();

/* Carry a selected mowing package into the quote and preview published rates. */
(function () {
  const estimate = document.getElementById('mowing-estimate');
  if (!estimate) return;
  const form = estimate.closest('form');
  const {service, yard_size: size, service_plan: plan, city, overgrown_grass: grass} = form.elements;

  function updateEstimate() {
    const rate = Number(size.selectedOptions[0]?.dataset.rate);
    if (service.value !== 'Lawn Mowing' || !rate || plan.selectedIndex !== 0) {
      estimate.textContent = '';
      return;
    }
    const visit = rate + (city.value.startsWith('Other') ? 10 : 0);
    const firstVisit = visit + (grass.value.startsWith('Yes') ? 20 : 0);
    estimate.textContent = 'Estimated mowing rate: $' + visit + ' per visit.' +
      (firstVisit !== visit ? ' First visit: $' + firstVisit + ' with overgrowth.' : '') +
      (!city.value ? ' Outside the service area, add $10.' : '') +
      (grass.value === 'Not sure' ? ' Overgrowth may add $20 on the first visit.' : '');
  }

  document.querySelectorAll('[data-yard], [data-economy]').forEach(link => {
    link.addEventListener('click', () => {
      service.value = 'Lawn Mowing';
      plan.selectedIndex = link.hasAttribute('data-economy') ? 1 : 0;
      const choice = Array.from(size.options).find(option => option.dataset.size === link.dataset.yard);
      if (link.dataset.yard && choice) size.value = choice.value;
      updateEstimate();
    });
  });
  form.addEventListener('change', updateEstimate);
  window.addEventListener('pageshow', updateEstimate);
  updateEstimate();
})();
