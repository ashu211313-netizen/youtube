# 23.32 検証記録

開始main: `3d88bfe762af440d83379ebb9f1e81405982646c`（23.31、PR #12マージ済み）。
branch: `agent/dashboard-monthly-schedule-tag-cleanup`。監査日: 2026-09-14 JST。

## 修正と境界

| 対象 | 23.32の仕様 / 確認 |
| --- | --- |
| 週間投稿スケジュール | 今日を横長hero、そのほか6日をcompactに分離。PCは6列、768/430/390pxは3列×2段。JSTの全曜日と23:59→00:00をテスト |
| 基本ルール | `<details>`、DOM参照、設定値、描画処理、専用CSSを完全削除 |
| Dashboard月切替 | 投稿日の最古月から現在月までを連続表示し、未来月は除外。選択月は再描画、YouTube更新、Realtime更新でも保持 |
| Dashboard LIVE値 | 選択月に公開された動画を、現在の `views / likes / comments` で再集計。過去月のYouTube更新も最新値へ反映 |
| 実績 | 過去月は引き続き `monthly_achievement_snapshots` の確定値を表示し、DashboardのLIVE値と混在させない |
| ネット競艇 | active UIから除外。既存videoタグ、`goals.tag_online`、snapshot JSONは削除・上書きせず保持 |

動画月は `youtube_published_at` をJSTに変換した月を優先し、未取得時だけ `post_date` を使う。Dashboardのゼロ投稿月は0表示し、タグ集計も同じ選択月へ追従する。報酬ルール、支払い済みデータ、月末確定処理は変更していない。

## コマンド

Node v24.19.0。新しいアプリ依存・ビルド工程はない。

```sh
node --check app.js
node --check tests/browser-server.mjs
node tests/idea-images.test.cjs
node --test tests/app-lifecycle.test.cjs tests/app-regression.test.cjs tests/edge-functions.test.cjs
node tests/idea-images.database.test.mjs
node tests/monthly-notifications.database.test.mjs
git diff --check
```

DBテストは従来と同じ外部テスト用PGlite 0.5.8を使い、`dist/index.js` を `PGLITE_MODULE` に設定する。本番への書き込みはしない。

最終集計: 109テスト成功、0失敗（既存画像22 + 画像DB35 + lifecycle16 + app15 + Edge6 + 月次/通知DB15）。JST全曜日・日付境界、Dashboard LIVEとsnapshot分離、legacyタグ保持、報酬、複数画像など、各test内の複数assertionを件数として水増ししない。

静的テストはmanifest parse、HTML ID重複、JSの固定ID参照、関数名重複、CSS括弧、非破壊migration、version一致を含む。TypeScriptはNodeの型除去による構文/モック実行であり、Deno本番型検証ではない。Nodeの `stripTypeScriptTypes` ExperimentalWarningが1件出る（ブラウザ警告ではない）。SecretパターンとSQL/Function無変更も差分で確認する。

## ローカルブラウザ再現

```sh
node tests/browser-server.mjs
```

`http://127.0.0.1:8766/` を開く。Auth/YouTube/Realtimeはローカルmock、画像とCRUDはメモリPostgres、Storageはローカルobject map。CSPは外部APIへの接続を禁止する。再起動するとQAデータは初期化される。

確認済み:

- 390×844 / 430×932 / 768×1024 / 1280×900: 全4画面で横はみ出し・文字切れ0、表示入力16px以上。今日hero 1枚 + compact 6枚、モバイル/タブレット3列×2段、PC6列を確認。
- Dashboardで過去月を選びYouTube更新後、選択月を維持しながら再生3,000→3,500、高評価30→35、コメント4→5へ更新。同月の確定実績は3,000/30のまま。
- 旧「ネット競艇」は動画追加/編集候補、カード/詳細chip、Dashboardタグ、実績タグ、目標編集から非表示。旧タグ付き動画のタイトル編集payloadは `選手解説, ネット競艇` を維持。
- 現在月/過去月の見出し、ゼロ月の0表示、active 6タグ、投稿日順、報酬、過去月ロック、Escape終了、下部4ナビ/PCサイドナビを確認。
- 通常操作後のブラウザconsole error/warningは0件。
- 両親種別の画像A→AB→ABC→AC、既存URL保持、順序、削除、競合ロールバックは実Postgres相当テストを再実行。

## 本番読み取り監査と未確認事項

Supabaseスキルに従い、本番はテーブル/RLS/Functionの読み取り監査だけを実施した。`videos` のネット競艇5件、`goals.tag_online` 2件、snapshot内legacy値1件を確認し、変更前後で件数不変を確認する。SQL migration、RLS、Storage、Edge Function、Cron、Secretは無変更。

本番Authトークン更新、本番YouTube API呼出、本番書込/Storage upload・削除、実Realtime配信、物理iPhone/PWA再起動・写真選択・オフライン復帰は未確認。23.32に伴うSQL実行、Edge Function再Deploy、Cron設定は不要。
