const {account, supabase, setSession, clearSession, sameOrigin, parseBody} = require('../lib/accounts');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({error:'Not available'});
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) return res.status(503).json({error:'Accounts are being configured'});
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  if (req.method === 'POST' && !sameOrigin(req)) return res.status(403).json({error:'Please use this website to submit your request'});
  const body = parseBody(req);
  const action = req.method === 'GET' ? 'session' : body.action;
  try {
    if (action === 'callback') {
      if (typeof body.accessToken !== 'string' || typeof body.refreshToken !== 'string' || body.accessToken.length > 8192 || body.refreshToken.length > 4096) {
        return res.status(400).json({error:'Invalid sign-in link'});
      }
      await supabase('/auth/v1/user', {token:body.accessToken});
      setSession(res, {access_token:body.accessToken,refresh_token:body.refreshToken,expires_in:3600});
      return res.json({signedIn:true});
    }
    if (['login', 'signup', 'verify', 'recover'].includes(action)) {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({error:'Enter a valid email address'});
      if (action === 'recover') {
        await supabase('/auth/v1/recover?redirect_to=' + encodeURIComponent('https://' + req.headers.host + '/account.html'), {method:'POST', body:{email}});
        return res.json({message:'If this account exists, a recovery email has been requested.'});
      }
      let session;
      if (action === 'verify') {
        if (typeof body.code !== 'string' || !/^\d{6,10}$/.test(body.code)) return res.status(400).json({error:'Enter the code from your email'});
        session = await supabase('/auth/v1/verify', {method:'POST',body:{email,token:body.code,type:body.recovery ? 'recovery' : 'signup'}});
      } else {
        if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) return res.status(400).json({error:'Use a password between 12 and 128 characters'});
        session = await supabase(action === 'signup' ? '/auth/v1/signup?redirect_to=' + encodeURIComponent('https://' + req.headers.host + '/account.html') : '/auth/v1/token?grant_type=password', {
          method:'POST',body:{email,password:body.password}
        });
      }
      if (session.access_token) {
        setSession(res, session);
        return res.json({signedIn:true});
      }
      return res.json({verificationRequired:true,message:'Check your email to confirm your account before signing in.'});
    }
    const current = await account(req, res);
    if (!current) return res.status(401).json({error:'Please sign in'});
    const {user, token, owner} = current;
    if (action === 'logout') {
      await supabase('/auth/v1/logout?scope=local', {token,method:'POST'});
      clearSession(res);
      return res.json({signedIn:false});
    }
    if (action === 'password') {
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) return res.status(400).json({error:'Use a password between 12 and 128 characters'});
      await supabase('/auth/v1/user', {token,method:'PUT',body:{password:body.password}});
      return res.json({saved:true});
    }
    if (action === 'profile') {
      const profile = {id:user.id};
      for (const [field, limit] of Object.entries({name:120,phone:30,address:250,city:100,zip:10,notes:1000})) {
        if (typeof body[field] !== 'string' || body[field].length > limit) return res.status(400).json({error:'Please check your profile fields'});
        profile[field] = body[field].trim();
      }
      await supabase('/rest/v1/profiles?on_conflict=id', {token,method:'POST',body:profile,prefer:'resolution=merge-duplicates'});
      return res.json({saved:true});
    }
    if (action === 'requestBooking') {
      const id = typeof body.id === 'string' && /^[a-f0-9-]{36}$/i.test(body.id) ? body.id : null;
      if (!id || typeof body.service !== 'string' || typeof body.preferredDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate) || typeof body.notes !== 'string' || body.notes.length > 2000) return res.status(400).json({error:'Please check your booking request'});
      await supabase('/rest/v1/bookings?on_conflict=id', {token,method:'POST',
        body:{id,user_id:user.id,service:body.service,preferred_date:body.preferredDate,notes:body.notes.trim()},
        prefer:'resolution=ignore-duplicates'});
      return res.json({saved:true});
    }
    if (action === 'updateBooking' && owner) {
      if (!/^[a-f0-9-]{36}$/i.test(body.id || '')) return res.status(400).json({error:'Invalid booking'});
      const changes = {status:body.status,scheduled_date:body.scheduledDate || null,quote_cents:body.quoteCents ?? null};
      await supabase('/rest/v1/bookings?id=eq.' + body.id, {token,method:'PATCH',body:changes});
      return res.json({saved:true});
    }
    if (action === 'recordService' && owner) {
      if (!/^[a-f0-9-]{36}$/i.test(body.id || '') || !/^[a-f0-9-]{36}$/i.test(body.userId || '') || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return res.status(400).json({error:'Check the service record'});
      await supabase('/rest/v1/service_history?on_conflict=id', {token,method:'POST',prefer:'resolution=ignore-duplicates',
        body:{id:body.id,user_id:body.userId,service:body.service,service_date:body.date,notes:body.notes || '',amount_cents:body.amountCents ?? null}});
      return res.json({saved:true});
    }
    if (action !== 'session') return res.status(403).json({error:'Action unavailable'});
    const [profiles, bookings, history] = await Promise.all([
      supabase('/rest/v1/profiles?select=*&order=name', {token}),
      supabase('/rest/v1/bookings?select=*&order=created_at.desc&limit=100', {token}),
      supabase('/rest/v1/service_history?select=*&order=service_date.desc&limit=100', {token})
    ]);
    return res.json({email:user.email,userId:user.id,owner,profiles,bookings,history});
  } catch (error) {
    if (error.status === 429) return res.status(429).json({error:'Too many attempts. Please try again later.'});
    if (['login', 'verify'].includes(action)) return res.status(400).json({error:'Could not sign in. Check your details and confirm your email.'});
    if (action === 'signup') return res.status(400).json({error:'Could not create the account. Try signing in or resetting your password.'});
    return res.status(502).json({error:'Your request could not be completed. Please check your details and try again.'});
  }
};
