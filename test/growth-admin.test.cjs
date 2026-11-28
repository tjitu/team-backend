const {before,after,test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const {GrowthAdminService}=require('../dist/control-center/growth/growth-admin.service');
const {GrowthAdminController}=require('../dist/control-center/growth/growth-admin.controller');
const {SessionGuard}=require('../dist/auth/session.guard');
const {JituPostgresManagementDataSource}=require('../dist/control-center/jitu-management.data-source');
const {createGrowthDatabase,fixture,submit,confirmed}=require(path.join(process.env.GROWTH_FIXTURE_ROOT||path.resolve('../jitu-backend/test'),'growth-fixture.cjs'));
let db,client,service,role='SYSTEM_ADMIN',freshArgs;
before(async()=>{
 db=await createGrowthDatabase();client=new PrismaClient({datasources:{db:{url:db.url}}});
 service=new GrowthAdminService({getActiveMember:async(...args)=>{freshArgs=args;return{id:'real-admin',role,isActive:true};}}, {growthDatabase:()=>client});
});
after(async()=>{await client?.$disconnect();await db?.cleanup();});
test('all growth controller routes require the existing authenticated session guard',()=>{
 const guards=Reflect.getMetadata('__guards__',GrowthAdminController);assert.ok(guards.includes(SessionGuard));
});
test('Members and Affiliators cannot list submissions, change configuration, or decide applications',async()=>{
 for(const denied of ['MEMBER','AFFILIATOR']) {
  role=denied;
  await assert.rejects(service.list('caller','tryout',{}),/administrator/);
  await assert.rejects(service.configure('caller','tryout',{config:{},version:0}),/administrator/);
  await assert.rejects(service.review('caller','tryout','submission',{action:'APPROVE',version:1,checklist:confirmed}),/administrator/);
 }
 role='SYSTEM_ADMIN';
});
test('configuration uses fresh Team membership, validates before persisting, and checks versions',async()=>{
 const f=await fixture(db.pool);
 const config=await service.configuration('caller',f.tryout);assert.equal(config.version,1);assert.deepEqual(freshArgs,['caller',undefined,true]);
 await assert.rejects(service.configure('caller',f.tryout,{config:{...config.config,campaignUrl:'javascript:alert(1)'},version:1}),/URL postingan/);
 const changed=await service.configure('caller',f.tryout,{config:{...config.config,manualVerification:false},version:1});assert.equal(changed.version,2);
 await assert.rejects(service.configure('caller',f.tryout,{config:config.config,version:1}),/berubah/);
 const history=(await db.pool.query('SELECT "actorId" FROM "TryoutVerificationHistory" WHERE "tryoutId"=$1 AND action=$2',[f.tryout,'CONFIG_UPDATED'])).rows;
 assert.deepEqual(history,[{actorId:'real-admin'}]);
});
test('queue search, status and WIB date filters return only matching own-tryout submissions',async()=>{
 const f=await fixture(db.pool),other=await fixture(db.pool);await submit(db.pool,f);await submit(db.pool,other);
 const query=await service.list('caller',f.tryout,{q:'test.user',status:'PENDING_VERIFICATION'});
 assert.equal(query.items.length,1);assert.equal(query.summary.total,1);assert.equal(query.summary.pending,1);
 assert.equal((await service.list('caller',f.tryout,{q:'no.match'})).items.length,0);
 assert.equal((await service.list('caller',f.tryout,{status:'REJECTED'})).items.length,0);
 assert.equal((await service.list('caller',f.tryout,{from:'2000-01-01',to:'2000-01-02'})).items.length,0);
 await assert.rejects(service.list('caller',f.tryout,{from:'2026-99-99'}),/Tanggal/);
});
test('review uses the authenticated admin identity, preserves progress, and returns the next pending submission',async()=>{
 const f=await fixture(db.pool),next=await fixture(db.pool);
 await db.pool.query('UPDATE "TryOut" SET "growthConfig"=$2::jsonb WHERE id=$1',[next.tryout,JSON.stringify(f.config)]);
 await db.pool.query('DELETE FROM "TryOut" WHERE id=$1',[next.tryout]);
 next.tryout=f.tryout;
 const first=(await submit(db.pool,f)).verification, second=(await submit(db.pool,next)).verification;
 const saved=await service.review('caller',f.tryout,first.id,{action:'SAVE_PROGRESS',version:1,checklist:{follow:true},actorId:'forged'});
 assert.equal(saved.registration.status,'PENDING_VERIFICATION');assert.equal(saved.registration.version,2);
 const approved=await service.review('caller',f.tryout,first.id,{action:'APPROVE',version:2,checklist:confirmed,next:true,actorId:'forged'});
 assert.equal(approved.registration.verifiedBy,'real-admin');assert.equal(approved.nextId,second.id);
 const details=await service.detail('caller',f.tryout,first.id);assert.equal(details.history.length,3);
 assert.ok(details.history.filter(h=>h.action!=='SUBMITTED').every(h=>h.actorId==='real-admin'));
});
test('cross-tryout IDs and stale concurrent decisions cannot mutate another submission',async()=>{
 const f=await fixture(db.pool),other=await fixture(db.pool),v=(await submit(db.pool,f)).verification;
 await assert.rejects(service.detail('caller',other.tryout,v.id),/Pengajuan tidak ditemukan/);
 await assert.rejects(service.review('caller',other.tryout,v.id,{action:'APPROVE',version:1,checklist:confirmed}),/Pengajuan tidak ditemukan/);
 const results=await Promise.allSettled([
  service.review('caller',f.tryout,v.id,{action:'APPROVE',version:1,checklist:confirmed}),
  service.review('caller',f.tryout,v.id,{action:'REJECT',version:1,checklist:{},rejectionReasons:['Belum follow Instagram @jituptn.']}),
 ]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.match(results.find(x=>x.status==='rejected').reason.message,/berubah/);
});

test('existing tryout create/edit persists growth atomically and a stale version rolls back ordinary edits',async()=>{
 await db.pool.query(`CREATE TYPE "TryoutBatch" AS ENUM ('SNBT_2027');
  CREATE TYPE "TryoutStatus" AS ENUM ('NOT_STARTED','IN_PROGRESS','FINISHED');
  ALTER TABLE "TryOut" ADD COLUMN code serial, ADD COLUMN description text, ADD COLUMN batch "TryoutBatch",
   ADD COLUMN "releaseDate" timestamp, ADD COLUMN status "TryoutStatus", ADD COLUMN questions_released boolean,
   ADD COLUMN questions_released_at timestamp, ADD COLUMN break_seconds integer, ADD COLUMN "isPublic" boolean,
   ADD COLUMN "referralCode" text, ADD COLUMN "createdAt" timestamp DEFAULT NOW(), ADD COLUMN revision_notes text,
   ADD COLUMN reviewed_by text, ADD COLUMN reviewed_at timestamp;`);
 const management=Object.create(JituPostgresManagementDataSource.prototype);
 management.prisma=client;management.ensureLifecycleSchema=async()=>{};
 management.ensureTryoutSubtests=async()=>{};management.invalidateOverview=()=>{};
 const config=(await db.pool.query('SELECT growth_defaults() c')).rows[0].c;
 config.enabled=true;config.campaignUrl='https://www.instagram.com/p/Campaign/';
 const created=await management.createTryout({title:'Growth draft',solutionPrice:0,scheduledStart:'2099-01-01T00:00:00Z',
  scheduledEnd:'2099-01-02T00:00:00Z',growthConfig:config,growthActorId:'trusted-admin'});
 assert.equal(created.growthVersion,1);assert.equal(created.growthConfig.enabled,true);
 const updated=await management.updateTryout(created.id,{title:'Edited draft',growthConfig:{...config,manualVerification:false},growthVersion:1,growthActorId:'trusted-admin'});
 assert.equal(updated.title,'Edited draft');assert.equal(updated.growthVersion,2);assert.equal(updated.growthConfig.manualVerification,false);
 await assert.rejects(management.updateTryout(created.id,{title:'Stale overwrite',growthConfig:config,growthVersion:1,growthActorId:'trusted-admin'}),/berubah/);
 const persisted=(await db.pool.query('SELECT title,"growthVersion" FROM "TryOut" WHERE id=$1',[created.id])).rows[0];
 assert.deepEqual(persisted,{title:'Edited draft',growthVersion:2});
 const history=(await db.pool.query('SELECT "actorId" FROM "TryoutVerificationHistory" WHERE "tryoutId"=$1',[created.id])).rows;
 assert.deepEqual(history,[{actorId:'trusted-admin'},{actorId:'trusted-admin'}]);
});
