const assert = require('node:assert/strict');
const handler = require('../api/account');
const cards = require('../api/payment-methods');
const {account} = require('../lib/accounts');

process.env.VERCEL_ENV = 'preview';
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
async function invoke(fn, body, cookie = 'imm_access=valid', origin='https://preview.example') {
  const response = {headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await fn({method:'POST',headers:{cookie,origin,host:'preview.example'},body},response);
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
  process.env.VERCEL_ENV='production';
  assert.equal((await invoke(handler,profile)).code,404);
  assert.equal((await invoke(cards,{})).code,404);
  console.log('Account tests passed: origin checks, ownership, owner permissions, card consent, cross-client card removal, session refresh, preview restrictions.');
})().catch(error => {console.error(error);process.exitCode=1;});
