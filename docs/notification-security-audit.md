# 通知の最小権限・RLS性能監査（2026-10-19）

## 結論と適用状態

安全なdelta案と隔離DB検証を追加した。本番は読み取り調査のみで、**migration未適用**。`apply_migration`、本番DDL、GRANT/REVOKE、Auth設定変更を実行していない。フロント、既存baseline SQL、画像migration、既存testも変更していない。

追加ファイル：

- `supabase/migrations/20261019000000_notification_least_privilege.sql`
- `tests/security-policy.database.test.mjs`
- 本文書

## 本番で確認した事実

対象は `jyxrrnfnypqaecfojsle`。`pg_policies`、`pg_proc`、`pg_trigger`、`information_schema.role_table_grants`、`has_function_privilege`、Advisorを読み取り確認した。

| 対象 | 変更前の本番状態 |
| --- | --- |
| create_channel_change_notifications() | returns trigger、PL/pgSQL、SECURITY DEFINER、所有者postgres、search_path=public,auth |
| 同関数のEXECUTE | PUBLIC、anon、authenticated、service_role、postgresへ付与。anon/authenticated/service_roleの実効権限true |
| 既存trigger | videos / ideas / goalsのAFTER INSERT OR UPDATE。企画内アイデアは通知対象外 |
| users read own notifications | PERMISSIVE、TO authenticated、SELECT、recipient_user_id=auth.uid() OR recipient_user_id IS NULL |
| users update own notifications | PERMISSIVE、TO authenticated、UPDATE、USINGとWITH CHECKが上記と同式 |
| notificationテーブル権限 | anon/authenticated/service_roleにテーブル権限があるため、行の制限はRLSでも検証が必要 |

関数はtrigger専用の戻り型であり、EXECUTEの存在だけで通常RPCから任意の通知を生成できると断定していない。通知生成に不要な直接実行権限を取り除き、Advisorの指摘対象を最小化する案である。関数本体、認証ガード、所有者、search_path、既存triggerの接続は変更しない。

開始時Security Advisorは4 WARN：

- 通知trigger関数のanon実行可能：1
- 通知trigger関数と移動RPCのauthenticated実行可能：2
- Leaked Password Protection無効：1

Performance Advisorは通知のauth.uid()再評価2 WARN、旧calendar_events FK未索引1 INFO、未使用index10 INFO。後者のindexは今回追加・削除しない。

本番未適用のため、WARNを解消済みとは報告しない。適用後にAdvisorを再実行すること。この案が対象とするのは通知triggerの2件と通知policyの2件であり、移動RPCの必要なauthenticated権限やAuthの漏洩パスワード設定は別判断である。

## deltaの内容と不変条件

1. `create_channel_change_notifications()` のEXECUTEをPUBLIC・anon・authenticatedからだけREVOKEする。service_roleと所有者の既存権限は維持する。
2. 既存SELECT policyをALTERし、auth.uid()を`(select auth.uid())`へ置き換える。
3. 既存UPDATE policyのUSING・WITH CHECKも同じ置き換えを行う。
4. `TO`やcommandを指定し直さないため、role・PERMISSIVE・SELECT/UPDATEを維持する。NULL recipientの旧互換条件も残す。
5. 1トランザクションで実施。対象関数・policyがない環境では途中の一部だけを確定せず失敗させる。再適用は同じACLとpolicyになる。

テーブル権限、RLS有効状態、関数定義、trigger定義、通知データ、画像RPCは変更しない。全機能の共有チャンネル権限をユーザー単位privateへ変更するものでもない。

