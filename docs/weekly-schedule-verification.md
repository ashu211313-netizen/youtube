# 23.31 検証記録

開始main: `d680bbaaf421918128a0b738ca5e79904e325a55`（23.30、PR #11マージ済み）。
branch: `agent/weekly-schedule-stability-cleanup`。監査日: 2026-08-29 JST。

## 修正と根拠

| 症状 / 原因 | 最小修正 / 確認 |
| --- | --- |
| 自動同期再起動時に初回timeoutが2個残る。stopが進行中ロックも解除する | timeoutを保持・解除し、ロックはrequest finallyに限定。2件→1件、停止後0件、重複requestなし |
| logout中にcore/optional取得が完了するとデータが復活。起動/復帰/購読も再開できる | session generationで古い結果を破棄。状態/dialogを通信待ち前にクリア。新しいsingle-flightを古いfinallyが解除しない |
| logout後のYouTube応答が新しいloadAllDataを開始 | 同じ世代ガードを同期完了にも適用。未認証loadを開始しない |
| snapshotのsubscriber_count=NULLをNumber(null)=0で「0人」にする | null/undefined/空文字は未取得のまま。0という実測値は0のまま |

上記の初期8ケースと追加YouTube完了1ケースは修正前に失敗を再現し、修正後成功。実績6指標は定義配列へ整理し、旧mainとの16組（現在/過去×取得有無×0/50/100/125）の生成HTML完全一致を確認した。

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

DBテストは従来と同じ外部テスト用PGlite 0.5.8が必要。インストール先の `dist/index.js` を `PGLITE_MODULE` に設定する（導入方法は複数画像docs参照）。本番への接続はしない。

最終集計: 105テスト成功、0失敗（既存22 + 画像DB35 + lifecycle16 + app13 + Edge6 + 月次/通知DB13）。JST7曜日/日付境界・報酬各ケース・画像各枚数など、各test内の複数assertionを追加件数として水増ししない。

静的テストはmanifest parse、HTML ID重複、JSの固定ID参照、関数名重複、CSS括弧、非破壊migration、version一致を含む。TypeScriptはNodeの型除去による構文/モック実行であり、Deno本番型検証ではない。Nodeの `stripTypeScriptTypes` ExperimentalWarningが1件出る（ブラウザ警告ではない）。Secretパターンと今回SQL/Function無変更も差分で確認する。

途中の失敗は上記red testのほか、テストfixtureのdateシリアライズ、goals/activity_logsカラム不足、SQLの予約語alias、ISO時刻比較期待値を補正したもの。実アプリ側に不要な変更は入れていない。

## ローカルブラウザ再現

```sh
node tests/browser-server.mjs
```

`http://127.0.0.1:8766/` を開く。Auth/YouTube/Realtimeはローカルmock、画像とCRUDはメモリPostgres。Storageはローカルobject map。CSPは外部APIへの接続を禁止。再起動すると全QAデータは初期化される。実アプリへこのサーバーを配信しない。

- `?qa=core-error`: 必須取得の失敗でもshellと週間予定7日・再試行UIが表示される。
- `?qa=optional-error`: 任意取得失敗でも取得済みcoreと週間予定を保持する。
- `?qa=version`: 版不一致時の再読み込みUI。
- `?qa=logged-out`: ローカルloginフォームから開始（fixtureなので実パスワードは使用しない）。

確認済み:

- 390×844 / 430×932 / 768×1024 / 1280×900: 全4画面と報酬modal、横はみ出し0、表示入力16px。週間予定の7枚目単独配置・今日badge・ルール開閉・PC4列/モバイル2列を確認。
- 動画追加→詳細→タイトル編集→保存。7タグと投稿日順、未取得日後方、投稿待ちフィルター。一括YouTube更新はモック応答で確認。
- 現在月目標編集・保存、0本のタグ表示、7月/8月切替、過去月編集UIなし。snapshot固定値/未取得値はVMと実SQLの不変triggerテスト。
- 報酬ニュース100円はShorts行、レース0円、横動画1000円。未払い→支払い済みで残金1100→0円、元の未払いへ復帰。7月の保存済みフラグは操作しない。
- 旧画像Aへ別編集でB→Cを追加。reload後もABC3画像・contain・読み込み成功。両親種別のA→AB→ABC→AC→ACDE、保持行ID、別ユーザーread、個別削除・移動・ロールバックは既存実Postgresテストを再実行。
- 動画/企画のゴミ箱・復元・明示完全削除はVMで対象ID/書込内容を検証。ブラウザから破壊的確定はしていない。
- PC背景クリックでmodal維持、Escape/×で終了、背景scroll lock解除。
- ローカルlogout→再login、旧goal通知遷移安全、通知既読badge0。通常ブラウザ操作のerror/warningは0件。故意の通信/版不一致シナリオでは期待された診断ログを別扱い。
- JWT期限切れ/未来iatの最大1回復旧、復帰イベントまとめ、hidden/offlineでAuth呼出なし、Realtime単一購読、logout中競合は制御したPromise/タイマーのVMテスト。
- SQLテストで通知の本人除外、YouTube統計除外、nested除外、月間目標除外、event_key重複抑止を検証。

## 未確認・本番変更なし

本番Authトークンの実更新、本番YouTube API呼出、本番書込/Storage upload・削除、実Realtime配信、物理iPhone/PWA再起動・写真選択・オフライン通信復帰は未確認。Pages管理画面はブラウザ未サインインのため公開元設定未確認。GitHub連携のコード/PR操作とは別の認証状態。

Supabaseスキルに従い本番はテーブル・RLS・RPC・publication・bucket・Function・Cronの読み取り監査のみ。SQL migration、RLS、Storage、Edge、Cron、Secretは無変更。新バージョンに伴うSQL実行・Edge再Deploy・Cron設定は不要。
