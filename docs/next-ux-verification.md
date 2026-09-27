# Ver23.34 検証記録

基準main：`ac961006cdddfb2f4ff3ad00c13d5139eea6a16d`（23.33）。終了前に再fetchし同一SHAを確認。専用branch `agent/next-ux-analytics-ai`。既存未merge作業は含めない。

## モーダルの再現と修正

基準版の10枚画像企画を末尾までスクロールして閉じ、再度開くと `scrollTop=2635.333` が残った。native `showModal()` は以前のdialog自身のscroll offsetを保持し、既存のpreventScroll focusだけではresetされなかった。

管理関数でnative focus前に背景位置を捕捉し、先頭closeにpreventScrollでfocusした後、実scroll ownerであるdialogを0へ戻す。固定timeoutは使わない。9種類すべてのopen/close listenerを共有し、AIのcloseも背景ロック解除対象にする。resume時の編集中scroll復帰は変えない。

実ブラウザ：10枚企画、動画追加（336→0）、企画内10枚（3268.667→0）、AI展開後（1193.333→0）の再表示を確認。動画詳細/前後移動、目標編集、通知、ゴミ箱、投稿実績も先頭から開く。多段dialogも確認。390pxの背景1470.667pxはclose後1470.667pxに復帰し、lock/aria-hiddenを解除。9種類全部はNodeの共通管理回帰テストでも実行。

## 表示・計算

- card/compact既存markup回帰を維持。minimalは390/768pxで約57.33px/行。compact画像OFFはimgなし・空白画像列なし。設定は別キーで端末保存。
- 前後移動は表示フィルタ済み配列、境界停止。touchは64px以上、横が縦の2倍以上、1.2秒以内、単指のみ。フォーム/ボタン/リンク・縦scroll・cancelを無視。実ブラウザの次ボタンとNodeのtouch handlerを確認。物理iPhoneの指操作は未確認。
- 不備は正式投稿日、YouTube URL/ID、同期timestamp/既知統計で判定。views=0は既知、NULLは未取得。
- 当月JST期待本数=`目標×経過日/月日数`、許容幅=`max(1本,期待本数×10%)`。達成優先。必要平均=`max(目標−実績,0)/(月日数−今日の日+1)`。今日を含み、目標なしを0扱いしない。
- 前月比=`(当月−前月)/前月×100`。前月0は絶対差、NULL/未保存は比較なし。過去最高は保存snapshot＋現在月の既知値が2か月以上、同率含む、未来/NULL除外。snapshotは書き換えない。
- AIは未設定エラーを返す接続口まで。[実装境界と残作業](channel-ai.md)。実回答は検証・完成していない。

## 実行した自動テスト（130件PASS）

```sh
node --check app.js
node --check tests/browser-server.mjs
node --test tests/app-lifecycle.test.cjs tests/app-regression.test.cjs tests/edge-functions.test.cjs tests/video-view.test.cjs tests/next-ux.test.cjs tests/channel-ai-edge.test.cjs
node tests/idea-images.test.cjs
node tests/idea-images.database.test.mjs
node tests/monthly-notifications.database.test.mjs
git diff --check
```

Node tests 58、画像・静的22、PGlite画像/RLS/Storage35、月次/通知15。DBテストは `PGLITE_MODULE` にインストール済みPGliteモジュールを指定する。本番DBには書き込まない。TypeScript strip APIのNode ExperimentalWarningはテスト実行環境の警告で、ブラウザconsoleではない。

既存テストは削除しない。六指標の旧HTML比較だけは今回明示された変更（存在しない前月の100%を「比較データなし」、現在月の未取得ラベル）を期待値に反映し、それ以外は全文一致を維持。新たな増減率/0/NULL/履歴比較テストを追加。Auth single-flight/世代棄却、PWA resume storm、Realtime一購読、複数画像append/競合/rollback、支払済み不変、過去月ロック、通知除外と重複防止を確認。

## 実ブラウザ（localhost専用fixture）

390 / 430 / 768 / 1280pxでフォームの先頭・横overflowなし・入力16pxを測定。390pxのホーム/超簡素/AI、430px実績、768px超簡素/画像OFF、1280px AI/企画/報酬を目視。長いタイトル、9桁再生数、複数タグ、10枚画像を利用。PC AIのもっと見るの横ずれを修正し、入力欄と同じleft260/width760pxを確認。過去月選択で編集ボタン0個、報酬はShorts/横動画/レース映像の3行。ブラウザconsole error/warningは0。

全機能×全幅の網羅的実機試験ではない。物理iPhone/PWA、実タッチ、実ネットワークのAuth/YouTube/provider回答、販売品質の負荷試験は未確認。ブラウザのDB/Auth/通信はローカルfixtureであり、本番成功と扱わない。

## インフラ・差分境界

SQL/migration/RLS/Cron/Storage/Secret変更なし。YouTube同期と月末確定の既存Edgeコードは変更なし。新規channel-assistantは追加のみ、本番Deployなし。新規AI以外の保存処理・報酬・画像・通知処理を改修しない。アプリ/HTML/asset queryは23.34に揃える。
