const { before,after,test }=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const { mkdir,readFile,writeFile }=require('node:fs/promises');
const { createHash,randomUUID }=require('node:crypto');
const fixturePath=process.env.AFFILIATE_FIXTURE_ROOT || path.resolve(__dirname,'../../jitu-backend/test');
const {createTestDatabase,fixture,quote,payment}=require(path.join(fixturePath,'affiliate-fixture.cjs'));
const {AffiliateDatabase}=require('../dist/affiliate/affiliate.database');
const {AffiliateAccessService}=require('../dist/affiliate/affiliate-access.service');
const {AffiliateAgreementsService}=require('../dist/affiliate/affiliate-agreements.service');
const {AffiliateReportsService}=require('../dist/affiliate/affiliate-reports.service');
const {AffiliateService}=require('../dist/affiliate/affiliate.service');
const {AffiliatorBoundaryGuard}=require('../dist/affiliate/affiliator-boundary.guard');
const {TeamMembersService}=require('../dist/team-management/team-members.service');
const {AffiliateIdentityService}=require('../dist/affiliate/affiliate-identity.service');
const {UsernameLoginController}=require('../dist/auth/username-login.controller');
const {TeamAccessService}=require('../dist/team-access/team-access.service');
const {TeamAccessController}=require('../dist/team-access/team-access.controller');
let local,db,access,agreements,reports,service,members;
const owner={id:'owner',userId:'owner-user',name:'Owner',email:'owner@test.invalid',role:'SYSTEM_OWNER',isActive:true};
const admin={...owner,id:'admin',userId:'admin-user',role:'SYSTEM_ADMIN'};
const ordinary={...owner,id:'ordinary',userId:'ordinary-user',role:'MEMBER'};
before(async () => {
  local=await createTestDatabase();
  const previous=process.env.JITU_CONTROL_CENTER_DATABASE_URL;
  process.env.JITU_CONTROL_CENTER_DATABASE_URL=local.url; db=new AffiliateDatabase();
  if (previous===undefined) delete process.env.JITU_CONTROL_CENTER_DATABASE_URL; else process.env.JITU_CONTROL_CENTER_DATABASE_URL=previous;
  members=new Map([owner,admin,ordinary].map(m => [m.userId,m]));
  const team={teamMember:{findUnique:async ({where}) => [...members.values()].find(m => where.userId ? m.userId===where.userId : m.id===where.id) || null}};
  access=new AffiliateAccessService(team,db,{sync:async () => {}});
  agreements=new AffiliateAgreementsService(db,access); reports=new AffiliateReportsService(db); service=new AffiliateService(db,access,reports);
});
after(async () => { await db?.onModuleDestroy(); await local?.cleanup(); });
async function affiliate(accepted=true) {
  const f=await fixture(local.pool,accepted);
  const member={id:f.id,userId:f.id,name:'Test Affiliate',email:`${f.id}@test.invalid`,role:'AFFILIATOR',isActive:true};
  members.set(member.userId,member); return {...f,member};
}
test('server authorization denies members, affiliates managing others, and inactive identities',async () => {
  const a=await affiliate(),b=await affiliate();
  await assert.rejects(service.detail(a.id,b.id,{}),/Administrator access/);
  await assert.rejects(service.list(ordinary.userId),/Administrator access/);
  await assert.rejects(agreements.list(admin.userId),/System Owner access/);
  await assert.rejects(service.overview(owner.userId,{}),/Affiliator access/);
  a.member.isActive=false; await assert.rejects(service.overview(a.id,{}),/Active Team/);
});
test('acceptance persists exact personalized content, SHA-256, identity and timestamp once',async () => {
  const a=await affiliate(false);
  await assert.rejects(service.overview(a.id,{}),/AGREEMENT_REQUIRED/);
  const state=await agreements.state(a.id); assert.equal(state.required,true);
  if (process.env.AFFILIATE_QA_OUTPUT_DIR) {
    await mkdir(process.env.AFFILIATE_QA_OUTPUT_DIR,{recursive:true});
    await writeFile(path.join(process.env.AFFILIATE_QA_OUTPUT_DIR,'awaiting-agreement.json'),JSON.stringify(state));
  }
  await assert.rejects(agreements.accept(a.id,{agreementId:state.current.id,acknowledged:false,previewHash:state.preview.hash}),/acknowledgment/);
  await assert.rejects(agreements.accept(a.id,{agreementId:state.current.id,acknowledged:true,previewHash:'0'.repeat(64)}),/details changed/);
  const input={agreementId:state.current.id,acknowledged:true,previewHash:state.preview.hash};
  const accepted=await agreements.accept(a.id,input),duplicate=await agreements.accept(a.id,input);
  assert.equal(accepted.id,duplicate.id); assert.equal(accepted.identity.id,a.id);
  assert.ok(accepted.snapshot.includes('Test Affiliate')); assert.ok(accepted.snapshot.includes('10%'));
  assert.ok(accepted.snapshot.includes(accepted.acceptedAt.toISOString()));
  assert.equal(accepted.contentHash,createHash('sha256').update(accepted.snapshot).digest('hex'));
  assert.equal((await agreements.state(a.id)).required,false);
  await service.overview(a.id,{});
});
test('Owner draft editor, safe preview, immutable publication, and new version flow',async () => {
  const a=await affiliate();
  const input={title:'Review draft',content:'## {{affiliate_name}}\n<script>alert(1)</script>\n{{base_commission}}\n{{acceptance_timestamp}}',party:'',summary:'Testing only',requiresAcceptance:true};
  const draft=await agreements.create(owner.userId,input);
  await assert.rejects(agreements.publish(owner.userId,draft.id),/Complete the contracting party/);
  const future=new Date(Date.now()+86400000).toISOString();
  const updated=await agreements.update(owner.userId,draft.id,{...input,party:'Test party',effectiveAt:future});
  assert.equal(updated.status,'DRAFT');
  const preview=await agreements.preview(owner.userId,draft.id,a.id);
  assert.ok(preview.content.includes('Test Affiliate')); assert.ok(preview.content.includes('<script>'));
  const published=await agreements.publish(owner.userId,draft.id); assert.equal(published.status,'PUBLISHED');
  await assert.rejects(agreements.update(owner.userId,draft.id,input),/new version/);
  const next=await agreements.create(owner.userId,input); assert.equal(next.version,draft.version+1);
});
test('reports are scoped, reconcile actual money, and omit customer PII and internal payout notes',async () => {
  const a=await affiliate(),b=await affiliate();
  const qa=await quote(local.pool,a.voucher),qb=await quote(local.pool,b.voucher);
  await payment(local.pool,qa,'CONFIRMED'); await payment(local.pool,qb,'CONFIRMED');
  await service.payout(admin.userId,a.id,{amount:500,paidAt:new Date().toISOString(),reference:randomUUID(),status:'PAID',notes:'PRIVATE NOTE',requestKey:randomUUID()});
  const report=await service.overview(a.id,{limit:100});
  assert.equal(report.totals.earned,935); assert.equal(report.totals.paid,500); assert.equal(report.totals.outstanding,435);
  assert.equal(report.transactions.length,1); assert.equal(report.transactions[0].affiliateId,a.id);
  assert.equal(report.transactions[0].product,'Test product'); assert.equal(report.codes.length,1);
  assert.equal(report.quotas.length,3); assert.equal(report.payouts[0].notes,undefined);
  assert.ok(!JSON.stringify(report.transactions).includes('student'));
  const administrative=await service.detail(admin.userId,a.id,{}); assert.equal(administrative.payouts[0].notes,'PRIVATE NOTE');
  if (process.env.AFFILIATE_QA_OUTPUT_DIR) {
    await mkdir(process.env.AFFILIATE_QA_OUTPUT_DIR,{recursive:true});
    await writeFile(path.join(process.env.AFFILIATE_QA_OUTPUT_DIR,'report.json'),JSON.stringify(report));
    await writeFile(path.join(process.env.AFFILIATE_QA_OUTPUT_DIR,'accepted-agreement.json'),JSON.stringify(await agreements.state(a.id)));
  }
});
test('new configuration waits for effective date and acceptance; active boost benefits are frozen',async () => {
  const a=await affiliate(); const original=await service.overview(a.id,{});
  await service.activate(a.id,{type:'COMMISSION',confirmed:true,requestKey:randomUUID()});
  const draft=await agreements.create(owner.userId,{title:'Future test rates',content:'New commercial terms {{base_commission}} {{base_discount}}',party:'Test party',summary:'Test only',requiresAcceptance:true,effectiveAt:new Date(Date.now()+60000).toISOString()});
  await agreements.publish(owner.userId,draft.id);
  const config=structuredClone(original.profile.config); config.commission=2000;
  await service.configure(admin.userId,a.id,{config,effectiveAt:new Date(Date.now()+120000).toISOString(),agreementId:draft.id});
  assert.equal((await service.overview(a.id,{})).profile.config.commission,1000);
  const preview=await agreements.preview(owner.userId,draft.id,a.id); assert.equal(preview.config.commission,2000);
  const accepted=await agreements.accept(a.id,{agreementId:draft.id,previewHash:preview.hash,acknowledged:true}); assert.ok(accepted.snapshot.includes('20%'));
  await assert.rejects(service.configure(admin.userId,a.id,{config,effectiveAt:new Date(Date.now()+120000).toISOString(),agreementId:draft.id}),/new agreement/);
  assert.equal((await quote(local.pool,a.voucher)).commissionRate,1500);
});
test('global boundary denies every operational route and permits only self paths',async () => {
  const a=await affiliate();
  const guard=new AffiliatorBoundaryGuard({getUser:async () => ({id:a.id})},{teamMember:{findUnique:async () => a.member}});
  const context=(path,method='GET') => ({switchToHttp:() => ({getRequest:() => ({path,method,headers:{authorization:'Bearer test'}})})});
  for (const route of ['/api/team/members','/api/team/projects','/api/team/control-center/overview','/api/team/affiliate/admin','/api/team/affiliate/me-other']) await assert.rejects(guard.canActivate(context(route)),/limited/);
  assert.equal(await guard.canActivate(context('/api/team/me')),true);
  assert.equal(await guard.canActivate(context('/api/team/affiliate/me/agreement/accept','POST')),true);
});
test('full application dependency graph initializes with isolated local database URLs',async () => {
  const {NestFactory}=require('@nestjs/core');
  const {AppModule}=require('../dist/app.module');
  const names=['DATABASE_URL','DIRECT_URL','JITU_CONTROL_CENTER_DATABASE_URL','JITU_PURCHASES_DATABASE_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'];
  const previous=Object.fromEntries(names.map(key=>[key,process.env[key]]));
  for (const key of names) process.env[key]=key==='SUPABASE_URL'?'http://127.0.0.1:9':key==='SUPABASE_PUBLISHABLE_KEY'?'test-only':local.url;
  let app;
  try { app=await NestFactory.createApplicationContext(AppModule,{logger:false,abortOnError:false}); assert.ok(app.get(AffiliateService)); }
  finally { await app?.close(); for(const key of names) { if(previous[key]===undefined) delete process.env[key]; else process.env[key]=previous[key]; } }
});
test('authorized admin creates Affiliate credentials through existing Auth provider without persisting passwords',async () => {
  const id=randomUUID();let saved,forwarded;
  const team={teamMember:{findUnique:async()=>null},$transaction:async work=>work({
    teamMember:{create:async({data})=>{saved={...data,id};return saved;}},activityLog:{create:async()=>({})},
  })};
  const auth={createUser:async input=>{forwarded=input;return{id:randomUUID(),email:input.email};},deleteUser:async()=>{}};
  const creator=new TeamMembersService(team,{getActiveMember:async()=>admin},new AffiliateIdentityService(db),auth);
  const result=await creator.create(admin.userId,{email:'new-affiliate@test.invalid',username:'affiliate.test',name:'Test Affiliate',role:'AFFILIATOR',password:'test-only-password-123'});
  assert.equal(result.role,'AFFILIATOR');assert.equal(forwarded.password,'test-only-password-123');
  assert.equal(saved.password,undefined);assert.equal(result.password,undefined);assert.equal(saved.username,'affiliate.test');
  assert.equal((await local.pool.query('SELECT "isActive" FROM "AffiliateProfile" WHERE id=$1',[id])).rows[0].isActive,true);
  await assert.rejects(creator.create(admin.userId,{email:'denied@test.invalid',name:'Denied',role:'SYSTEM_OWNER',password:'test-only-password-123'}),/bootstrap/);
  await assert.rejects(creator.create(admin.userId,{email:'denied@test.invalid',name:'Denied',role:'SYSTEM_ADMIN',password:'test-only-password-123'}),/Only the System Owner/);
});
test('admin account deactivation syncs eligibility and preserves historical earnings',async () => {
  const f=await affiliate(),snapshot=await quote(local.pool,f.voucher);await payment(local.pool,snapshot,'CONFIRMED');
  let target={...f.member};
  const tx={teamMember:{update:async({data})=>{target={...target,...data};return target;}},projectMember:{findMany:async()=>[]},activityLog:{create:async()=>({})}};
  const team={teamMember:{findUnique:async()=>target},$transaction:async work=>work(tx)};
  const manager=new TeamMembersService(team,{getActiveMember:async()=>admin,invalidate:()=>{}},new AffiliateIdentityService(db),{});
  await manager.updateStatus(admin.userId,target.id,{isActive:false});
  await assert.rejects(quote(local.pool,f.voucher),/inactive/);
  assert.equal((await local.pool.query('SELECT sum(amount)::int AS amount FROM "AffiliateLedger" WHERE "affiliateId"=$1',[f.id])).rows[0].amount,935);
  await manager.updateStatus(admin.userId,target.id,{isActive:true});assert.equal((await quote(local.pool,f.voucher)).commission,935);
});
test('username login forwards to Supabase and throttles before attempting password verification',async () => {
  let attempts=1,body;const previousFetch=global.fetch;
  const previousUrl=process.env.SUPABASE_URL,previousKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL='https://supabase.test.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='test-only';
  const controller=new UsernameLoginController({$queryRaw:async()=>[{attempts}],teamLoginThrottle:{deleteMany:async()=>({count:0})},teamMember:{findUnique:async()=>admin}});
  global.fetch=async(url,init)=>{assert.ok(url.startsWith('https://supabase.test.invalid/'));body=JSON.parse(init.body);return{ok:true,json:async()=>({access_token:'test-access',refresh_token:'test-refresh'})};};
  try {
    const result=await controller.login({username:'admin.test',password:'test-only-password'});
    assert.equal(body.email,admin.email);assert.equal(body.password,'test-only-password');assert.equal(result.password,undefined);
    assert.deepEqual(result,{access_token:'test-access',refresh_token:'test-refresh'});
    attempts=11;await assert.rejects(controller.login({username:'admin.test',password:'test-only-password'}),/Too many/);
  } finally {global.fetch=previousFetch;if(previousUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previousUrl;if(previousKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=previousKey;}
});
test('current membership bypasses a cached role for server route authorization',async () => {
  let current={...owner};
  const prisma={teamMember:{findUnique:async()=>current},teamMemberDepartment:{findMany:async()=>[]}};
  const cache=new TeamAccessService(prisma);assert.equal((await cache.getActiveMember(owner.userId)).role,'SYSTEM_OWNER');
  current={...current,role:'AFFILIATOR'};
  const controller=new TeamAccessController(cache,prisma);
  assert.equal((await controller.getCurrentMember({user:{id:owner.userId}})).role,'AFFILIATOR');
});
test('a former affiliate keeps administrative access to historical earnings and payout tracking',async () => {
  const f=await affiliate(),snapshot=await quote(local.pool,f.voucher);await payment(local.pool,snapshot,'CONFIRMED');
  f.member.role='MEMBER';await new AffiliateIdentityService(db).sync(f.member);
  const history=await service.detail(admin.userId,f.id,{});assert.equal(history.totals.earned,935);assert.equal(history.profile.isActive,false);
  await service.payout(admin.userId,f.id,{amount:100,paidAt:new Date().toISOString(),reference:randomUUID(),status:'PAID',notes:'Test only',requestKey:randomUUID()});
  assert.equal((await service.detail(admin.userId,f.id,{})).totals.paid,100);
  await assert.rejects(service.overview(f.id,{}),/Affiliator access/);
});
test('Team migration adds the role/username and username throttling is atomic in PostgreSQL',async () => {
  await local.pool.query(`CREATE TYPE "TeamRole" AS ENUM ('SYSTEM_OWNER','SYSTEM_ADMIN','MEMBER');
    CREATE TABLE team_members (id text PRIMARY KEY,user_id text UNIQUE,email text UNIQUE,name text,role "TeamRole" DEFAULT 'MEMBER',
      is_active boolean DEFAULT true,created_at timestamptz DEFAULT NOW(),updated_at timestamptz DEFAULT NOW())`);
  await local.pool.query(await readFile(path.resolve(__dirname,'../prisma/migrations/20261127000100_affiliator_role/migration.sql'),'utf8'));
  const {PrismaClient}=require('@prisma/client'),client=new PrismaClient({datasources:{db:{url:local.url}}});
  const previousFetch=global.fetch,previousUrl=process.env.SUPABASE_URL,previousKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL='https://supabase.test.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='test-only';let calls=0;
  global.fetch=async(url)=>{if(!String(url).includes('/auth/v1/token'))return{ok:true,json:async()=>({keys:[]})};calls++;return{ok:true,json:async()=>({access_token:'test',refresh_token:'test'})};};
  try {
    await client.teamMember.create({data:{id:randomUUID(),userId:randomUUID(),email:'alias@test.invalid',name:'Test affiliate',role:'AFFILIATOR',username:'test.alias'}});
    const controller=new UsernameLoginController(client);
    const results=await Promise.allSettled(Array.from({length:11},()=>controller.login({username:'test.alias',password:'test-only'})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,10);assert.equal(calls,10);
    assert.equal((await client.teamLoginThrottle.findFirst()).attempts,11);
    await assert.rejects(client.teamMember.create({data:{userId:randomUUID(),email:'other@test.invalid',name:'Other',username:'test.alias'}}),/Unique constraint/);
  } finally {await client.$disconnect();global.fetch=previousFetch;if(previousUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previousUrl;if(previousKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=previousKey;}
});
