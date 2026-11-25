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
  const {service, yard_size: size, service_plan: plan, city,
    overgrown_grass: grass, mowing_schedule: schedule} = form.elements;
  const sizeField = document.getElementById('mowing-size-field');
  const planField = document.getElementById('mowing-plan-field');
  const scheduleField = document.getElementById('mowing-schedule-field');
  const overgrowthField = document.getElementById('overgrowth-field');
  const rateCards = new Map(Array.from(document.querySelectorAll('[data-yard-rate]'),
    card => [card.dataset.yardRate, card.dataset]));

  function updateEstimate() {
    const mowing = service.value === 'Lawn Mowing';
    if (sizeField) {
      sizeField.hidden = !mowing;
      size.disabled = !mowing;
    }
    if (planField) {
      planField.hidden = !mowing;
      plan.disabled = !mowing;
    }
    if (scheduleField) scheduleField.hidden = !mowing;
    schedule.disabled = !mowing;
    overgrowthField.hidden = !mowing;
    grass.disabled = !mowing;
    const rates = rateCards.get(size.selectedOptions[0]?.dataset.size);
    if (!mowing || !rates || (plan && plan.selectedIndex !== 0)) {
      estimate.textContent = '';
      return;
    }

    const travel = city?.value.startsWith('Other') ? 10 : 0;
    const overgrowth = grass.checked ? Number(grass.dataset.estimateAddOn) : 0;
    const first = Number(rates.single) + travel + overgrowth;
    const firstVisit = overgrowth
      ? 'Estimated first cut: $' + first + ' (includes $' + overgrowth +
        ' for overgrown grass). Final price may be higher after we review your lawn.'
      : 'First cut normally starts at $' + first + '.';
    const travelNote = !city?.value ? ' Add $10 per visit for eligible out-of-area addresses.' : '';
    const schedules = {
      'Weekly pay per visit': {rate: Number(rates.weekly) + travel, cuts: 1},
      'Every other week pay per visit': {rate: Number(rates.alternate) + travel, cuts: 1},
      'Weekly prepay': {rate: Number(rates.weekly) + travel - 5, cuts: 4},
      'Every other week prepay': {rate: Number(rates.alternate) + travel - 5, cuts: 2}
    };
    const next = schedules[schedule.value];
    const ongoing = !next ? '' : next.cuts === 1
      ? ' Recurring service starts at $' + next.rate + ' per visit.'
      : ' Prepay starts at $' + (next.rate * next.cuts) + ' for ' + next.cuts +
        ' cuts ($' + next.rate + ' per cut).';
    estimate.textContent = firstVisit + ongoing + travelNote;
  }

  document.querySelectorAll('[data-yard], [data-economy]').forEach(link => {
    link.addEventListener('click', () => {
      service.value = 'Lawn Mowing';
      if (plan) plan.selectedIndex = link.hasAttribute('data-economy') ? 1 : 0;
      const choice = Array.from(size.options).find(option => option.dataset.size === link.dataset.yard);
      if (link.dataset.yard && choice) size.value = choice.value;
      updateEstimate();
    });
  });
  form.addEventListener('change', updateEstimate);
  window.addEventListener('pageshow', updateEstimate);
  updateEstimate();
})();
