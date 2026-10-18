// Local PGlite only. No live Auth, PostgREST, production DDL or user writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDatabase } from './fixtures/idea-images-db.mjs';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const DELETED = '00000000-0000-4000-8000-000000000003';
const OWN_ROW = '10000000-0000-4000-8000-000000000001';
const OTHER_ROW = '10000000-0000-4000-8000-000000000002';
const LEGACY_ROW = '10000000-0000-4000-8000-000000000003';
const db = await createDatabase();
const baseline = await readFile(new URL('../ver23_20_supabase.sql', import.meta.url), 'utf8');
const migrationUrl = new URL('../supabase/migrations/20261019000000_notification_least_privilege.sql', import.meta.url);
let checks = 0;
const ok = (name, value) => { assert(value, name); checks++; console.log('PASS ' + name); };
const rows = async (sql, values = []) => (await db.query(sql, values)).rows;
async function asRole(role, userId, operation) {
  assert(['anon', 'authenticated', 'service_role'].includes(role));
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId || '']);
  await db.exec(`set role ${role}`);
  try { return await operation(); } finally { await db.exec('reset role'); }
}
const policies = () => rows(`select policyname,permissive,roles,cmd,qual,with_check
  from pg_policies where schemaname='public' and tablename='notifications' order by policyname`);
const definitions = () => rows(`select p.proname,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('create_channel_change_notifications','move_idea_to_completed_parent') order by p.proname`);
const triggers = () => rows(`select t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t
  where not t.tgisinternal and t.tgfoid='public.create_channel_change_notifications()'::regprocedure order by t.tgname`);
const executeRights = () => rows(`select r.rolname,has_function_privilege(r.rolname,'public.create_channel_change_notifications()','EXECUTE') allowed
  from pg_roles r where r.rolname in ('anon','authenticated','service_role') order by r.rolname`);
const storedRows = () => rows('select * from public.notifications order by id');