`(select auth.uid())`は行に依存しないユーザー値のinitPlan化を可能にする公式推奨形。隔離DBのEXPLAINでもInitPlanを確認したが、本番の処理時間改善率を測定したわけではない。[公式RLS性能指針](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)、[最小権限の関数指針](https://supabase.com/docs/guides/database/functions#function-privileges)を参照。

## 隔離DB検証

既存 `tests/fixtures/idea-images-db.mjs` のPGliteを再利用し、既存 `tests/monthly-notifications.database.test.mjs` と同じbaseline通知定義を隔離DBへ読み込む。Vault/Cron/拡張の本番初期化部分は読み込まない。独自の緩い通知関数へ置き換えてはいない。

新規試験は**40 PASS / 0 FAIL**：

- 変更前の直接EXECUTE権限・行ごとのauth.uid()評価を再現。
- 変更後のPUBLIC/anon/authenticated権限剥奪、service_role維持、直接SQL実行拒否。
- 受信者A/Bの本人だけの閲覧・既読更新、他人の行への更新0件、偽造INSERT拒否。
- 旧NULL recipientを認証済みA/Bから閲覧可能、更新可能。anonからは閲覧0件・更新0件・INSERT拒否。
- UPDATE WITH CHECKによる他受信者への付け替え拒否。
- 既存triggerによる動画追加・編集、企画追加・編集通知が権限撤回後も動作。
- 自分自身・削除済みアカウント・YouTube統計だけの更新・企画内アイデア・月間目標を除外。
- recipient/event_keyの重複防止、service_roleの既存参照を維持。
- 関数本体・所有者・search_path・3trigger・テーブル権限・通知行・move RPC権限と定義が不変。
- policyの名前・role・command・PERMISSIVE・NULL互換・WITH CHECKを維持。
- InitPlan、migrationを2回実行したACL/policy/通知行/triggerの不変性。

併せて既存月次/通知15件、画像/RLS/Storage35件を実行し、すべてPASS。既存テストを削除・変更していない。

実行コマンド（既存ローカルPGlite依存を使用）：

```powershell
$env:PGLITE_MODULE='C:\Users\ashu2\Documents\Codex\2026-08-14\supabase\outputs\multi-image-tests\node_modules\@electric-sql\pglite\dist\index.js'
node --check tests/security-policy.database.test.mjs
node tests/security-policy.database.test.mjs
node tests/monthly-notifications.database.test.mjs
node tests/idea-images.database.test.mjs
git diff --check
```

CLI v2.114.0の`migration new --help`は、sandbox外の`C:\Users\ashu2\.supabase`作成がEPERMとなり、help段階で停止した。ホーム変更・権限迂回・再試行はしていない。`migration new`自体は未実行。指定済みファイル名に限り、許可済みworkspace内のSQL案をapply_patchで作成した。本番適用やCLI認証を行ったという意味ではない。

## 承認後の適用・確認

1. Mergeと本番SQL適用の承認後、対象関数・2policy・ACLを再取得し、この文書の前提と同じか確認する。違えば適用せず再レビュー。
2. SQL Editor等の既存管理経路で、deltaの`20261019000000_notification_least_privilege.sql`だけを実行。旧`ver23_20_supabase.sql`は再実行しない。
3. ACLとpolicy、triggerの定義を再照会。anon/authenticatedの直接EXECUTE=false、service_role=true、通知policyの役割とNULL互換が維持されていることを確認する。
4. Security/Performance Advisorを再取得。通知関数の2警告・通知RLSの2警告が消えたかを確認する。他の警告を隠したり、未確認なのに0件と報告しない。
5. 隔離された検証アカウント・データでのみ、本番API経由の動画/企画通知と本人既読を確認する。通常運用データへの破壊的なテストは行わない。

このdeltaのためのEdge再Deploy、Cron変更、Secret変更、Storage変更、通知データ移行は不要。

## rollback

失敗したトランザクションはROLLBACKし、部分適用しない。適用済みで互換性問題が実際に確認された場合だけ、承認の上で次の「監査時点の定義」を戻す。データ削除やtrigger再作成は不要。ただしPUBLIC実行権限を復元するため、恒久対策ではなく元の警告が戻る緊急復旧である。

```sql
begin;
grant execute on function public.create_channel_change_notifications()
  to public, anon, authenticated;
alter policy "users read own notifications" on public.notifications
  using (recipient_user_id = auth.uid() or recipient_user_id is null);
alter policy "users update own notifications" on public.notifications
  using (recipient_user_id = auth.uid() or recipient_user_id is null)
  with check (recipient_user_id = auth.uid() or recipient_user_id is null);
commit;
```

## 未確認・残課題

本番delta適用・適用後Advisor・本番PostgREST/RPC実通信・複数端末での通知配信は未実施。PGliteの成功を本番成功とは扱わない。PostgRESTのschema cacheや実接続role継承を含む確認は反映後に必要。

移動RPCは既存アプリが呼ぶため、単にWARNを減らす目的でauthenticated権限を撤回しない。漏洩パスワード保護はプラン・設定・正式承認を別途確認する。旧NULL recipientの共有互換を変更する場合も別仕様判断とする。[Security Advisorの権限警告](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)、[Performance AdvisorのinitPlan警告](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)。
