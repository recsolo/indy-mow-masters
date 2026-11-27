const {account, supabase, sameOrigin, parseBody} = require('../lib/accounts');

async function square(path, method = 'GET', body) {
  const response = await fetch('https://connect.squareupsandbox.com/v2' + path, {
    method, headers:{Authorization:'Bearer ' + process.env.SQUARE_ACCESS_TOKEN, 'Square-Version':'2025-10-16','Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (!response.ok) throw Error('Square request failed');
  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({error:'Not available'});
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  if (req.method === 'POST' && !sameOrigin(req)) return res.status(403).json({error:'Please use this website'});
  try {
    const current = await account(req, res);
    if (!current) return res.status(401).json({error:'Please sign in'});
    const body = parseBody(req);
    if (req.method === 'POST' && body.action === 'save' &&
        (body.consent !== true || typeof body.sourceId !== 'string' || !body.sourceId || body.sourceId.length > 500 || !/^[a-f0-9-]{36}$/i.test(body.requestId || ''))) {
      return res.status(400).json({error:'Confirm permission to save your card'});
    }
    if (req.method === 'GET' && req.query?.config === 'true') {
      const locations = await square('/locations');
      const active = (locations.locations || []).filter(location => location.status === 'ACTIVE' && location.currency === 'USD');
      if (active.length !== 1 || !process.env.SQUARE_APPLICATION_ID) throw Error('Configuration missing');
      return res.json({applicationId:process.env.SQUARE_APPLICATION_ID,locationId:active[0].id,environment:'sandbox'});
    }
    const customers = await square('/customers/search','POST',{query:{filter:{reference_id:{exact:current.user.id}}},limit:2});
    let customer = customers.customers?.[0];
    if (customers.customers?.length > 1) throw Error('Ambiguous customer');
    if (!customer && req.method === 'GET') return res.json({cards:[]});
    if (!customer && body.action === 'save') {
      const profiles = await supabase('/rest/v1/profiles?id=eq.' + current.user.id, {token:current.token});
      if (!profiles[0]?.name) return res.status(400).json({error:'Save your profile name before adding a card'});
      const created = await square('/customers','POST',{idempotency_key:current.user.id,reference_id:current.user.id,
        email_address:current.user.email,given_name:profiles[0].name});
      customer = created.customer;
    }
    if (!customer || customer.reference_id !== current.user.id) throw Error('Customer unavailable');
    if (req.method === 'POST') {
      if (body.action === 'save') {
        if (body.consent !== true || typeof body.sourceId !== 'string' || body.sourceId.length > 500 || !/^[a-f0-9-]{36}$/i.test(body.requestId || '')) {
          return res.status(400).json({error:'Confirm permission to save your card'});
        }
        await square('/cards','POST',{idempotency_key:body.requestId,source_id:body.sourceId,card:{customer_id:customer.id}});
      } else if (body.action === 'remove') {
        if (typeof body.cardId !== 'string' || !/^[a-zA-Z0-9:_-]{1,192}$/.test(body.cardId)) return res.status(400).json({error:'Invalid payment method'});
        const result = await square('/cards/' + encodeURIComponent(body.cardId));
        if (result.card?.customer_id !== customer.id) return res.status(404).json({error:'Payment method not found'});
        await square('/cards/' + encodeURIComponent(body.cardId) + '/disable','POST',{});
      } else return res.status(400).json({error:'Unknown request'});
    }
    const result = await square('/cards?customer_id=' + encodeURIComponent(customer.id));
    return res.json({cards:(result.cards || []).filter(card => card.enabled && card.customer_id === customer.id).map(card => ({
      id:card.id,brand:card.card_brand,last4:card.last_4,month:card.exp_month,year:card.exp_year
    }))});
  } catch {
    return res.status(502).json({error:'Square could not complete the payment-method request. Please try again.'});
  }
};
