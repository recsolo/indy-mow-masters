let state;
let card;
let pendingCard;
let bookingId = crypto.randomUUID();
let historyId = crypto.randomUUID();
const message = document.getElementById('message');
const money = cents => cents == null ? 'Awaiting quote' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents / 100);
const date = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
const fields = form => Object.fromEntries(new FormData(form));

async function request(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    const error = Error(data.error || 'Your request could not be completed');
    error.status = response.status;
    throw error;
  }
  return data;
}

function notice(text) {
  message.textContent = text;
  message.scrollIntoView({block:'nearest'});
}

function onSubmit(id, action) {
  document.getElementById(id).addEventListener('submit', async event => {
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll('button')];
    buttons.forEach(button => button.disabled = true);
    try { await action(event.currentTarget, event.submitter); }
    catch (error) { notice(error.message); }
    finally { buttons.forEach(button => button.disabled = false); }
  });
}

function text(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function record(title, details) {
  const node = document.createElement('article');
  node.className = 'record';
  node.append(text('strong', title));
  details.forEach(detail => node.append(text('p', detail)));
  return node;
}

function renderRecords(id, rows, empty) {
  const target = document.getElementById(id);
  target.replaceChildren(...(rows.length ? rows : [text('p', empty)]));
}

function render() {
  document.getElementById('auth').hidden = true;
  document.getElementById('dashboard').hidden = false;
  document.getElementById('account-nav').hidden = false;
  document.getElementById('owner-panel').hidden = !state.owner;
  const profile = state.profiles.find(profile => profile.id === state.userId) || {};
  const profileForm = document.getElementById('profile-form');
  for (const name of ['name','phone','address','city','zip','notes']) profileForm.elements[name].value = profile[name] || '';
  document.getElementById('account-email').textContent = state.email;
  const summary = document.getElementById('profile-summary');
  summary.replaceChildren();
  for (const [label, value] of [['Name',profile.name],['Address',profile.address],['Phone',profile.phone]]) {
    summary.append(text('dt',label), text('dd',value || 'Add to your profile'));
  }
  const ownBookings = state.bookings.filter(booking => booking.user_id === state.userId);
  const upcoming = ownBookings.filter(booking => ['approved','scheduled'].includes(booking.status));
  renderRecords('upcoming', upcoming.map(booking => record(booking.service, [
    booking.scheduled_date ? date(booking.scheduled_date) : 'Scheduling in progress',money(booking.quote_cents)
  ])), 'No services scheduled.');
  renderRecords('booking-list', ownBookings.map(booking => record(booking.service, [
    'Requested ' + date(booking.preferred_date) + ' · ' + booking.status,
    money(booking.quote_cents), booking.notes
  ])), 'You have no booking requests yet.');
  const ownHistory = state.history.filter(item => item.user_id === state.userId);
  document.getElementById('history-summary').textContent = ownHistory.length ? ownHistory.length + ' completed service records.' : 'Completed services will appear here.';
  renderRecords('history-list', ownHistory.map(item => record(item.service, [date(item.service_date),money(item.amount_cents),item.notes])), 'No completed services yet.');
  if (state.owner) renderOwner();
}

function renderOwner() {
  const clients = document.getElementById('history-client');
  clients.replaceChildren(...state.profiles.map(profile => {
    const option = text('option', (profile.name || 'Unnamed client') + ' — ' + (profile.address || profile.id));
    option.value = profile.id;
    return option;
  }));
  renderRecords('owner-bookings', state.bookings.map(booking => {
    const profile = state.profiles.find(profile => profile.id === booking.user_id);
    const node = record(booking.service + ' — ' + (profile?.name || 'Client'), [
      profile?.address || '', profile?.phone || '', 'Preferred ' + date(booking.preferred_date),booking.notes
    ]);
    const form = document.createElement('form');
    const statusLabel = text('label','Status');
    const status = document.createElement('select');
    for (const value of ['requested','approved','scheduled','completed','declined','canceled']) {
      const option = text('option',value);
      option.value = value;
      status.append(option);
    }
    status.value = booking.status;
    statusLabel.append(status);
    const scheduledLabel = text('label','Scheduled date');
    const scheduled = document.createElement('input');
    scheduled.type = 'date';
    scheduled.value = booking.scheduled_date || '';
    scheduledLabel.append(scheduled);
    const quoteLabel = text('label','Approved total (USD)');
    const quote = document.createElement('input');
    quote.type = 'number'; quote.min = '1'; quote.max = '10000'; quote.step = '.01';
    quote.value = booking.quote_cents == null ? '' : (booking.quote_cents / 100).toFixed(2);
    quoteLabel.append(quote);
    const save = text('button','Save request');
    form.append(statusLabel, scheduledLabel, quoteLabel, save);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true;
      try {
        await request('/api/account', {action:'updateBooking',id:booking.id,status:status.value,
          scheduledDate:scheduled.value,quoteCents:quote.value ? Math.round(Number(quote.value) * 100) : null});
        await load();
        notice('Booking updated.');
      } catch (error) { notice(error.message); }
      finally { save.disabled = false; }
    });
    node.append(form);
    return node;
  }), 'No client requests yet.');
}

