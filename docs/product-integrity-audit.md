# Ver23.38 総合改修・監査

## 開始基準・変更前マトリクス

開始main `10415d928018ae6445e3cac35b429ca30a671994`、23.37、PR #1–#18をGitHub metadataとfirst-parent履歴で照合。既存自動テスト206件成功。静的Vanilla SPA、manifestのみでService Worker/フレームワーク追加なし。

この表はコード変更前の監査結果。A=不足、B=本番反映不足、C=不具合/未検証、D=仕様判断。ローカル成功・本番読取・本番実操作・実機を別扱いにする。

| 機能 | 正式要件 | 現コード | 本番状態 | 分類/未完了 | リスク | 修正方針 | 検証 | 完了条件 |
|---|---|---|---|---|---|---|---|---|
| Password recovery | メール→回復session→新password | 入口/API/callbackなし | Auth URL/SMTP未確認 | A | 高:通常login競合 | 既存SDK/世代制御に局所追加 | callback競合/認証/弱password/ブラウザ | UI/API/guard完成＋本番mail別確認 |
| 認証/PWA復帰 | single-flight/世代/一時障害区別 | 既存refresh/getUser/復帰あり | 実機一度の症状、traceなし | C:原因未確定 | 高 | 再現できるfailureのみ防御 | expired/invalid/offline/stale | 一時通信でcredential消去なし |
| 動画管理 | card/minimal/投稿日順/警告 | 2表示正常、警告は詳細のみ | Pages公開先を調査中 | A/C | 中:行高 | 共通警告を3画面へ | 0/NULL/URL/4幅 | 全3表示で同じ判定 |
| 企画 | 追加編集/board/子移動 | 既存実装/回帰あり | tables/RPC存在 | C:本番操作未検証 | 高:画像 | 保存logic維持 | 隔離DB/browser | 既存操作回帰成功 |
| 企画内アイデア | 追加編集/詳細/削除 | 既存実装 | 既存tables/RPC | C:本番操作未検証 | 高 | 変更なし | 回帰/隔離DB | semantic維持 |
| 複数画像 | 既存−明示削除＋追加/10枚 | append/RPC/参照保護あり | 本番RPC/Storageを読取確認 | C:物理iPhone未検証 | 高:既存画像 | 改変なし | A→AB→ABC→reload→AC | 既存画像保持 |
| ホーム | 月別LIVE/投稿ペース/週間予定 | 現要件実装 | 静的公開/本番API操作未検証 | C | 中 | 表示回帰のみ | 月選択/4幅 | 正常部分不変 |
| YouTube同期 | 個別/一括/自動/同期timestamp | 共通API/状態判定あり | sync v6/sharedはmain同一 | C:本番API未試行 | 高:課金/統計 | Deploy/書込なし | API fixture/再描画 | 現同期仕様保持 |
| 月別実績 | 当月LIVE/過去snapshot不変 | 現要件実装 | immutable trigger/RLS存在 | C:実機未検証 | 高:過去値 | 改変なし | NULL/過去lock | snapshot上書き0 |
| タグ目標 | active8/選択月正目標のみ | tag_question/tag_clipあり | 通常goals既存schema | C | 高:legacy | 改変なし | 保存/reload/legacy | 8タグ・旧値維持 |
| 月末自動確定 | 新2タグ/goal保存/冪等 | main対応済み | v2に4行不足 | B | 高:月末 | 承認済みmain関数のみDeploy | JST/失敗/再試行/source再取得 | 本番ソース一致、実月末別確認 |
| 報酬 | 現priority/支払いflag維持 | LIVE動画から再計算 | 確定金額カラムなし | D:実支払履歴未固定 | 高:金銭 | 設計案/再現のみ | 過去tag/date/削除影響 | 式/flag/過去額の書込なし |
| 通知 | 相手のみ/自分除外/重複防止 | 既存trigger/RLS | trigger公開EXECUTE過剰、RLS再評価 | C | 高:権限 | 最小migration＋隔離試験、本番適用は未承認 | anon/受信者/trigger/RPC | 既存通知維持/本番は反映待ち |
| ゴミ箱 | soft/restore/permanent/終了保証 | #18の専用lifecycle | schema変更不要 | C:実機未検証 | 高:削除 | 改変なし | 68既存failure試験/隔離browser | 二重要求/無限loadingなし |
| 同期状態 | Realtimeと取得成功を区別 | 同じlabelが部分失敗を上書き | DB成功とは無関係なSUBSCRIBED | A/C | 中 | 取得状態を独立表示 | optional失敗→subscribe | 部分失敗で最新と断定しない |
| Realtime | 1購読 | 世代/single-flightあり | publicationを読取確認 | C | 高:重複 | channel増設なし | subscribe/logout競合 | 1購読維持 |
| iPhone PWA | manifest/safe-area/入力16px/復帰 | 現実装あり | 物理端末なし | C:未検証 | 中 | 自動4幅＋手順 | Chromium/WebKit可能範囲 | 実機未確認を明記 |