try {
  await db.exec(`reset role;
    create table auth.users(id uuid primary key,deleted_at timestamptz);
    create table public.goals(id uuid primary key default gen_random_uuid(),title text,goal_scope text,goal_month text,
      goal_key text,target_value integer,current_value integer,deadline date,achieved boolean default false,
      deleted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.videos(id uuid primary key default gen_random_uuid(),title text,video_type text,status text,
      post_date date,youtube_url text,tags text,memo text,youtube_views bigint,deleted_at timestamptz,
      created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.notifications(id uuid primary key default gen_random_uuid(),title text,message text,
      entity_type text,entity_id text,is_read boolean default false,recipient_user_id uuid,actor_user_id uuid,event_key text,
      created_at timestamptz default now());
    grant select,insert,update,delete on public.videos,public.goals to authenticated;
    -- Live table grants allow these commands; RLS must still protect notification rows.
    grant select,insert,update,delete on public.notifications to authenticated,anon,service_role;
  `);
  await db.query('insert into auth.users values($1,null),($2,null),($3,now())', [ACTOR, OTHER, DELETED]);
  const notificationStart = baseline.indexOf('alter table public.notifications add column if not exists recipient_user_id');
  const notificationEnd = baseline.indexOf('-- Realtimeへの登録');
  assert(notificationStart >= 0 && notificationEnd > notificationStart, 'existing notification SQL section exists');
  await db.exec(baseline.slice(notificationStart, notificationEnd));
  await db.query(`insert into notifications(id,title,recipient_user_id,event_key)
    values($1,'A notification',$4,'seed-a'),($2,'B notification',$5,'seed-b'),($3,'legacy',null,'seed-legacy')`,
    [OWN_ROW, OTHER_ROW, LEGACY_ROW, ACTOR, OTHER]);

  const beforePolicies = await policies();
  const beforeDefinitions = await definitions();
  const beforeTriggers = await triggers();
  const beforeRows = await storedRows();
  const beforeTableGrants = await rows(`select grantee,privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name='notifications' order by grantee,privilege_type`);
  const moveRightsBefore = await rows("select proacl::text acl from pg_proc where oid='public.move_idea_to_completed_parent(text,text)'::regprocedure");
  ok('baseline reproduces direct EXECUTE granted to anon/authenticated/service_role',
    (await executeRights()).every(row => row.allowed));
  ok('baseline reproduces two row-wise auth.uid() policy expressions',
    beforePolicies.length === 2 && beforePolicies.every(policy => policy.qual.includes('auth.uid()') && !/SELECT/i.test(policy.qual)));

  const migration = await readFile(migrationUrl, 'utf8');
  await db.exec(migration);
  const afterPolicies = await policies();
  const afterRights = await executeRights();
  ok('anon cannot execute the trigger function', afterRights.find(row => row.rolname === 'anon').allowed === false);
  ok('authenticated cannot execute the trigger function directly', afterRights.find(row => row.rolname === 'authenticated').allowed === false);
  ok('service_role explicit EXECUTE is preserved', afterRights.find(row => row.rolname === 'service_role').allowed === true);
  ok('PUBLIC EXECUTE entry is removed', (await rows(`select count(*)::int count from pg_proc p,
    lateral aclexplode(p.proacl) acl where p.oid='public.create_channel_change_notifications()'::regprocedure
    and acl.grantee=0 and acl.privilege_type='EXECUTE'`))[0].count === 0);
  assert.deepEqual(await definitions(), beforeDefinitions);
  ok('trigger body/owner mode/search_path and image movement function definition are unchanged', true);
  assert.deepEqual(await triggers(), beforeTriggers);
  ok('all existing video/idea/goal trigger definitions are unchanged', beforeTriggers.length === 3);
  assert.deepEqual(await storedRows(), beforeRows);
  ok('migration does not modify any stored notification row', true);
  assert.deepEqual(await rows(`select grantee,privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name='notifications' order by grantee,privilege_type`), beforeTableGrants);
  ok('notification table grants and enabled RLS remain unchanged',
    (await rows("select relrowsecurity from pg_class where oid='public.notifications'::regclass"))[0].relrowsecurity === true);
  assert.deepEqual(await rows("select proacl::text acl from pg_proc where oid='public.move_idea_to_completed_parent(text,text)'::regprocedure"), moveRightsBefore);
  ok('authenticated image movement RPC permissions are unchanged', true);
  assert.deepEqual(afterPolicies.map(({ qual, with_check, ...metadata }) => metadata),
    beforePolicies.map(({ qual, with_check, ...metadata }) => metadata));
  ok('policy names/roles/commands/permissive mode are preserved', true);
  ok('read/update predicates and UPDATE WITH CHECK use statement-level auth.uid()', afterPolicies.every(policy =>
    /SELECT\s+auth\.uid\(\)/i.test(policy.qual) && /recipient_user_id IS NULL/i.test(policy.qual)
    && (policy.cmd !== 'UPDATE' || (/SELECT\s+auth\.uid\(\)/i.test(policy.with_check) && /recipient_user_id IS NULL/i.test(policy.with_check)))));

  await db.exec(migration);
  assert.deepEqual(await policies(), afterPolicies);
  assert.deepEqual(await executeRights(), afterRights);
  assert.deepEqual(await storedRows(), beforeRows);
  assert.deepEqual(await triggers(), beforeTriggers);
  ok('reapplying the delta is idempotent for policies/ACL/rows/triggers', true);

  await asRole('anon', null, async () => {
    ok('anon SELECT exposes no notification, including legacy NULL recipient', (await rows('select id from notifications')).length === 0);
    ok('anon UPDATE changes zero rows', (await rows('update notifications set is_read=true returning id')).length === 0);
    await assert.rejects(db.query("insert into notifications(title) values('not allowed')"), /row-level security/i);
    ok('anon INSERT is denied by RLS', true);
    await assert.rejects(db.query('select public.create_channel_change_notifications()'), /permission denied/i);
    ok('anon direct SQL invocation is permission denied', true);
  });

  await asRole('authenticated', ACTOR, async () => {
    assert.deepEqual((await rows('select id from notifications order by id')).map(row => row.id), [OWN_ROW, LEGACY_ROW]);
    ok('recipient A reads only A and legacy NULL recipient, never B', true);
    ok('recipient A can mark their notification read', (await rows('update notifications set is_read=true where id=$1 returning id', [OWN_ROW])).length === 1);
    ok('recipient A cannot mark B notification read', (await rows('update notifications set is_read=true where id=$1 returning id', [OTHER_ROW])).length === 0);
    ok('recipient A can update legacy NULL recipient as before', (await rows('update notifications set is_read=true where id=$1 returning id', [LEGACY_ROW])).length === 1);
    await assert.rejects(db.query('update notifications set recipient_user_id=$1 where id=$2', [OTHER, OWN_ROW]), /row-level security/i);
    ok('WITH CHECK rejects recipient A reassigning their row to B', true);
    await assert.rejects(db.query('update notifications set recipient_user_id=$1 where id=$2', [OTHER, LEGACY_ROW]), /row-level security/i);
    ok('WITH CHECK rejects assigning a legacy row to another user', true);
    await assert.rejects(db.query("insert into notifications(title,recipient_user_id) values('forged',$1)", [ACTOR]), /row-level security/i);
    ok('authenticated direct INSERT remains denied', true);
    await assert.rejects(db.query('select public.create_channel_change_notifications()'), /permission denied/i);
    ok('authenticated direct SQL invocation is permission denied', true);
    const plan = (await rows('explain select id from notifications')).map(row => row['QUERY PLAN']).join('\n');
    ok('isolated query planner uses an InitPlan for auth.uid()', /InitPlan/.test(plan));
  });

  await asRole('authenticated', OTHER, async () => {
    assert.deepEqual((await rows('select id from notifications order by id')).map(row => row.id), [OTHER_ROW, LEGACY_ROW]);
    ok('recipient B reads only B and legacy NULL recipient, never A', true);
    ok('recipient B can mark their notification read', (await rows('update notifications set is_read=true where id=$1 returning id', [OTHER_ROW])).length === 1);
    ok('recipient B cannot modify A notification', (await rows('update notifications set is_read=false where id=$1 returning id', [OWN_ROW])).length === 0);
  });

  const seedCount = (await rows('select count(*)::int count from notifications'))[0].count;
  let videoId;
  let ideaId;
  await asRole('authenticated', ACTOR, async () => {
    videoId = (await rows("insert into videos(title,video_type,status) values('notification video','Shorts','投稿済み') returning id"))[0].id;
  });
  let generated = await rows('select * from notifications where entity_id=$1', [videoId]);
  ok('existing trigger still creates video notification after EXECUTE revocation', generated.length === 1 && generated[0].entity_type === 'video');
  ok('video notification excludes actor and deleted accounts', generated[0].recipient_user_id === OTHER && generated[0].actor_user_id === ACTOR);
  await asRole('authenticated', ACTOR, async () => {
    await db.query('update videos set youtube_views=0,updated_at=clock_timestamp() where id=$1', [videoId]);
  });
  ok('YouTube statistics-only update creates no notification', (await rows('select count(*)::int count from notifications'))[0].count === seedCount + 1);
  await asRole('authenticated', ACTOR, async () => {
    await db.query("update videos set title='editorial change',updated_at=clock_timestamp() where id=$1", [videoId]);
    ideaId = (await rows("insert into ideas(title,status) values('notification idea','アイデア') returning id"))[0].id;
  });
  generated = await rows('select * from notifications where entity_id=$1', [videoId]);
  ok('editorial video update still notifies the other user', generated.length === 2 && generated.every(row => row.recipient_user_id === OTHER));
  generated = await rows('select * from notifications where entity_id=$1', [ideaId]);
  ok('idea INSERT still notifies the other user', generated.length === 1 && generated[0].entity_type === 'idea' && generated[0].recipient_user_id === OTHER);
  await asRole('authenticated', ACTOR, async () => {
    await db.query("update ideas set title='edited idea',updated_at=clock_timestamp() where id=$1", [ideaId]);
  });
  ok('idea UPDATE still notifies the other user', (await rows('select count(*)::int count from notifications where entity_id=$1', [ideaId]))[0].count === 2);
  const editorialCount = (await rows('select count(*)::int count from notifications'))[0].count;
  await asRole('authenticated', ACTOR, async () => {
    await db.query("insert into idea_items(parent_idea_id,title) values($1,'nested idea')", [ideaId]);
  });
  ok('nested idea remains excluded from notifications', (await rows('select count(*)::int count from notifications'))[0].count === editorialCount);
  await asRole('authenticated', ACTOR, async () => {
    const goalId = (await rows("insert into goals(title,goal_scope,goal_month,goal_key,target_value) values('monthly goal','monthly','2026-10','posts',2) returning id"))[0].id;
    await db.query('update goals set target_value=3,updated_at=clock_timestamp() where id=$1', [goalId]);
  });
  ok('monthly goal INSERT/UPDATE remain excluded from notifications', (await rows('select count(*)::int count from notifications'))[0].count === editorialCount);
  await db.exec('insert into notifications(title,recipient_user_id,event_key) select title,recipient_user_id,event_key from notifications where event_key not like \'seed-%\' on conflict do nothing');
  ok('recipient/event_key duplicate protection remains intact', (await rows('select count(*)::int count from notifications'))[0].count === editorialCount);
  await asRole('service_role', null, async () => {
    ok('service_role can still read all notifications with existing BYPASSRLS', (await rows('select id from notifications')).length === editorialCount);
  });
} finally {
  await db.close();
}
console.log(`\n${checks} notification security/policy SQL tests passed`);
