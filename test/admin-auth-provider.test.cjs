const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {SupabaseAuthAdminProvider}=require('../dist/auth/supabase-auth-admin.provider');
const provider=new SupabaseAuthAdminProvider();
const originalFetch=global.fetch;
const originalEnv={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
const input={email:'test@invalid.example',name:'Test account',password:'test-only-password'};
beforeEach(()=>{process.env.SUPABASE_URL='https://auth.invalid.example';process.env.SUPABASE_SECRET_KEY='sb_secret_test_only';delete process.env.SUPABASE_SERVICE_ROLE_KEY;});
afterEach(()=>{global.fetch=originalFetch;for(const [name,value]of Object.entries(originalEnv)){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
test('new secret keys use apikey and never a Bearer secret header',async()=>{
 let request;global.fetch=async(url,init)=>{request=init;return{ok:true,status:200,json:async()=>({id:'test-id',email:input.email})};};
 const account=await provider.createUser(input);
 assert.equal(request.headers.apikey,'sb_secret_test_only');assert.equal(request.headers.Authorization,undefined);
 assert.equal(account.password,undefined);assert.equal(account.id,'test-id');
});
test('legacy service_role keys use both required headers, including fallback configuration',async()=>{
 delete process.env.SUPABASE_SECRET_KEY;
 const key='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.test-signature';
 process.env.SUPABASE_SERVICE_ROLE_KEY=key;let headers;
 global.fetch=async(url,init)=>{headers=init.headers;return{ok:true,status:200,json:async()=>({id:'test-id',email:input.email})};};
 await provider.createUser(input);assert.equal(headers.apikey,key);assert.equal(headers.Authorization,`Bearer ${key}`);
});
test('invalid admin credentials produce actionable errors without exposing credentials',async()=>{
 let calls=0;global.fetch=async()=>{calls++;return{ok:false,status:401,json:async()=>({message:'Invalid API key'})};};
 await assert.rejects(provider.createUser(input),error=>{assert.ok(error.message.includes('SUPABASE_SECRET_KEY'));assert.ok(!error.message.includes(process.env.SUPABASE_SECRET_KEY));assert.ok(!error.message.includes(input.password));return true;});
 assert.equal(calls,1);
});
test('publishable and anon credentials are rejected before account creation',async()=>{
 let calls=0;global.fetch=async()=>{calls++;throw new Error('Unexpected auth request');};
 process.env.SUPABASE_SECRET_KEY='sb_publishable_test_only';await assert.rejects(provider.createUser(input),/server secret key/);
 process.env.SUPABASE_SECRET_KEY='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.test';
 await assert.rejects(provider.createUser(input),/service_role key/);assert.equal(calls,0);
});
