-- 競艇チャンネル管理 Ver23.20
-- Supabase Dashboard → SQL Editorで1回だけ実行してください。
-- 既存データを破壊するDDLや一括書き換えはありません。

-- =========================================================
-- 既存テーブルの安全な互換性拡張
-- =========================================================
alter table public.videos add column if not exists youtube_video_id text;
alter table public.videos add column if not exists youtube_views bigint;
alter table public.videos add column if not exists youtube_likes bigint;
alter table public.videos add column if not exists youtube_comments bigint;
alter table public.videos add column if not exists youtube_published_at timestamptz;
alter table public.videos add column if not exists youtube_synced_at timestamptz;
alter table public.videos add column if not exists youtube_24h_captured_at timestamptz;
alter table public.videos add column if not exists tags text;

alter table public.ideas add column if not exists tags text;
alter table public.ideas add column if not exists image_url text;
alter table public.idea_items add column if not exists image_url text;

alter table public.goals
  add column if not exists goal_scope text not null default 'long';
alter table public.goals
  add column if not exists goal_month text;

create index if not exists videos_youtube_video_id_idx
  on public.videos(youtube_video_id);

-- =========================================================
-- YouTubeチャンネル最新統計
-- =========================================================
create table if not exists public.channel_stats (
  channel_id text primary key,
  channel_title text not null default '',
  subscriber_count bigint,
  total_view_count bigint,
  video_count bigint,
  synced_at timestamptz not null default now()
);

alter table public.channel_stats enable row level security;

drop policy if exists "authenticated read channel stats" on public.channel_stats;
drop policy if exists "authenticated insert channel stats" on public.channel_stats;
drop policy if exists "authenticated update channel stats" on public.channel_stats;

create policy "authenticated read channel stats"
on public.channel_stats for select to authenticated
using (true);

create policy "authenticated insert channel stats"
on public.channel_stats for insert to authenticated
with check (true);

create policy "authenticated update channel stats"
on public.channel_stats for update to authenticated
using (true) with check (true);

grant select, insert, update on public.channel_stats to authenticated;

-- =========================================================
-- 画像添付用Storage
-- =========================================================
insert into storage.buckets (id, name, public)
values ('idea-images', 'idea-images', true)
on conflict (id) do update set public = true;

drop policy if exists "idea images public read" on storage.objects;
create policy "idea images public read"
on storage.objects for select to public
using (bucket_id = 'idea-images');

drop policy if exists "authenticated upload idea images" on storage.objects;
create policy "authenticated upload idea images"
on storage.objects for insert to authenticated
with check (bucket_id = 'idea-images');

drop policy if exists "authenticated update own idea images" on storage.objects;
create policy "authenticated update own idea images"
on storage.objects for update to authenticated
using (bucket_id = 'idea-images')
with check (bucket_id = 'idea-images');

-- =========================================================
-- 通知：本人以外 / 企画内アイデアは対象外 / 二重生成防止
-- =========================================================
alter table public.notifications add column if not exists recipient_user_id uuid;
alter table public.notifications add column if not exists actor_user_id uuid;
alter table public.notifications add column if not exists event_key text;

create index if not exists notifications_recipient_read_idx
  on public.notifications(recipient_user_id, is_read, created_at desc);

create unique index if not exists notifications_recipient_event_key_uidx
  on public.notifications(recipient_user_id, event_key)
  where recipient_user_id is not null and event_key is not null;

alter table public.notifications enable row level security;

drop policy if exists "authenticated notifications" on public.notifications;
drop policy if exists "users read own notifications" on public.notifications;
drop policy if exists "users update own notifications" on public.notifications;

create policy "users read own notifications"
on public.notifications for select to authenticated
using (recipient_user_id = auth.uid() or recipient_user_id is null);

create policy "users update own notifications"
on public.notifications for update to authenticated
using (recipient_user_id = auth.uid() or recipient_user_id is null)
with check (recipient_user_id = auth.uid() or recipient_user_id is null);

-- 企画内アイデアでは通知を作らない。
drop trigger if exists idea_items_channel_notifications on public.idea_items;

create or replace function public.create_channel_change_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_title text := '';
  v_message text := '';
  v_entity_type text := '';
  v_entity_id text := '';
  v_event_key text := '';
