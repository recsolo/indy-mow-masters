const assert = require('node:assert/strict');
const handler = require('../api/account');
const cards = require('../api/payment-methods');
const {account} = require('../lib/accounts');

process.env.VERCEL_ENV = 'production';
process.env.PORTAL_LIVE_ENABLED = 'true';
process.env.SQUARE_LIVE_ENABLED = 'true';
process.env.SQUARE_SAVED_CARDS_ENABLED = 'true';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SQUARE_ACCESS_TOKEN = 'mock';
const user = {id:'11111111-1111-4111-8111-111111111111',email:'client@example.invalid'};
let owner = false;
let captured;
let calls;
function mock() {
  calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({url,options});
    let data;
    if (url.endsWith('/auth/v1/user')) data = user;
    else if (url.includes('/auth/v1/token?grant_type=refresh_token')) data = {user,access_token:'renewed',refresh_token:'new-refresh',expires_in:3600};
    else if (url.endsWith('/portal_is_owner')) data = owner;
    else if (url.includes('/customers/search')) data = {customers:[{id:'customer',reference_id:user.id}]};
    else if (url.endsWith('/cards/other-card')) data = {card:{id:'other-card',customer_id:'another-customer'}};
    else {
      captured = options.body && JSON.parse(options.body);
      data = [];
    }
    return {ok:true,status:200,json:async () => data};
  };
}
async function invoke(fn, body, cookie = 'imm_access=valid', origin='https://www.indymowmasters.com', host='www.indymowmasters.com') {
  const response = {headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await fn({method:'POST',headers:{cookie,origin,host},body},response);
  return response;
}
(async () => {
  mock();
  assert.equal((await invoke(handler,{action:'profile'},'','https://evil.example')).code,403);
  assert.equal(calls.length,0);
  assert.equal((await invoke(handler,{action:'profile'},'')).code,401);
  assert.equal((await invoke(handler,{action:'updateBooking'})).code,403);
  const profile = {action:'profile',id:'victim',name:'Test',phone:'555',address:'Test',city:'Test',zip:'00000',notes:''};
  await invoke(handler,profile);
  assert.equal(captured.id,user.id);
  assert.equal((await invoke(cards,{action:'save',consent:false})).code,400);
  assert.ok(!calls.some(call => call.url.includes('/customers/search')));
  assert.equal((await invoke(cards,{action:'remove',cardId:'other-card'})).code,404);
  assert.ok(!calls.some(call => call.url.endsWith('/disable')));
  const res = {setHeader(name,value){this[name]=value;}};
  const session = await account({headers:{cookie:'imm_refresh=refresh'}},res);
  assert.equal(session.token,'renewed');
  assert.ok(res['Set-Cookie'].every(cookie => cookie.includes('HttpOnly; Secure; SameSite=Strict')));
  // These flags are exercised only against mocked fetch in this local process.
  for (const flag of ['PORTAL_LIVE_ENABLED','SQUARE_LIVE_ENABLED','SQUARE_SAVED_CARDS_ENABLED']) {
    mock();
    delete process.env[flag];
    assert.equal((await invoke(cards,{})).code,503);
    if (flag === 'PORTAL_LIVE_ENABLED') assert.equal((await invoke(handler,profile)).code,503);
    assert.equal(calls.length,0);
    process.env[flag]='true';
  }
  mock();
  assert.equal((await invoke(handler,profile,'imm_access=valid','https://preview.example','preview.example')).code,404);
  assert.equal((await invoke(cards,{},'imm_access=valid','https://preview.example','preview.example')).code,404);
  assert.equal(calls.length,0);
  for (const malformed of ['null','[]','true',null,[]]) {
    const result = await invoke(handler,malformed);
    assert.equal(result.code,403);
  }
  for (const action of ['recover','signup']) {
    mock();
    await invoke(handler,{action,email:user.email,password:'local-test-password-only'});
    const emailRequest = calls.find(call => call.url.includes(action === 'recover' ? '/recover?' : '/signup?'));
    assert.ok(emailRequest, action + ' should request an auth email');
    assert.equal(new URL(emailRequest.url).searchParams.get('redirect_to'),'https://www.indymowmasters.com/account.html');
  }
  for (const environment of ['preview','development']) {
    mock();
    process.env.VERCEL_ENV=environment;
    assert.equal((await invoke(handler,profile)).code,503);
    assert.equal((await invoke(cards,{})).code,503);
    assert.equal(calls.length,0);
  }
  console.log('Account tests passed: production flags, official host, origin checks, ownership, owner permissions, card consent, cross-client card removal, session refresh, malformed bodies, email redirects, and Preview isolation.');
})().catch(error => {console.error(error);process.exitCode=1;});
