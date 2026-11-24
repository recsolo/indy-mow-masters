const crypto = require('node:crypto');
module.exports = async function(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method !== 'POST') return res.status(405).json({error:'POST required'});
 if(process.env.VERCEL_ENV !== 'preview') return res.status(404).json({error:'Not available'});
 const secret=process.env.SQUARE_OWNER_KEY, token=process.env.SQUARE_ACCESS_TOKEN;
 if(!secret || secret.length<24 || !token) return res.status(503).json({error:'Owner checkout not configured'});
 const body=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return null}})():req.body;
 const supplied=typeof body?.ownerKey==='string'?body.ownerKey:'';
 const hash=s=>crypto.createHash('sha256').update(s).digest();
 if(!crypto.timingSafeEqual(hash(secret),hash(supplied))) return res.status(401).json({error:'Unauthorized'});
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