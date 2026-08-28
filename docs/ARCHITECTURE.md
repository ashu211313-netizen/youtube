# 構成・変更時の入口（23.31）

## 実行構成

ビルド不要の静的HTML/CSS/JavaScript。`index.html` が固定版supabase-js UMDを読み、その後 `app.js` を起動する。フレームワーク、package.json、Service Worker、CI workflowは現リポジトリにない。PWA設定は `manifest.json` と3サイズのPNGアイコン。公開先の既存導入手順はGitHub Pagesを前提とするが、Pages設定画面の公開元ブランチ・ディレクトリは今回未確認。

| ファイル | 責務 |
| --- | --- |
| `index.html` | 認証画面、ホーム・動画・企画・実績の4画面、共有dialog、ナビ |
| `style.css` | iPhone基準の部品、safe-area、入力16px、PC調整。既存の後勝ちCSSに注意 |
| `app.js` | 下記の状態・取得・集計・描画・保存・認証ライフサイクル |
| `manifest.json`, `icon-*.png` | PWAメタデータ・アイコン。認証情報やDBキャッシュは保存しない |
| `supabase/functions/_shared/youtube.ts` | URL/ID解析・件数変換・YouTube APIの50件分割 |
| `supabase/functions/sync-youtube-video/index.ts` | ログイン検証、個別/一括同期、現在統計・channel_stats更新 |
| `supabase/functions/finalize-monthly-achievements/index.ts` | 前月の同期・実績/目標スナップショットの初回確定 |
| `ver23_20_supabase.sql` | 歴史的な互換性拡張SQL。既存基本テーブルを前提にする。完全な初期構築SQLではない |
| `supabase/migrations/20260827110343_multi_idea_images.sql` | 複数画像テーブル・原子的保存RPC・参照保護・移動RPC |
| `tests/` | Node VM、インメモリPostgres、ローカルブラウザ用フィクスチャ |

## app.js の読み方

関数名を検索して該当箇所へ進む。今回ファイル分割や大規模な並べ替えはしていない。

| 入口 | 内容・不変条件 |
| --- | --- |
| 定数 / `elements` | ステータス、7タグ、目標キー、DOM参照。DB内部値と表示名を区別 |
| `createEmptyDataState`, `mapVideo`, `mapIdea`, `mapAchievementSnapshot` | DB snake_case → UIデータ。未取得を0と混同しない |
| `selectNewestRows`, `fetchAllDataOnce`, `loadAllData` | videos/ideas/idea_itemsが必須。目標・実績履歴・支払い・通知・channel_statsは任意取得。既存画像へのfallbackあり |
| `getMonthlyPostStats`, `getMonthlyAchievementStats` | ホーム/実績の月間集計。updated_atを投稿日時に使わない |
| `getVideoReward`, `calculateMonthlyReward`, `calculateOutstandingBalance` | 報酬優先順位・表示カテゴリ・未払い合計 |
| `renderAll`, `renderDashboard`, `renderVideos`, `renderIdeas`, `renderAchievements` | 状態から表示を生成。取得/保存は別関数 |
| `WEEKLY_UPLOAD_SCHEDULE`, `renderWeeklyUploadSchedule` | 固定週間予定と9ルールの唯一の定義。DBも新規タイマーも不要 |
| `openForm`, `saveVideo`, `saveIdeaImageRecord` | フォーム/明示保存。画像追加・削除は完成一覧の置換ではない |
| `openManagedDialog`, `closeManagedDialog`, `restoreDialogStateAfterResume` | モーダル階層、背景スクロールロック、復帰 |
| `initialize`, `startAuthenticatedApp`, `resetAuthenticatedApp`, `resumeAuthenticatedApp` | ログイン・終了・PWA復帰 |
| `subscribeRealtime`, `scheduleRealtimeRefresh`, `setupEventListeners` | 単一購読・200ms再取得まとめ・イベントの一度だけ登録 |

### 状態の所有者

- `data` はサーバーから取得した画面用状態。フォーム編集中の値はフォーム側で保持する。
- `selectedAchievementMonth` / `selectedPostStatsMonth` / `activeVideoFilter` は表示選択。
- `ideaImageEditors` は各エディタの既存・追加予定・明示削除予定を保持するWeakMap。保存/キャンセル後にObject URLを解放する。
- `pendingIdeaImageCleanup` は参照のなくなった画像の掃除再試行。`localStorage`への保存不能時はメモリ内。認証の保存はsupabase-jsが担当する。
- `dataLoadInFlight` / `authValidationInFlight` / `appStartInFlight` / `appResumeInFlight` / `realtimeSubscribeInFlight` は各処理の同時実行をまとめる。
- `appSessionGeneration` はログアウト/ユーザー切替で増加する。古い読み取り・起動・復帰・同期結果は新しい状態を更新しない。古いPromiseのfinallyは新しいPromiseを解除しない。
- YouTubeの起動タイマーと1時間intervalは起動/停止で対になる。実行中ロックはリクエスト自身のfinallyだけが解除する。

### 日付・表示ルール

