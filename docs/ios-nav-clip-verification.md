# Ver23.39 モバイルnav・切り抜き0円 検証記録

## 状態と変更範囲

**報酬は実装・隔離検証済み。navは安全な下端配置を実装・自動検証済みだが、ユーザーの物理iPhoneにおける大きな浮き症状は未再現。根因特定・実機での完全解消を完了扱いにしない。** Draft PRで実機確認待ちとする。

開始main `36a48a73d527d5b9ef535ac83f24b876d85491fd`、23.38、直近MergeはPR #19。既存未Merge変更を混ぜず専用checkout/branch `agent/ios-bottom-nav-and-clip-reward-fix` を作成。全体設計/CODING_GUIDE/DOM/CSS override/scroll lock/報酬共通関数/テストを調査した。

対象は依頼のA(nav)・B(切り抜き0円)のみ。Auth/Realtime/YouTube同期/modal lifecycle/body lock/週間予定/タグ定義/manifest本体/Supabase構成は変更しない。本番操作はゼロ。

## A. 確定事項と仮説

ユーザー報告は、iPhone PWAで週間投稿スケジュールを表示・スクロールすると4ナビが画面途中へ浮きカードに重なる症状。報告内のスクリーンショット2枚の実ファイルと端末OS情報は今回提供されていない。

ソースで確定したこと：

- mobileNavはbody直下。祖先transform/filter/perspective/contain等によるfixed containing block化はない。
- 位置指定は1箇所でbottom=12px＋safe-area、後段overrideはgrid/gap/padding。常に外側余白が生じる。後段padding:7pxがsafe-area paddingを消す可能性もあるため、基準と後段を同時に修正した。
- body/app-shellの100vhはmin-height、navはvh依存ではない。100dvhは既存dialog用。全面的なvh/dvh変更はしない。
- body fixed/top=-scrollYは既存modal lock。closeでclass/topを消去し元位置へ戻す。残留top・重複イベント・smooth scrollの不具合はbaselineでも再現しないため変更しない。
- baselineのWebKit/Chromiumではnav高さ60px、外側gap12pxで一定。上/中/下・4画面・modal復帰で大きな浮きは未再現。最後の曜日カードもbaselineでは読み切れる。

