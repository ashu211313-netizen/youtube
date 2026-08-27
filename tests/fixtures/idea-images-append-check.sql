-- Test only: success raises IDEA_IMAGES_QA_OK to roll back every test row.
-- Run after the image migration in an isolated test database/schema.
do $check$
declare
  v_kind text;
  v_board jsonb;
  v_row jsonb;
  v_values jsonb;
  v_urls text[];
  v_added text[];
  v_removed text[];
  v_expected text[];
  v_first_id uuid;
  v_count integer;
  v_phase integer;
  v_counts jsonb;
  v_result jsonb := '[]'::jsonb;
  v_base text;
begin
  if has_function_privilege('anon','public.save_idea_with_images(text,text,jsonb,text[],text[],text[],timestamptz)','execute') then
    raise exception 'Anonymous default execute grant was not revoked';
  end if;
  v_board := public.save_idea_with_images('idea',null,
    '{"title":"isolated image QA board","status":"実行済み"}',array[]::text[],array[]::text[],array[]::text[],null);
  foreach v_kind in array array['idea','idea_item'] loop
    v_base := 'https://qa.invalid/storage/v1/object/public/idea-images/ideas/' || v_kind || '-';
    v_values := jsonb_build_object('title','isolated append QA','status','アイデア','parent_idea_id',v_board->>'id');
    v_row := null;
    v_urls := array[]::text[];
    v_counts := '[]'::jsonb;
    for v_phase in 1..5 loop
      v_removed := array[]::text[];
      case v_phase
        when 1 then v_added := array[v_base||'A.png']; v_expected := v_added;
        when 2 then v_added := array[v_base||'B.png']; v_expected := array[v_base||'A.png',v_base||'B.png'];
        when 3 then v_added := array[v_base||'C.png']; v_expected := array[v_base||'A.png',v_base||'B.png',v_base||'C.png'];
        when 4 then v_added := array[]::text[]; v_removed := array[v_base||'B.png']; v_expected := array[v_base||'A.png',v_base||'C.png'];
        when 5 then v_added := array[v_base||'D.png',v_base||'E.png']; v_expected := array[v_base||'A.png',v_base||'C.png',v_base||'D.png',v_base||'E.png'];
      end case;
      v_row := public.save_idea_with_images(v_kind,v_row->>'id',v_values,
        v_added,v_removed,v_urls,(v_row->>'updated_at')::timestamptz);
      -- Discard the returned images: get the parent and all image rows from DB.
      if v_kind='idea' then
        select to_jsonb(i) into v_row from public.ideas i where id=(v_row->>'id')::uuid;
        select array_agg(image_url order by sort_order),count(*) into v_urls,v_count
          from public.idea_images where idea_id=(v_row->>'id')::uuid;
      else
        select to_jsonb(i) into v_row from public.idea_items i where id=(v_row->>'id')::bigint;
        select array_agg(image_url order by sort_order),count(*) into v_urls,v_count
          from public.idea_images where idea_item_id=(v_row->>'id')::bigint;
      end if;
      if v_urls is distinct from v_expected then raise exception 'Wrong persisted images: % phase %',v_kind,v_phase; end if;
      if v_row->>'image_url' <> v_base||'A.png' then raise exception 'Legacy first image overwritten'; end if;
      if v_phase=1 then
        select id into v_first_id from public.idea_images where image_url=v_base||'A.png';
      elsif not exists(select 1 from public.idea_images where id=v_first_id and image_url=v_base||'A.png') then
        raise exception 'Retained image was deleted/reinserted';
      end if;
      v_counts := v_counts || to_jsonb(v_count);
    end loop;
    -- Empty file selection without an explicit removal cannot erase attachments.
    perform public.save_idea_with_images(v_kind,v_row->>'id',v_values,
      array[]::text[],array[]::text[],v_urls,(v_row->>'updated_at')::timestamptz);
    perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
    select count(*) into v_count from public.idea_images
      where (v_kind='idea' and idea_id=(v_row->>'id')::uuid)
         or (v_kind='idea_item' and idea_item_id=(v_row->>'id')::bigint);
    if v_count <> 4 then raise exception 'Second user cannot read persisted images'; end if;
    perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
    v_result := v_result || jsonb_build_object('kind',v_kind,'counts',v_counts,'retained_id',true,'second_user_count',v_count);
  end loop;
  raise exception 'IDEA_IMAGES_QA_OK:%',v_result using errcode='PZ001';
end;
$check$;