## 本番操作の境界

ユーザーは月末関数のみ、最新main・共有依存込み・verify_jwt=false維持のDeployを追加承認。他のAuth/Redirect/DDL/RLS/Storage/Cron/Secret/データの本番変更は未承認で実行しない。既存snapshotへの更新・再確定やテストINSERTは禁止。

## 実装・検証後の状態

| 分類 | 結果 |
|---|---|
| 完成（PR内） | 再設定メール入口、SDK回復イベント優先、新password更新、局所signout、通常login復帰。警告3表示。取得状態分離。Auth競合の再現可能な不具合防御 |
| 本番反映完了 | 最新main由来finalize-monthly-achievements v2→v3。2ファイル再取得・全文一致・verify_jwt=false維持 |
| 反映待ち | フロント23.38（Draft PRのレビュー/Merge待ち）、通知delta（本番SQL承認待ち） |
| 未検証 | 実メール、SMTP/Redirect/サーバーpassword policy、物理iPhone/PWA、実月末Cron/本番YouTube API呼出 |
| 仕様判断 | 実支払額の固定保存・訂正台帳、漏洩password保護設定、将来の権限モデル/旧index整理 |

初期マトリクスの「C」は一括で解消済みにしない。ローカル回帰成功は本番の実操作や物理端末確認の代用ではない。

## Password Recovery

