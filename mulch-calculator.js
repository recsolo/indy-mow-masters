/* Mulch calculator: bed area x depth -> cubic yards, 2 cu ft bags, and
   coverage. Copies the result into the quote form so the number reaches us. */
document.addEventListener('DOMContentLoaded', function () {
  var packageSelect = document.getElementById('mulch-package');
  if (packageSelect) {
    document.querySelectorAll('[data-mulch-package]').forEach(function (link) {
      link.addEventListener('click', function () {
        packageSelect.value = link.dataset.mulchPackage;
      });
    });
  }

  var calc = document.querySelector('[data-mulch-calc]');
  if (!calc) { return; }

  var len = calc.querySelector('[name="calc_length"]');
  var wid = calc.querySelector('[name="calc_width"]');
  var depth = calc.querySelector('[name="calc_depth"]');
  var outYards = calc.querySelector('[data-out="yards"]');
  var outBags = calc.querySelector('[data-out="bags"]');
  var outArea = calc.querySelector('[data-out="area"]');
  var estimateField = document.querySelector('[name="mulch_estimate"]');
  var useBtn = calc.querySelector('[data-use-estimate]');

  function update() {
    var l = parseFloat(len.value);
    var w = parseFloat(wid.value);
    var d = parseFloat(depth.value);
    var area = l * w;
    var valid = l > 0 && w > 0 && d > 0 && Number.isFinite(area);
    if (useBtn) { useBtn.disabled = !valid; }
    if (!valid) {
      outYards.textContent = '—';
      outBags.textContent = '—';
      outArea.textContent = '—';
      if (estimateField) { estimateField.value = ''; }
      return;
    }
    var cubicFeet = area * (d / 12);
    var yards = cubicFeet / 27;
    var roundedYards = Math.ceil(yards * 2) / 2;   // suppliers sell in half yards
    var bags = Math.ceil(cubicFeet / 2);           // standard 2 cu ft bag
    outYards.textContent = roundedYards.toFixed(1);
    outBags.textContent = String(bags);
    outArea.textContent = Math.round(area).toLocaleString();
    if (estimateField) {
      estimateField.value = Math.round(area) + ' sq ft at ' + d + ' in = about ' +
        roundedYards.toFixed(1) + ' cubic yards (' + bags + ' two-cubic-foot bags)';
    }
  }

  [len, wid, depth].forEach(function (el) {
    el.addEventListener('input', update);
    el.addEventListener('change', update);
  });
  if (useBtn) {
    useBtn.addEventListener('click', function () {
      var form = document.getElementById('contact');
      if (form) { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  }
  update();
});
