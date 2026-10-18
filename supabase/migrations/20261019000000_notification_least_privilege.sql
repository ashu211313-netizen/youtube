-- Reviewed delta for the existing production notification objects.
-- Apply only after approval; do not rerun the historical baseline SQL.
-- No rows, trigger bodies, trigger bindings, table grants or service_role ACL change.
begin;

revoke execute on function public.create_channel_change_notifications()
  from public, anon, authenticated;

-- ALTER without TO preserves the existing roles, command and permissive mode.
alter policy "users read own notifications"
  on public.notifications
  using (recipient_user_id = (select auth.uid()) or recipient_user_id is null);

alter policy "users update own notifications"
  on public.notifications
  using (recipient_user_id = (select auth.uid()) or recipient_user_id is null)
  with check (recipient_user_id = (select auth.uid()) or recipient_user_id is null);

commit;
