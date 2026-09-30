# Ver23.35 週間予定・8動画タグの検証

## 基準・影響範囲

最新main `8fc5c7b7ea573ddf982b381e2272d719ff826b12`、23.34、merged PR #15。新規branch `agent/schedule-and-video-tags-update`。静的HTML/CSS/JS、manifest、architecture/coding guide、全tests、SQL/Edgeを確認。

`ACTIVE_VIDEO_TAGS` はparse/choices/chips/月集計/Dashboard/実績/目標定義/snapshot mappingの共通基準。新タグは「疑問解決系」「横動画の切り抜き」。指定の8タグ順を維持。「ネット競艇」と未知の歴史タグは`getLegacyVideoTags`→hidden form値→`serializeVideoTags`で保持。動画のtypeとタグを混同しない。

週間予定は`WEEKLY_UPLOAD_SCHEDULE`だけを変更。毎日「昨日の競艇ニュース」、月「選手紹介」、火「用語解説」、水「競艇場解説」、木「疑問解決系」、金「切り抜き＋横動画（完成していれば）」、土日「切り抜き＋レース」。JST曜日、hero＋6compactの既存描画を変更しない。

## 実DBの読み取り確認（2026-10-01 JST）

project `jyxrrnfnypqaecfojsle` のinformation_schema/pg_constraintと既存tag goal keysを読み取り確認。videos.tags=TEXT、goals.goal_key=TEXT/target_value=INTEGER、snapshot.tag_counts/tag_targets=JSONB。goal_keyの固定列挙制約なし。既存キーtag_horizontal/player/terms/venue/race/news/onlineを確認。新キー`tag_question`/`tag_clip`はrepo内・既存goalキーとの衝突なし。既存汎用upsertを利用し、migration不要。本番へテストデータを書かない。

## 将来の月末確定

frontendだけ変更すると月末関数の固定一覧から新タグが落ちるため、`finalize-monthly-achievements`のVIDEO_TAGSとTAG_GOAL_KEYSだけを2件追加。ここはactive UIではなくsnapshot用の一覧であり、legacyネット競艇/tag_onlineも引き続き収録する。既存snapshotの先行存在チェック・不変性・Cron・同期・認証は変更なし。本番Deploy未実行。Merge後、この関数だけ共有youtube.tsを含むCLI/API再Deployが必要。AIとsync関数は変更なし。

## 自動検証：139件成功／失敗0

```sh
node --check app.js
node --check tests/browser-server.mjs
node --test tests/app-lifecycle.test.cjs tests/app-regression.test.cjs tests/edge-functions.test.cjs tests/video-view.test.cjs tests/next-ux.test.cjs tests/channel-ai-edge.test.cjs tests/schedule-tags.test.cjs
node tests/idea-images.test.cjs
node tests/idea-images.database.test.mjs
node tests/monthly-notifications.database.test.mjs
node tests/video-tags.database.test.mjs
git diff --check
```

Node64＋静的/画像22＋画像DB35＋月次/通知15＋新タグ永続保存DB3。PGliteテストにはインストール済みモジュールをPGLITE_MODULEで指定。Node TypeScript stripのExperimentalWarningは試験ランタイムの警告。

- 指定8件/順序、禁止名非表示、legacy/unknown保存、Dashboard新タグ2/3件・legacy5件も総数10へ算入。
- 実際のsaveVideo→ローカルPostgres→VM状態破棄→DB再取得→新2タグcheckedを確認。
- 実際のsaveAchievementGoals→Postgres→再取得→2/3目標保持。tag_onlineと過去goalの全行を保存前後で完全一致比較。
- 実績は正の目標があるactiveタグだけ、0本も表示。過去raw JSONとmapped snapshotは描画前後一致。
- 将来snapshotへ新タグ件数1/2、目標2/3、legacy件数1/目標4を記録。確定済みsnapshotはskipする既存試験を維持。
- 報酬は新タグ付きでもtypeに従う。race/news優先順位、支払済み不変を回帰確認。
- Auth/session/JWT/single-flight、PWA resume、Realtime一購読、3表示/画像設定/スワイプ/モーダル、複数画像append・rollback・RLS・通知・過去月ロックを既存試験で確認。

既存テスト削除なし。旧週間文字列とactive件数6の期待値だけ、新仕様へ更新した。追加試験は旧mainで新タグ未対応を検出した後、実装して成功を確認。

## UIと未確認事項

localhost fixtureで390×844、430×932、768×1024、1280×900を確認。8checkboxは全幅で1行（高さ19.2px）・overflowなし。週間金曜含む7カード、ホーム8タグも横overflowなし。390pxのホーム長タグ末尾1文字折返しを発見し、タグ名nowrap＋本数の行送りを部品限定CSSで修正。週間hero/compactのCSS変更なし。

既存動画編集でactive8選択肢・先頭表示、目標フォームの主要6＋タグ8＝14入力・新2キー・先頭表示を確認。ブラウザconsole error/warning 0。

本番への新タグ書き込み、本番Edge Deploy/将来月末の実実行、物理iPhone/PWA・実touchは未確認。ローカルPostgres保存とブラウザfixtureを本番確認とは扱わない。AI UI/provider/Secret/関数は変更・Deployしていない。
