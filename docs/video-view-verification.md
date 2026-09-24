# 動画カード／一覧表示（23.33）

## 範囲

開始main: `033bbdc5fb9e4cd724c0ec8b71862aff61bcfead`（23.32）。表示密度と端末内設定だけの変更。カードHTML、動画配列・取得・フィルタ・投稿日順・保存・報酬・Auth・Realtime・YouTube同期処理は維持。SQL、RLS、Storage、Edge Functions、Cron、Secret、依存、Service Workerの変更なし。

`activeVideoViewMode` が `card` / `compact` を管理する。初期値はカード、localStorageキーは `boat-manager-video-view`。不正値/読み取り失敗はカード、書き込み失敗時もそのセッション中の切替は継続。フィルタとは独立し、表示切替で通信・並べ替え・追加購読を行わない。一覧の詳細/ステータス/画像エラーは既存イベント委譲へ接続。タグは先頭1個と残数を表示し、全タグは詳細で確認できる。

## 実行した自動検証（2026-09-24）

Nodeで以下を実行。DBテストは `PGLITE_MODULE` に既存のPGlite runtimeを指定した隔離インメモリDBで、本番通信なし。

```text
node --check app.js
node --check tests/browser-server.mjs
node tests/idea-images.test.cjs                                      # 22 PASS
node --test tests/app-lifecycle.test.cjs tests/app-regression.test.cjs tests/edge-functions.test.cjs tests/video-view.test.cjs
                                                                   # 44 PASS
node tests/idea-images.database.test.mjs                             # 35 PASS
node tests/monthly-notifications.database.test.mjs                   # 15 PASS
git diff --check
```

計116件。新規7件はカードHTMLのmainとの完全一致、10動画の全3フィルタでID/順序一致、保存/再起動/不正値/保存不能、更新再描画、エスケープ/未取得/legacy除外、状態変更と空表示、resume・Realtimeまとめ更新・YouTube成功後のmode/filter保持。既存109件はAuth競合、画像複数保存/失敗時保護、RLS/Storage、過去月ロック、報酬、通知、投稿日順、Edge構文/認証等。NodeのTypeScript型除去APIのExperimentalWarningのみ（失敗ではない）。

## ブラウザ検証

`tests/browser-server.mjs` のloopback環境で実施。実supabase-js/YouTube API/Realtimeサービスではなくローカルfixture。

| viewport | カード | 一覧 |
| --- | --- | --- |
| 390×844 | 既存デザイン維持 | 行高約88〜105px、同画面内の動画数増加 |
| 430×932 | 既存デザイン維持 | 行高約88〜105px |
| 768×1024 | 既存横組み維持 | 横組みcompact |
| 1280×900 | 既存横組み維持 | 行高約97〜117px、サイドナビ維持 |

両モード8画面のスクリーンショットを目視確認。横overflowなし、100字超タイトルは一覧のみ2行省略、123,456,789回、6タグ+legacy、サムネイル未取得、ステータスselect16px/44px、下ナビとのスクロール領域を確認。

実操作: reload後の一覧復元、ページ移動後保持、3往復切替で通信履歴27→27、投稿待ち→投稿済み保存とフィルタからの除外（詳細が同時に開かない）、行click/Enter/Spaceで既存詳細、Escape、詳細からメモ編集保存、YouTube一括更新12,500→13,000後の保持、企画詳細10画像、過去月の閲覧専用/目標編集なし。ブラウザconsole error/warnは0。

## 未確認・反映後

物理iPhone/Safari/PWA終了再起動、本番Auth・YouTube API・複数端末Realtimeは今回未実施。resume/Realtimeは自動テスト、再読込/再描画はローカルブラウザで確認。本番データは変更していない。

Mergeと既存公開先への反映後に再読み込み（PWAは完全終了→再起動）。SQL実行不要、Edge Function再Deploy不要、Cron/RLS/Storage/Secret設定不要。
