# Ver23.36 機能撤去の検証

基準main：e8d6a564d70f06e749192ef7965b28e706e59722、23.35、merged PR #16。専用ブランチで作業し、他の未マージ差分は含めない。

## 調査分類と変更範囲

| 分類 | 調査対象・対応 |
| --- | --- |
| runtime | app.jsの専用質問30件、state3件、DOM参照9件、context生成、描画、送信・再試行・世代判定、logoutリセット、イベント4件を削除 |
| HTML | ホームの入口と専用dialog一式を削除。共有dialog、label、ARIAは検証 |
| CSS | 専用10selectorだけ削除。共有ボタン・form・modalルールは維持 |
| backend | 専用関数のindexを削除。同期・月末確定・共有YouTubeソースはmainと同一 |
| test | 専用Edge試験3件をファイルごと削除。混在next-uxの専用試験2件のみ削除、共用回帰を維持。撤去・ARIA検査2件を追加 |
| docs | 専用仕様書を削除、architecture/導入手順から現行案内を除去。一般securityとcoding guideは維持 |
| historical verification | 23.34/23.35の混在検証記録は保持し、削除済みソースへのリンク・コマンド・利用案内を除去。過去件数は当時の結果で、今回の件数ではない |

## 本番・安全性

Supabase project jyxrrnfnypqaecfojsle の関数一覧を読み取り確認。対象の専用関数は未Deploy。既存smart-action/sync v6/finalize v2を変更・削除・再Deployしていない。Secret一覧は利用可能な接続に取得機能がなく未確認。Secret追加・削除・変更は行わない。

DB/migration/RLS/Storage/Cron変更なし。本番書き込みなし。既存8タグ・legacy・tag_question/tag_clip・週間予定・報酬・保存・Auth・Realtimeは変更なし。

## 実行結果：136件PASS、失敗0

```sh
node --check app.js
node --check tests/browser-server.mjs
node --test tests/app-lifecycle.test.cjs tests/app-regression.test.cjs tests/edge-functions.test.cjs tests/video-view.test.cjs tests/next-ux.test.cjs tests/schedule-tags.test.cjs tests/product-removal.test.cjs
node tests/idea-images.test.cjs
node tests/idea-images.database.test.mjs
node tests/monthly-notifications.database.test.mjs
node tests/video-tags.database.test.mjs
git diff --check
```

Node61＋画像/静的22＋画像DB35＋月次通知15＋タグ保存DB3。隔離Postgresの既存PGLITE_MODULEを指定。専用5試験の撤去と新2試験追加により139→136。HTML重複ID/DOM参照/label/ARIA、duplicate functions、CSS brace、manifest parse、Secret patternを検査。

最終repo検索で指定された6識別子、renderer/context名、質問属性は0件（Git履歴を除く）。撤去検査の検索語は分割リテラルとして定義し、禁止文字列そのものを残さず再出現を検出する。

## UI

localhostの隔離DB/Auth fixtureで390×844、430×932、768×1024、1280×900をスクリーンショット・DOM測定。投稿ペース→今月の数字→週間予定の順序を維持。投稿ペース直後のgapは既存16px、入口由来の余白なし。全幅でdocument horizontal overflowなし、専用DOMなし、下ナビ4項目のまま。console error/warning 0。

物理iPhone/PWA・実touch、本番Auth/YouTube通信は今回未確認。ローカルfixtureを本番成功とは扱わない。今回の変更にSQL/既存Edge再Deployは不要。前版の月末確定関数再Deployが未完了の場合は従来手順を維持する。