WebKitにはkeyboard終了後offsetTop残留やfixed上下ずれの報告があるが、本件と同じ原因とは断定できない。[WebKit bug297779](https://bugs.webkit.org/show_bug.cgi?id=297779)、[VisualViewportの仕様と補正の注意](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)。JSのdevice-fixed補正はflickerリスクがあり、実機証拠なしに追加しない。

## A. 最小CSS修正

- position:fixed、4列、44px以上のタップ領域、既存の色/カプセル/PC側配置を維持。
- bottom:0にして、safe-areaは重要内容を守る内側paddingへ一度だけ適用。padding-bottom=max(7px,safe-area-bottom)。[WebKitのsafe-area設計指針](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)に沿う。
- 左右はmax(12px,safe-area-left/right)で横向きの切欠きを保護。
- nav外寸の基準は44px(button)+7px(top)+safe-bottom+2px(border)。navのmin-heightとmain末尾paddingを同一CSS tokenから算出。本文末尾はnav外寸＋16pxだけ確保し、旧120px＋safe-areaの別基準を廃止。
- 後段padding shorthandも同じtokenへ変更し、後勝ちでsafe-areaを消さない。固定heightは使わない。nav非表示、sticky化、負のbottom、translate、scrollTo補正、常駐タイマー、body transformは追加していない。

旧CSSで新しい下端条件を検証すると `initial: visible bottom gap 12` で失敗。これは外側gapの再現であり、物理iPhoneの大きな浮きの再現ではない。

## B. 報酬のSource of truthと保護

getVideoRewardに切り抜き最優先0円を追加。切り抜き0 → race0 → news100 → Shorts100 → 横1000 → fallback0。getMonthlyPostStatsの投稿/月/type/tag集計は変更しない。未投稿は既存の入口で除外。

calculateMonthlyRewardにclipVideoCountを追加し、clip集合をrace区分から除外。clip+race+newsでも報酬区分はclipに1本だけ。newsは既存どおり100円のShorts欄へ統合し、独立news行を追加しない。月別一覧/選択月合計/未払い残高は既存共通関数を使い、新たな単価ハードコードを増やさない。

必須A〜Gは7本、Shorts5本/横2本、clip3本/race1本、100円対象2本/1000円対象1本、合計1200円。clip0円でも投稿本数と独立タグ本数には含める。

報酬画面にclip0円行と説明を追加。過去月も新ルールでLIVE表示額が変わる一方、当時の実支払確定額ではないと明記。is_paid/paid_at、保存タグ/type/投稿日、確定snapshotを移行・更新・推測backfillしない。

## 自動検証

開始時の既存270件を再実行し成功。追加25件で合計**295件成功・失敗0**（CJS native174、独立static/画像22、既存DB93、新規DB6）。node --test CJSのrunner表示は画像scriptを1fileと数え175となる。テスト削除なし。旧切り抜き単価を固定したschedule-tagsの期待値だけ正式新仕様へ更新。

- clip-reward.test.cjs 19：優先順位、必須7本1200、複数0円タグ、通常タグ、空月/未投稿、複数月未払い/paid、過去snapshot不変、UI一覧/内訳/合計、reload/Realtime相当。
- clip-reward.database.test.mjs 6：実saveVideo→fresh Postgres読込、追加/編集/タグ解除、実delete/restore、views-only更新、支払済みrow/paid_at/snapshot/歴史動画の不変。すべて隔離PGlite。旧mainでは100≠0の赤を確認してから実装。
- mobile-nav.browser.mjs：Chromium、WebKit、WebKit touch/mobile viewport emulation。390×844 / 430×932 / 768×1024 / 1280×900 / 844×390。各engine/mode116回のgeometry checkpoint、可視下端との差1px以内、4ボタンhit-test/active、水平overflowなし、最終曜日カードがnav上に完全表示。
- navの上/中/下/高速往復、4ページ、8modal(動画追加/編集/詳細、企画追加/編集/詳細、子詳細、実績目標)、modal中の合成復帰、先頭表示/背景位置復帰、lock/top解除を確認。PCはnav非表示/side nav、背景クリックで閉じない/Escape終了。
- 復帰イベント後は既存250ms debounceとappResumeInFlight終了を待って計測。viewport resizeとsafe-bottom=34px代入は合成試験であり、実OSKやネイティブsafe-areaの検証ではない。
- 4幅の実報酬modalで7本/1200円/clip3/race1を確認。長いclip名と金額に重なり/横はみ出しなし。正常console error/warning0。
- 既存two-views/delete browser10チェック、product-integrity browserの4幅/回復/過去lock/警告を回帰実行。既知optional取得失敗だけ期待したwarning1。
- JS syntax、manifest/資産version、DOM ID/関数重複、CSS brace、Secret pattern scan、git diff --checkを確認。JSイベント追加なし、既存once-only/single-subscription試験維持。

再実行例（Node24、既存ローカル依存の絶対pathをenv指定）：

```powershell
node --check app.js
node --test tests/*.test.cjs
node tests/idea-images.test.cjs
node tests/idea-images.database.test.mjs
node tests/monthly-notifications.database.test.mjs
node tests/video-tags.database.test.mjs
node tests/security-policy.database.test.mjs
node --test tests/clip-reward.database.test.mjs
$env:QA_ENGINE='chromium'
node tests/mobile-nav.browser.mjs
$env:QA_ENGINE='webkit'
node tests/mobile-nav.browser.mjs
$env:QA_MOBILE='1'
node tests/mobile-nav.browser.mjs
# 既存browserはtests/browser-server.mjsをloopbackで起動して実行
node tests/two-views.browser.mjs
node tests/product-integrity.browser.mjs
git diff --check
```

## 変更ファイル・運用

app.js、index.html、style.css、docs/ARCHITECTURE.md、本文書、tests/clip-reward.test.cjs、tests/clip-reward.database.test.mjs、tests/mobile-nav.browser.mjs、tests/schedule-tags.test.cjs。既存untracked debug.logは対象外・削除しない。

23.38→23.39（APP_VERSION/HTML/JS・CSS・manifest queryを同期）。manifest本体・依存・framework・Service Worker変更なし。

DB/migration/RLS/Storage/Edge/Cron/Secret/Auth設定変更は全てなし。本番Supabaseを試験呼出ししない。SQL実行不要、Edge Function再Deploy不要。Mergeはユーザー判断、こちらでは行わない。

Merge後はPagesの23.39反映を確認しPWA完全終了→再起動。実機で以下を必須確認：iOS版/端末/standaloneを記録し、ホーム週間予定の上→中→下→高速往復、4ナビtap、各modal開閉、keyboard開閉、横向き、PWAバックグラウンド復帰。navが途中へ残らず最後のカードが読めるか確認。再発時はスクリーンショットとnav BCR/visualViewport.height/offsetTop/innerHeight/scrollYの実測を取得し、そこで初めて追加補正の要否を判断する。

未確認：物理iPhone/PWA、Safariネイティブchrome伸縮、rubber-band、実OSK、実機の非ゼロsafe-area、報告症状の根本原因・完全解消。本番Auth/YouTube/Realtime実通信も今回は触れていない。報酬の旧実支払確定額を復元したわけではなく、LIVE再計算の履歴リスクは既存設計のまま。以上を未確認/残存リスクとしてDraft PRに明示する。