begin
  -- SQL Editorなど、ログインユーザーが特定できない処理は通知しない。
  if v_actor is null then
    return new;
  end if;

  if tg_table_name = 'videos' then
    v_entity_type := 'video';
    v_entity_id := new.id::text;
    v_message := coalesce(new.title, '');

    if tg_op = 'INSERT' then
      if new.deleted_at is not null then return new; end if;
      v_title := '動画を追加しました';
    elsif tg_op = 'UPDATE' then
      if new.deleted_at is not null then return new; end if;

      -- YouTube自動同期（再生/高評価/コメント/24h記録/同期時刻）だけでは通知しない。
      if row(
        new.title,
        new.video_type,
        new.status,
        new.post_date,
        new.youtube_url,
        new.tags,
        new.memo
      ) is not distinct from row(
        old.title,
        old.video_type,
        old.status,
        old.post_date,
        old.youtube_url,
        old.tags,
        old.memo
      ) then
        return new;
      end if;

      v_title := '動画を更新しました';
    end if;

  elsif tg_table_name = 'ideas' then
    v_entity_type := 'idea';
    v_entity_id := new.id::text;
    v_message := coalesce(new.title, '');

    if tg_op = 'INSERT' then
      if new.deleted_at is not null then return new; end if;
      v_title := '企画を追加しました';
    elsif tg_op = 'UPDATE' then
      if new.deleted_at is not null then return new; end if;

      if row(new.title, new.status, new.note, new.tags, new.image_url)
         is not distinct from
         row(old.title, old.status, old.note, old.tags, old.image_url) then
        return new;
      end if;

      v_title := '企画を更新しました';
    end if;

  elsif tg_table_name = 'goals' then
    v_entity_type := 'goal';
    v_entity_id := new.id::text;
    v_message := coalesce(new.title, '');

    if tg_op = 'INSERT' then
      if new.deleted_at is not null then return new; end if;
      v_title := case when coalesce(new.achieved, false)
        then '目標達成' else '目標を追加しました' end;
    elsif tg_op = 'UPDATE' then
      if new.deleted_at is not null then return new; end if;

      if coalesce(old.achieved, false) = false
         and coalesce(new.achieved, false) = true then
        v_title := '目標達成';
      elsif row(
        new.title,
        new.current_value,
        new.target_value,
        new.deadline,
        new.achieved,
        new.goal_scope,
        new.goal_month
      ) is distinct from row(
        old.title,
        old.current_value,
        old.target_value,
        old.deadline,
        old.achieved,
        old.goal_scope,
        old.goal_month
      ) then
        v_title := '目標を更新しました';
      else
        return new;
      end if;
    end if;
  else
    return new;
  end if;

  if v_title = '' then return new; end if;

  -- created/updated時刻を含め、同一DBイベントの二重通知を防止。
  v_event_key :=
    tg_table_name || ':' || v_entity_id || ':' || lower(tg_op) || ':' ||
    coalesce(new.updated_at::text, new.created_at::text, clock_timestamp()::text);

  insert into public.notifications (
    title,
    message,
    entity_type,
    entity_id,
    is_read,
    recipient_user_id,
    actor_user_id,
    event_key,
    created_at
  )
  select
    v_title,
    v_message,
    v_entity_type,
    v_entity_id,
    false,
    account.id,
    v_actor,
    v_event_key,
    now()
  from auth.users as account
  where account.id <> v_actor
    and account.deleted_at is null
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists videos_channel_notifications on public.videos;
create trigger videos_channel_notifications
after insert or update on public.videos
for each row execute function public.create_channel_change_notifications();

drop trigger if exists ideas_channel_notifications on public.ideas;
create trigger ideas_channel_notifications
after insert or update on public.ideas
for each row execute function public.create_channel_change_notifications();

drop trigger if exists goals_channel_notifications on public.goals;
create trigger goals_channel_notifications
after insert or update on public.goals
for each row execute function public.create_channel_change_notifications();

-- Realtimeへの登録を安全に補完。
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channel_stats'
  ) then
    alter publication supabase_realtime add table public.channel_stats;
  end if;
end $$;

alter table public.notifications replica identity full;
alter table public.channel_stats replica identity full;

-- =========================================================
-- アイデア → 企画ボード内アイデアへの明示移動RPC
-- =========================================================
create or replace function public.move_idea_to_completed_parent(
  p_source_idea_id text,
  p_target_idea_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.ideas%rowtype;
  v_target public.ideas%rowtype;
  v_new_item_id text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です。';
  end if;

  select * into v_source
  from public.ideas
  where id::text = p_source_idea_id
    and deleted_at is null
  for update;

  if not found then raise exception '移動元の企画が見つかりません。'; end if;
  if v_source.status <> 'アイデア' then
    raise exception 'アイデア状態の企画だけ移動できます。';
  end if;

  select * into v_target
  from public.ideas
  where id::text = p_target_idea_id
    and deleted_at is null
  for update;

  if not found then raise exception '移動先の企画が見つかりません。'; end if;
  if v_target.status <> '実行済み' then
    raise exception '企画ボードだけを移動先にできます。';
  end if;

  insert into public.idea_items (
    parent_idea_id,
    title,
    note,
    status,
    image_url,
    created_at,
    updated_at
  ) values (
    p_target_idea_id,
    v_source.title,
    coalesce(v_source.note, ''),
    'アイデア',
    v_source.image_url,
    now(),
    now()
  ) returning id::text into v_new_item_id;

  -- このDELETEはSQL移行時には実行されず、ユーザーが明示的に「移動」を選んだ時だけ実行。
  delete from public.ideas where id::text = p_source_idea_id;

  return jsonb_build_object(
    'item_id', v_new_item_id,
    'parent_idea_id', p_target_idea_id,
    'title', v_source.title
  );
end;
$$;

revoke all on function public.move_idea_to_completed_parent(text, text) from public;
grant execute on function public.move_idea_to_completed_parent(text, text) to authenticated;
