# Ver23.37 2表示・削除終了保証

## 基準と調査

main `3d5470c7ccccf6e315d9f9d850869e4db0885012`、23.36、merged PR #17。HTML/JS/CSS/manifest、architecture/coding guide、全tests、Supabaseフォルダを確認。動画一覧・詳細の削除、企画詳細、企画内アイデア一覧/詳細、ゴミ箱の物理削除を3関数へ追跡した。Auth/Realtime/single-flightは変更しない。
本番pg_policiesを読み取り確認し、videos/ideasの認証済みSELECT/UPDATE/DELETEとidea_itemsの認証済みALLが存在することを確認。mutation後のID返却にRLS変更は不要。本番への書き込みテストは行わない。

## 再現・確定原因

旧mainでpermanentDeleteItemのDB Promiseをreject、またはDB成功後のaddActivityLogをthrowさせると関数自体がrejectした。loading開始後に全体try/finallyがなく、末尾setLoading(false)へ到達しない。旧コード上の確定原因であり、実機で起きた個別リクエストの通信traceを取得したという意味ではない。

deleteItem/deleteIdeaItemはfinallyがあるが、DB/log/cleanup/reloadのPromiseがsettleしなければそこへ進めない。cleanupは通常のthrowを既存内部catchで抑えるが、Storage.removeのhangは解消しない。loadAllDataはRealtimeと同じsingle-flightへjoinするため、既存readが停止中なら削除側も待ち続ける。読み取り・Auth・購読を増やして直さない。

## 最小の削除専用lifecycle

- DB返却IDを確認してからsuccess側へ進む。0件・DB/JWT errorは成功扱いせずmodalを維持。
- 実リクエストへAbortSignalを渡し30秒でabort。Promise.raceも終了させ、fetchがsettleしない場合もUIを解放。server側完了の可能性があるためtimeout/transport failureは「結果未確認」、同じitemへの再送なし。Supabaseがtransport障害をerrorオブジェクトで返す場合も検出。
- 画像cleanup/log/reloadはそれぞれ10秒まで待機。遅延Promiseにもreject handlerがありunhandled rejectionなし。DB確定済みなら「削除済み、ただし後処理未完了」と分離する。
- ローカル反映はDB成功後のみ。既存の画像参照保護/RLS/cleanup queueを維持。再取得成功後も対象を除去し、mutation前に開始していたshared readからの復活を防ぐ。
- 項目単位ロックで異なるボタンからの二重削除を防ぐ。結果不明のロックはページ再読込まで保持。確定処理中の復元も競合させない。
- 対象と一致する詳細だけ閉じる。セッション世代が変わった後はUI/dataを更新しない。元ボタンがdetachedでもfinallyは安全。共通setLoadingは変更なし。
- soft deleteはdeleted_at UPDATE、ゴミ箱だけ物理DELETE、企画内アイデアは従来どおり物理DELETE。

AbortSignalの公式仕様：[Supabase JavaScript](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal)。Changelog indexは今回web取得がcontent-type非対応だったが、接続の公式docs検索でAPIを確認した。

## 2表示

カードと超簡素だけ。compact renderer/HTML/CSS/分岐とサムネイル設定を削除。共有status CSSをvideo-row-status、minimalのリスト間隔をvideo-list--minimalへ改名し、宣言値は不変。カードHTMLは最新mainと全文一致、minimalはclass名だけ正規化すれば全文一致。旧compact/unknown/nullはcard、minimal/cardはfresh instanceとreloadで維持。旧thumbnail値は読まない・消すためのmigrationも追加しない。週間/ホームのcompact classは別部品なので維持。

## 自動検証

Node131＋静的/画像22＋画像DB35＋月次通知DB15＋タグ保存DB3＝206件成功。削除専用68件を含む。旧表示専用の期待値は正式な2表示へ更新し、既存7試験を削除せず維持、新表示検査2件追加。

```sh
node --check app.js
node --check tests/browser-server.mjs
node --check tests/two-views.browser.mjs
node --test tests/app-lifecycle.test.cjs tests/app-regression.test.cjs tests/edge-functions.test.cjs tests/video-view.test.cjs tests/next-ux.test.cjs tests/schedule-tags.test.cjs tests/product-removal.test.cjs tests/delete-lifecycle.test.cjs
node tests/idea-images.test.cjs
node tests/idea-images.database.test.mjs
node tests/monthly-notifications.database.test.mjs
node tests/video-tags.database.test.mjs
git diff --check
```

PGLITE_MODULEは隔離DB依存の既存パスを指定。DB error/rejection/0件/offline/never-settling、cleanup/log/reloadの個別throw/hang、実Storage error/rejection/hangとqueue保持、重複要求1回、late response、logout、復元競合、detachedボタンを確認。既存画像append、past lock/snapshot、報酬、通知、Auth/JWT/PWA resume/Realtime一購読を回帰。SQL/Edgeコードとmainの差分なし。

## ローカル実ブラウザ

`node tests/browser-server.mjs`をloopbackで起動後、既存PlaywrightをPLAYWRIGHT_MODULEで指定し`node tests/two-views.browser.mjs`を実行。ユーザーのブラウザとは別のheadless Chromiumで、外部通信を拒否。10チェック成功。

390×844/430×932/768×1024/1280×900で両表示・reload・横overflowなし。minimal行58px、status入力16px/44pxを確認。スクリーンショットを出力し目視確認。詳細DB失敗でmodal保持・元文言/disabled復帰、動画soft deleteのreload後永続性、ゴミ箱物理削除、企画詳細・子詳細の削除を隔離Postgresと確認。console error/warning 0。

## 未確認・導入

本番の実削除、本番Auth/YouTube通信、物理iPhone/PWA・実touch、長時間負荷は未確認。fixture結果を本番成功とは扱わない。DB/migration/RLS/Storage schema/Cron/Secret/Edge変更・Deployなし。Merge後はPages反映とreload/PWA再起動だけ。前版23.35の未実施Deployがあれば、その既存手順は維持。
