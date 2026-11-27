const crypto = require('node:crypto');
const {account, sameOrigin} = require('../lib/accounts');
module.exports = async function(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method !== 'POST') return res.status(405).json({error:'POST required'});
 if(process.env.VERCEL_ENV !== 'preview') return res.status(404).json({error:'Not available'});
 const secret=process.env.SQUARE_OWNER_KEY, token=process.env.SQUARE_ACCESS_TOKEN;
 const ownerKeyPresent = Boolean(secret);
 const ownerKeyReady = ownerKeyPresent && secret.length >= 24;
 const accessTokenPresent = Boolean(token);
 if (!ownerKeyReady || !accessTokenPresent) {
   console.warn('Sandbox checkout configuration', {ownerKeyPresent, ownerKeyReady, accessTokenPresent});
   return res.status(503).json({error:'Owner checkout not configured'});
 }
 const body=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return null}})():req.body;
 const supplied=typeof body?.ownerKey==='string'?body.ownerKey:'';
 const hash=s=>crypto.createHash('sha256').update(s).digest();
 if (!crypto.timingSafeEqual(hash(secret),hash(supplied))) {
   if (!sameOrigin(req)) return res.status(401).json({error:'Unauthorized'});
   try {
     const current = await account(req, res);
     if (!current?.owner) return res.status(401).json({error:'Owner sign-in required'});
   } catch { return res.status(503).json({error:'Owner sign-in could not be verified'}); }
 }
 if (body.action === 'status') {
   const {orderId} = body;
   if (typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{1,192}$/.test(orderId)) {
     return res.status(400).json({error:'Enter a valid Square order ID'});
   }
   const headers = {Authorization:'Bearer ' + token, 'Square-Version':'2025-10-16'};
   try {
     const response = await fetch('https://connect.squareupsandbox.com/v2/orders/' + encodeURIComponent(orderId), {
       headers, signal:AbortSignal.timeout(8000)
     });
     const data = await response.json();
     if (response.status === 404) return res.status(404).json({error:'Sandbox order not found'});
     if (!response.ok || !data.order) return res.status(502).json({error:'Square could not retrieve the order'});
     const order = data.order;
     const total = order.total_money;
     if (total?.currency !== 'USD' || !Number.isSafeInteger(total.amount) || total.amount <= 0) {
       return res.status(502).json({error:'A positive USD order is required'});
     }
     const paymentIds = [...new Set((order.tenders || []).map(tender => tender.payment_id || tender.id).filter(Boolean))];
     const payments = await Promise.all(paymentIds.map(async paymentId => {
       const paymentResponse = await fetch('https://connect.squareupsandbox.com/v2/payments/' + encodeURIComponent(paymentId), {
         headers, signal:AbortSignal.timeout(8000)
       });
       const result = await paymentResponse.json();
       if (!paymentResponse.ok || !result.payment || result.payment.order_id !== orderId) throw Error('Payment unavailable');
       return result.payment;
     }));
     let paidCents = 0;
     let refundedCents = 0;
     for (const payment of payments) {
       if (payment.status !== 'COMPLETED') continue;
       if (payment.total_money?.currency !== 'USD' || !Number.isSafeInteger(payment.total_money.amount)) throw Error('Invalid payment');
       paidCents += payment.total_money.amount;
       refundedCents += payment.refunded_money?.amount || 0;
     }
     const netPaidCents = Math.max(0, paidCents - refundedCents);
     let paymentStatus = 'unpaid';
     if (order.state === 'CANCELED') paymentStatus = 'canceled';
     if (payments.some(payment => ['APPROVED', 'PENDING'].includes(payment.status))) paymentStatus = 'pending';
     if (netPaidCents > 0) paymentStatus = 'partially_paid';
     if (netPaidCents >= total.amount) paymentStatus = 'paid';
     if (refundedCents > 0) paymentStatus = netPaidCents === 0 ? 'refunded' : 'partially_refunded';
     return res.status(200).json({environment:'sandbox', orderId, paymentStatus, totalCents:total.amount, paidCents:netPaidCents, refundedCents});
   } catch {
     return res.status(502).json({error:'Square payment status could not be verified. Try again.'});
   }
 }
 const {amountCents,description,requestId}=body;
 if(!Number.isSafeInteger(amountCents)||amountCents<100||amountCents>1000000||typeof description!=='string'||!description.trim()||description.length>120||typeof requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(requestId)) return res.status(400).json({error:'Invalid approved quote'});
 const headers={Authorization:'Bearer '+token,'Square-Version':'2025-10-16','Content-Type':'application/json'};
 try {
 const loc=await fetch('https://connect.squareupsandbox.com/v2/locations',{headers,signal:AbortSignal.timeout(8000)});
 const data=await loc.json();
 const active=(data.locations||[]).filter(x=>x.status==='ACTIVE'&&x.currency==='USD');
 if(!loc.ok||active.length!==1) return res.status(502).json({error:'Exactly one active USD sandbox location required'});
 const response=await fetch('https://connect.squareupsandbox.com/v2/online-checkout/payment-links',{method:'POST',headers,signal:AbortSignal.timeout(10000),body:JSON.stringify({idempotency_key:requestId,quick_pay:{name:description.trim(),price_money:{amount:amountCents,currency:'USD'},location_id:active[0].id}})});
 const result=await response.json();
 if(!response.ok||!result.payment_link?.url) return res.status(502).json({error:'Square could not create checkout'});
 return res.status(200).json({url:result.payment_link.url,orderId:result.payment_link.order_id,environment:'sandbox'});
 }catch{return res.status(502).json({error:'Square request failed'});}
};
