const form = document.getElementById('quote');
const statusBox = document.getElementById('status');
const link = document.getElementById('link');
const paymentForm = document.getElementById('payment-status');
const paymentResult = document.getElementById('payment-result');
const orderInput = document.getElementById('order-id');
let previous = '';
let requestId = '';
let ownerSignedIn = false;
let ready = false;
let live = false;

fetch('/api/square-health').then(response => response.json()).then(config => {
  live = config.environment === 'production';
  ready = config.connected === true && config.enabled === true;
  document.getElementById('mode').textContent = !ready ? 'Payments unavailable. Contact the owner.' : live ? 'LIVE PAYMENTS: real money can be collected from approved links.' : 'Sandbox only. No real money is collected.';
  if (!ready) return null;
  form.querySelector('button').disabled = false;
  paymentForm.querySelector('button').disabled = false;
  if (live) { document.getElementById('owner-account').hidden = false; return null; }
  return fetch('/api/account').then(response => response.ok ? response.json() : null);
}).then(account => {
  if (!account?.owner) return;
  ownerSignedIn = true;
  const key = document.getElementById('key');
  key.required = false;
  key.closest('.lx-field').hidden = true;
  statusBox.textContent = 'Signed in as owner.';
}).catch(() => {});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready) return;
  const button = form.querySelector('button');
  button.disabled = true;
  const description = document.getElementById('description').value.trim();
  const amountCents = Math.round(Number(document.getElementById('amount').value) * 100);
  const signature = JSON.stringify([description, amountCents]);
  if (signature !== previous) {
    requestId = crypto.randomUUID();
    previous = signature;
  }
  link.hidden = true;
  statusBox.textContent = live ? 'Creating live payment link…' : 'Creating sandbox link…';
  try {
    const response = await fetch('/api/square-approved-checkout', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ownerKey: document.getElementById('key').value, description, amountCents, requestId})
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Request failed');
    const url = new URL(data.url);
    if (url.protocol !== 'https:') throw Error('Invalid checkout URL');
    link.href = url.href;
    link.hidden = false;
    orderInput.value = data.orderId;
    paymentResult.textContent = '';
    statusBox.textContent = live ? 'Live link ready. Send it only to the customer who approved this price.' : 'Test link ready. Copy the link or open it to test.';
    previous = '';
  } catch (error) {
    statusBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

paymentForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready) return;
  const key = document.getElementById('key');
  if (!ownerSignedIn && !key.reportValidity()) return;
  const button = paymentForm.querySelector('button');
  button.disabled = true;
  const orderId = orderInput.value.trim();
  paymentResult.textContent = 'Checking Square payment…';
  try {
    const response = await fetch('/api/square-approved-checkout', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'status', ownerKey: key.value, orderId})
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Payment status unavailable');
    if (orderInput.value.trim() !== orderId) return;
    const labels = {
      paid: 'Paid', unpaid: 'Unpaid', pending: 'Payment pending',
      partially_paid: 'Partially paid', refunded: 'Refunded',
      partially_refunded: 'Partially refunded', canceled: 'Canceled'
    };
    const money = cents => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(cents / 100);
    paymentResult.textContent = (labels[data.paymentStatus] || 'Status unavailable') +
      ' — ' + money(data.paidCents) + ' received of ' + money(data.totalCents) +
      (data.refundedCents ? ' · ' + money(data.refundedCents) + ' refunded' : '') +
      (data.environment === 'production' ? ' · LIVE · Checked ' : ' · Sandbox · Checked ') + new Date().toLocaleTimeString();
  } catch (error) {
    paymentResult.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