resetPasswordForEmail→SDK PASSWORD_RECOVERY→getUser検証→同一userのgetSession/getUser再検証→updateUser({password})→signOut({scope:'local'})→login。既存のclient-only implicit flowと固定SDK2.112.3、persistSession/autoRefreshToken/detectSessionInUrlを維持し、SSR/PKCE/独自token保存を追加しない。[公式reset API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)、[password flow](https://supabase.com/docs/guides/auth/passwords)に沿う。

- redirectは実行中originのアプリdirectoryへ固定し、`?recovery=1`を付加。外部入力のnext/redirectを採用しない。HTTPS（loopback除く）を要求。
- `?recovery=1`だけでは更新できない。SDK回復イベントとサーバーで検証したuserが必要。通常SIGNED_IN/startup/resumeを回復処理中は抑止。Auth callback内でSDK APIをawaitしない。
- SDK初期化後にURLのtoken fragment/code/errorを消去。回復完了までは非秘密のrecovery markerだけ残し、reloadで通常homeへ逃げない。reload後に回復イベントを確認できなければ再送へ戻す保守的仕様。
- 8文字以上＋確認一致（フロント最低条件）。実サーバーのpassword policyも適用されるが設定値は未確認。弱password/同一password/通信失敗/期限切れ・使用済みリンクに安全な文言を表示。
- 1要求中の再送を抑止し、メール再送は端末内60秒間隔。サーバーrate limitの代替ではない。存在する/しないアカウントに同じ成功文言。429は待機を案内。
- 生のエラー本文、password、callback URL、tokenをAuth診断へ出さない。passwordはDOM/API送信以外へ保存しない。成功・logout・回復対象変更・新回復sessionで2欄を消去。署名検証を自作しない。
- SDK session保存は既存方式のまま。SafariとPWAのsession共有を仮定せず、再設定後にPWAで新passwordによるloginを案内。

独立レビューで「Aの回復画面入力がBの回復sessionへ残る」P2を再現して修正し、回帰テストを追加。実メールにある古い/期限切れリンクは最新メールの再送を案内する。ローカルfixtureではメールを送らず、Supabase Auth本番のpasswordも変更していない。

## PWA認証症状と同期状態

物理iPhoneの一度のlogout症状はログがなく、根本原因を断定できない。時計ずれ、失効refresh token、通信不良等を推測で本番設定へ反映しない。再現できた以下だけを修正：

1. queued SIGNED_IN→SIGNED_OUTの後、古いtimeoutが再起動する競合をevent revision＋session generationで破棄。
2. 明確なrefresh_token_not_found/already_used/session_not_found/expiredはloginへ戻し、表示cacheを消去。一時503/offlineやfuture-issued JWTは勝手にcredential消去せず既存有界refresh/retryを維持。
3. raw Authエラー本文の診断出力を分類・code・statusへ限定。
4. dataLoadStatusを既存の接続/同期表示と独立。loading/current/partial/errorを示し、SUBSCRIBEDが一部取得失敗を成功表示へ変えない。新しいRealtime channelや追加queryは作らない。スマホでも表示。

## 動画警告

getVideoDataWarnings/renderVideoWarningsをカード・超簡素・詳細で共用。投稿日なし、URL/IDなし、解析不能URL、投稿済みなのに同期根拠なしを区別。0再生/0like/0commentは取得済みの値でありNULLとは別。valid保存IDのfallbackを維持。投稿待ちはⓘ、投稿済みは⚠と文言で区別し色だけに依存しない。超簡素はアイコン＋件数とaccessible説明を使い、行高と既存操作を維持。詳細で全理由を確認できる。

## Supabase・Security・Performance

本番schema/RLS/Storage/trigger/RPCは読取調査のみ。共有チャンネルとしてのauthenticated権限を勝手にprivate化しない。snapshotはauthenticated SELECTのみ、UPDATE/DELETEはimmutable triggerで拒否。画像RPC/Storage参照保護/通知/過去月lockの既存試験も継続。

Security Advisor：開始4 WARN→終了4 WARN。Performance：2 WARN＋11 INFO→同数。本番SQL未適用のため解消済みと呼ばない。

- 通知trigger関数のPUBLIC/anon/authenticated直接EXECUTEの2警告と、通知RLSのauth.uid再評価2警告だけがdelta対象。service_role/owner/trigger/role/NULL受信者互換/WITH CHECKは維持。隔離40件成功。
- move_idea_to_completed_parentのauthenticated EXECUTEはアプリに必要で、既存Auth guard/lockを確認して維持。Advisorを消すためにRPCを壊さない。
- Leaked Password Protectionは無効を確認したがAuth設定変更は未承認。設定可否/運用確認待ち。
- 旧calendar FK索引1 INFO、unused index10 INFOはworkloadなしに削除/追加しない。performance改善率を測定したとは報告しない。

詳細・公式remediation・delta単独適用/rollbackは[通知監査](notification-security-audit.md)参照。旧baseline SQLを通常更新で再実行しない。

## 公開先・Auth設定の確認限界

GitHub mainのPages workflow run38358296536/deploy job115166385728の成功ログから公開URL `https://ashu211313-netizen.github.io/youtube/` を確認。手入力した推測URLではない。

Site URL、Redirect allowlist、Reset Passwordテンプレート/SMTP、OTP期限、サーバーpassword policyは利用可能なSupabase connectorに読取機能がなく未確認。Management API認証を別の場所から抽出していない。これらを確認/変更済みと報告しない。

Merge後、Auth担当者が既存設定を読み、実URLと `https://ashu211313-netizen.github.io/youtube/?recovery=1` へのreturnを許可しているか確認する。変更が必要なら別途承認を得てから行う。Reset Passwordメールが公式ConfirmationURL/RedirectToを正しく使うか、SMTP配送とrate limit/expiryを専用アカウントで確認。未知のユーザーへ試験メールを送らない。

## テスト結果・再現方法

開始206件を維持し、追加64件で**270件成功**（Node VM155＋独立static/画像22＋DB93）。node --testの表示は画像独立scriptを1fileとして数えるため156 tests、意味のある個別assertion試験は上記270件。既存テストの削除なし。

追加：月末8、Auth/警告/状態16、通知権限40。既存card/minimalの全文比較は、新たに要件指定された警告markupだけ除いてcanonicalと比較。任意差分を無視していない。fixtureは新URL APIとversionへ追従。HTML duplicate ID/DOM参照/関数重複、CSS brace、manifest、SQL非破壊、JS構文も成功。tracked/新規47ファイルのprivate credential pattern scanは検出0（公開publishable keyは既存仕様で、網羅的漏洩保証ではない）。

```powershell
node --check app.js
node --test tests/*.test.cjs
node tests/idea-images.database.test.mjs
node tests/monthly-notifications.database.test.mjs
node tests/video-tags.database.test.mjs
node tests/security-policy.database.test.mjs
node tests/browser-server.mjs
# 別terminal。PGLITE_MODULE/PLAYWRIGHT_MODULEは既存ローカル依存の絶対pathを指定
node tests/two-views.browser.mjs
node tests/product-integrity.browser.mjs
$env:QA_ENGINE='webkit'
node tests/product-integrity.browser.mjs
git diff --check
```

ブラウザはloopback＋CSP＋外部route拒否の隔離環境。390/430/768/1280をChromium/WebKitで確認。警告card/minimal/detail、実績/過去月lock、resetメールUI、回復更新、invalid callback、入力16px、overflowなしを測定。通常flow console error/warning0、意図的optional DB失敗だけ期待したwarning1/engine。既存two-views/delete browser10チェック成功。画像・企画・nestedの保存/削除は隔離DBと既存browser回帰で確認。

最初のbrowser再実行はapp shell表示とデータ完了を同一視したtestのraceで一度失敗した。実際のdataLoadStatus完了を待つよう試験を修正し、両engine/4幅を再実行。アプリの取得中を取得済みへ偽装する変更はしていない。

## 維持した仕様・未実施

active8タグの順序/legacy保持、週間hero＋6日、投稿日順、ニュースShorts合算、race0/news100/Shorts100/横1000、投稿待ち内部status、当月LIVE/過去snapshot不変、月別目標、ホームYouTube更新、企画/board/nested/複数画像、ゴミ箱/復元/削除、通知、自分除外、single-flight、Realtime1、4ナビ/PCmodal操作を既存回帰で維持。AI/24時間/旧目標tab/compact/thumbnail toggleを再導入していない。

財務式・支払済みflagや過去額は変更なし。過去額がLIVE動画変更で変わるリスクと将来台帳案は[履歴・報酬監査](product-integrity-history-payments.md)。証拠なしに旧支払額をbackfillしない。

物理iPhone/PWA、実際の再設定メール・旧password拒否/新password成功、本番YouTube API、実月末実行は未確認。HTTPネットワークやCLIホーム書込の制約を回避するためにcredentialを抽出していない。gh CLIは必須にせずGitHub連携でDraft PRまで反映する。mainへ直接commit/Mergeしない。

## リリース順序・手動確認

1. Draft PRをレビューしてMerge（本作業ではMergeしない）。Pagesの23.38/app-versionを確認。
2. Auth設定を読取確認。必要な設定変更は別承認後。専用アカウントでrequest→実メール→Safari→更新→旧password拒否/新passwordlogin→PWAlogin、期限切れ/使用済みリンク/再送を確認。
3. iPhoneで完全終了/再開、offline/online、login/logout、modal/背景スクロール、画像追加A→AB→ABC→reload→AC、8タグ/過去lock/削除復元を確認。
4. 通知deltaの本番適用は別承認後だけ。適用前にACL/policy前提再照合、delta単独実行、Advisor再取得。Auth/Storage/Cron/Secret変更不要。
5. finalizerはすでにv3。再Deploy不要。次の通常Cronと2026-11-01 00:05 JSTの10月snapshotを読取で確認。未作成時のAPI/quota/非公開動画の障害は既存仕様として調査し、既存snapshotを再確定しない。

フロントrollbackは今回commitを通常のrevert PRで戻す。DB deltaは未適用なので現時点でrollback SQL不要。finalizer rollbackは別[Deploy記録](finalizer-deployment-20261019.md)のv2復元sourceを使用し、データを巻き戻さない。