async function load() {
  state = await request('/api/account');
  render();
}

onSubmit('auth-form', async (form, button) => {
  const result = await request('/api/account', {...fields(form),action:button.value});
  if (result.signedIn) {
    form.reset();
    await load();
    notice('You are signed in.');
    await loadCards();
  } else notice(result.message);
});
onSubmit('verify-form', async form => {
  const values = fields(form);
  await request('/api/account', {...values,action:'verify',recovery:!!values.recovery});
  await load();
  notice('Email confirmed. You are signed in.');
});
onSubmit('profile-form', async form => {
  await request('/api/account', {...fields(form),action:'profile'});
  await load();
  notice('Profile saved.');
});
onSubmit('booking-form', async form => {
  const profile = state.profiles.find(profile => profile.id === state.userId);
  if (!profile?.address || !profile.name || !profile.phone) {
    location.hash = 'profile';
    throw Error('Save your name, phone, and service address before requesting a booking.');
  }
  await request('/api/account', {...fields(form),action:'requestBooking',id:bookingId});
  bookingId = crypto.randomUUID();
  form.reset();
  await load();
  notice('Booking request received. We will review your preferred date and confirm the price.');
});
onSubmit('history-form', async form => {
  const values = fields(form);
  await request('/api/account', {...values,action:'recordService',id:historyId,amountCents:values.amount ? Math.round(Number(values.amount) * 100) : null});
  historyId = crypto.randomUUID();
  form.reset();
  await load();
  notice('Completed service added to the client’s history.');
});
onSubmit('password-form', async form => {
  await request('/api/account', {...fields(form),action:'password'});
  form.reset();
  notice('Password updated.');
});
document.getElementById('forgot').addEventListener('click', async () => {
  const email = document.getElementById('auth-form').elements.email;
  if (!email.reportValidity()) return;
  try { notice((await request('/api/account',{action:'recover',email:email.value})).message); }
  catch (error) { notice(error.message); }
});
document.getElementById('signout').addEventListener('click', async () => {
  try {
    await request('/api/account',{action:'logout'});
    location.reload();
  } catch (error) { notice(error.message); }
});

async function loadCards() {
  try {
    const {cards} = await request('/api/payment-methods');
    renderRecords('card-list', cards.map(saved => {
      const node = record(saved.brand + ' ending in ' + saved.last4, ['Expires ' + saved.month + '/' + saved.year]);
      const remove = text('button','Remove card');
      remove.className = 'text-button';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          await request('/api/payment-methods',{action:'remove',cardId:saved.id});
          await loadCards();
          notice('Payment method removed.');
        } catch (error) { notice(error.message); }
        finally { remove.disabled = false; }
      });
      node.append(remove);
      return node;
    }), 'No saved payment methods.');
  } catch (error) { document.getElementById('card-list').textContent = error.message; }
}

document.getElementById('add-card').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const profile = state.profiles.find(profile => profile.id === state.userId);
    if (!profile?.name) throw Error('Save your profile name before adding a payment method.');
    const config = await request('/api/payment-methods?config=true');
    if (!window.Square) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://sandbox.web.squarecdn.com/v1/square.js';
        script.onload = resolve;
        script.onerror = () => reject(Error('Square’s secure card form could not load.'));
        document.head.append(script);
      });
    }
    document.getElementById('card-form').hidden = false;
    if (!card) {
      const payments = window.Square.payments(config.applicationId,config.locationId);
      card = await payments.card();
      await card.attach('#square-card');
    }
  } catch (error) { notice(error.message); }
  finally { button.disabled = false; }
});
onSubmit('card-form', async form => {
  const profile = state.profiles.find(profile => profile.id === state.userId);
  if (!card || !form.elements.consent.checked) throw Error('Confirm permission to save your card.');
  if (!pendingCard) {
    const result = await card.tokenize({
    intent:'STORE',customerInitiated:true,sellerKeyedIn:false,
    billingContact:{givenName:profile.name,email:state.email,phone:profile.phone,countryCode:'US',
      addressLines:[profile.address],city:profile.city,postalCode:profile.zip,state:'IN'}
    });
    if (result.status !== 'OK') throw Error('Please check your card details and try again.');
    pendingCard = {sourceId:result.token,requestId:crypto.randomUUID()};
  }
  await request('/api/payment-methods',{action:'save',...pendingCard,consent:true});
  pendingCard = null;
  await card.clear();
  form.elements.consent.checked = false;
  await loadCards();
  notice('Your test payment method was saved securely with Square.');
});

const today = new Date();
document.querySelector('[name="preferredDate"]').min = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
async function start() {
  const callback = new URLSearchParams(location.hash.slice(1));
  if (callback.has('access_token')) {
    const recovery = callback.get('type') === 'recovery';
    history.replaceState(null, '', location.pathname);
    await request('/api/account', {action:'callback',accessToken:callback.get('access_token'),refreshToken:callback.get('refresh_token')});
    await load();
    if (recovery) {
      document.querySelector('#password-form').closest('details').open = true;
      location.hash = 'password-form';
      notice('Choose a new password below.');
    }
  } else await load();
  await loadCards();
}
start().catch(error => {
  if (error.status !== 401) notice(error.message);
});