- 週間予定は既存 `getJstDateParts` を再利用してJST曜日を判定。ホーム表示、通常再描画、foreground復帰で更新する。24時間常駐の追加タイマーはない。
- 本文は月〜日。今日だけ色・枠・「今日」・`aria-current="date"` を付ける。`details/summary` の開閉を再描画で失わない。
- 動画投稿日は `youtubePublishedAt` 優先、未取得時は `postDate`。同日だけcreatedAt/idで安定化。日時未取得は後方。
- 月間集計はYouTube公開日時のJST月、手入力日はdate-only。既存の登録日表示など端末ローカルDateは今回変更していない。
- 実績6指標は `ACHIEVEMENT_METRIC_DEFINITIONS` をフォームと描画で共有する。過去月の文言だけ「その月」に変える。
- 過去月は保存済みsnapshotを優先。なければ投稿本数・当月保存目標だけを利用し、復元不能なYouTube値は「履歴データなし」。現在月の目標を補完しない。
- タグ目標カードは選択月に正の目標があるタグだけ。目標あり・実績0は表示する。
- 報酬はレース映像0円 → 競艇ニュース100円 → Shorts100円 → 横動画1000円。ニュース100円対象はShorts報酬欄に一度だけ加算。動画タイプと「横動画」タグを混同しない。

## Supabase（2026-08-29 読み取り監査）

接続先は `jyxrrnfnypqaecfojsle`。UIは認証済みユーザーによる共有チャンネル管理で、所有者別privateアプリではない。

| テーブル | 用途 |
| --- | --- |
| videos | 動画、投稿日時、7タグ（TEXT）、YouTube現在統計。旧views_24系は残存するがアプリ未使用 |
| ideas / idea_items | 企画・企画内アイデア。親IDはUUID、子IDはbigint、parent_idea_idはTEXT |
| idea_images | UUID/関連親FK/URL/path/並び順。旧image_urlは互換用先頭画像 |
| goals | 実績ページ内の月別目標。旧目標タブは復活させない |
| monthly_achievement_snapshots | 月末実績・タグ本数・その月の目標。確定後UPDATE/DELETE禁止 |
| monthly_payments | month_key / is_paid / paid_at。確定金額カラムはない。現行報酬額は動画から表示時集計。今回は変更なし |
| notifications / activity_logs | 相手向け通知 / 操作履歴。自分除外、YouTube統計だけと企画内アイデアは通知対象外 |
| channel_stats | チャンネル最新統計 |
| calendar_events | 現行アプリ未使用の旧テーブル。削除しない |

11テーブルすべてRLS有効。snapshotは認証済みSELECTのみ。通知はrecipient本人（または旧NULL行）の読み取り/既読更新。画像保存RPCはinvoker、移動RPCは認証ガード付きdefiner。匿名の画像RPC実行は不可。

Realtime publicationは videos / ideas / idea_items / goals / monthly_payments / notifications / channel_stats / monthly_achievement_snapshots / activity_logs。アプリはactivity_logs以外を単一channelで購読する。idea_imagesは親更新と同一トランザクションなので親イベントで再取得する。

Storage `idea-images` は既存public bucket。アップロード/更新はauthenticated、削除は全参照から外れた生成pathだけ。既存画像の参照保護を外さない。詳細は [複数画像の設計](multi-idea-images.md)。

Cron `finalize-monthly-achievements-jst` は有効、`5 15 * * *`（毎日00:05 JST）。既存snapshotを再確定しない。今回、Cron commandやVault/Secret値は取得していない。

本番のsync v6 / finalize v2と共有youtube.tsはmainと内容一致。両Functionはverify_jwt=falseで、sync内でユーザー検証、finalize内で既存publishable key照合を行う。既存 `smart-action` はrepo外・今回対象外。

migration履歴は空だが画像テーブル/RPCは本番に存在する。履歴の空だけで未適用と判断しない。既存baseline SQLを無条件に再実行すると新しい移動RPCを旧定義に戻しうるため、通常更新では実行しない。

## 既存の注意点（今回は変更しない）

- Supabase security advisor: notification trigger関数のanon/authenticated実行権限、move RPCのauthenticated実行権限、漏洩パスワード保護無効の4 WARN。実行権限だけで即時悪用可能とは断定しない。別途権限/運用方針レビュー対象。[anon権限](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)、[authenticated権限](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)、[パスワード保護](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。
- Performance advisor: notifications RLSのauth.uid()再評価2 WARN、旧calendar FK未索引・未使用indexのINFO。[RLSの改善指針](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)、[FK索引](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)、[未使用索引](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)。測定せずindexを削除しない。
- optional query失敗時は既存トーストで警告するが、上部同期ラベルはRealtime接続状態で更新される。接続状態と個別データ取得状態の分離は別途検討。
- 広域CSSの重複、ファイル分割、手入力日時の全面統一、ネットワーク要求の物理abortは将来候補。今回の小変更に混ぜない。

検証コマンドと確認範囲は [検証記録](weekly-schedule-verification.md)、編集ルールは [CODING_GUIDE](CODING_GUIDE.md) を参照。
