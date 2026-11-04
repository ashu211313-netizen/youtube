# Ver23.40 下部ナビと動画タグ絞り込み

## 開始条件と変更範囲

最新mainは `411519fe718f77f462f4de3ecb750b2f23478f09`（23.39、最終Merge PR #20）。開始時のopen PRは0。`agent/mobile-nav-and-video-tag-multifilter` をこのmainから作成。既存295件（CJS native174、独立static/画像22、隔離DB99）を基準にした。開始時からあった未追跡 `debug.log` は対象外。

今回の2機能のみを変更し、23.40に更新。APP_VERSION、HTML meta、JS/CSS/manifest参照versionは同期し、manifest本体は変更しない。

## A. 白いカプセルとsafe-areaを分離

23.39は `max(7px, safe-area-inset-bottom)` を**白いナビ自身の下padding**へ設定していた。44pxのボタン、上padding7px、上下border計2pxに、下padding34pxが加わると白背景も87pxに伸びる。box-sizingとmin-heightを含め実寸で確認し、同じinsetの二重加算ではないと判明。CSSの後段padding指定も同じboxに掛かっていた。旧mainのHTML/CSSを固定し、外部通信を遮断したChromiumとWebKitで測定した。

| CSS px | 23.39 inset 0 | 23.40 inset 0 | 23.39 inset 34 | 23.40 inset 34 |
| --- | ---: | ---: | ---: | ---: |
| 白カプセル高 | 60 | 60 | 87 | 60 |
| ボタン高 | 44 | 44 | 44 | 44 |
| 白カプセルの上余白（border込み） | 8 | 8 | 8 | 8 |
| 白カプセルの下余白（border込み） | 8 | 8 | 35 | 8 |
| 透明なシステム保護帯 | 0 | 0 | 0 | 34 |
| 固定領域全高 | 60 | 60 | 87 | 94 |
| 本文末尾padding | 76 | 76 | 103 | 110 |
| 固定コンテナと可視領域の下端差 | 0 | 0 | 0 | 0 |

白背景・枠・丸み・ぼかし・影は `.mobile-nav::before` で描き、4つのボタンは従来どおり固定コンテナ直下のグリッドに置く。ラッパー追加は新旧HTML/CSS混在で縦積みやタップ不能を再現したため採用しない。`#mobileNav` は `position:fixed;bottom:0` を維持し、透明の下paddingに `env(safe-area-inset-bottom, 0px)` を一度だけ適用する。左右は既存のsafe-area指定を維持。透明帯はpointer hitを奪わない。本文末尾paddingはカプセル高＋保護帯＋16px。34px相当では白い領域が27px減り、対称な下余白を確保する分だけ固定領域全高が7px増える。[WebKitのsafe-area設計指針](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)を参照。

DOM祖先によるfixed containing block化、body lock解除後のtop残留、旧PRの大きな浮きは合成環境では確認されていない。modal open/close、スクロール復帰、ページ切替、vh/dvh、Viewportメタは維持。JS補正・タイマー・スクロール時の再描画を追加しない。PCのサイドナビには変更なし。

WebKitタッチの初回ロードで `.main` の継承高さトークンが取得できず、23.39でも下paddingが0pxになる場合を再現。単なる描画待ちでは解消しなかったため、本文paddingを個別指定し、共有トークンがないときは同じ60px＋safe-area＋16pxをCSSで算出する。統合試験でも34px相当を有効にして最終行・復帰位置を測定した。

## B. 動画タグフィルター

動画管理に「タグで絞り込む」、選択チェック付きチップ、「すべて解除」、「表示中 N件」を追加。`ACTIVE_VIDEO_TAGS` の既存順（選手解説、用語解説、競艇場解説、疑問解決系、横動画の切り抜き、レース映像、横動画、競艇ニュース）からボタンを一度だけ生成し、`aria-pressed` と表示を更新する。色だけに依存せず、キーボードで選択してもフォーカスを失わない。

- `getVisibleVideos()` が `statusMatches && tagMatches` を一回の絞り込みで実行。タグ同士はOR。カード／超簡素と詳細の前後移動は同じ順序の動画を使用。重複表示なし。
- 初期はタグ未選択。再押下でそのタグのみ解除、「すべて解除」は投稿ステータスを変えない。ステータス件数は従来どおり全保存済み動画を数える。登録がある条件不一致は専用の空状態。
- ページ切替・表示切替・動画追加編集削除復元・同期/Realtime再取得で条件を保持して再判定。reload、logout、別アカウントではタグ選択を初期化。localStorage追加なし。
- Legacyの「ネット競艇」は選択肢に出さず、保存値は維持。タグ未選択ならlegacyのみ・タグなしも通常表示。フィルター操作でfetch/保存せず、月別投稿・実績・報酬・過去snapshotの集計元は従来の全データのまま。

## テストの再実行

結果：既存295件＋新規タグVM11件＝**306件成功、失敗0**（CJSランナー186表示は独立画像スクリプトを1件と数える）。DOM参照・重複ID・版整合・CSS構文・イベント重複・Secretパターン・差分を確認。テスト削除なし。下記のブラウザ検証はこの306件とは別枠。

- nav：Chromium、WebKit、WebKitタッチ相当で各120地点。390×844／430×932／768×1024／1280×900／横向き844×390、上中下・往復・8種類のdialog・合成復帰・focus/blur・viewport resize、safe-area 0/34px。各モバイル4タブと本文末尾が可視、PCのサイドナビとEscapeも維持。viewport resize後は寸法反映と描画を待って測定した。旧新HTML/JSと旧新CSSの混在は別の読み取り専用試験で16条件成功。
- 統合：Chromium／WebKit各4幅、計8構成・32レイアウト計測。モバイル幅はタッチ＋safe-area 34px相当。8タグと長い名称、複数OR、ステータスAND、解除、件数、ARIAとキーボード、順序一致、最終動画と固定nav、画面往復、modal復帰を確認。操作だけではAPI通信0。隔離DBで追加・編集・削除・復元、Realtime再取得経路の再判定と選択保持を確認。
- 既存browser：2表示／削除回帰10チェック、4幅の警告・過去月・パスワード回復が成功。通常console error/warning 0。意図的な部分取得エラー試験だけ既知warning 1件。

Node 24と既存ローカル依存 `PGLITE_MODULE`、`PLAYWRIGHT_MODULE`、`PLAYWRIGHT_BROWSERS_PATH` を使用。ブラウザ試験はループバックの隔離fixtureのみ。別のブラウザ試験と8766を同時に使用しない。

```powershell
node --check app.js
node --test tests/*.test.cjs
node tests/idea-images.test.cjs
node tests/idea-images.database.test.mjs
node tests/monthly-notifications.database.test.mjs
node tests/video-tags.database.test.mjs
node tests/security-policy.database.test.mjs
node tests/clip-reward.database.test.mjs
node tests/video-tag-filter.browser.mjs
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

## リリース境界

変更8ファイル：`app.js`、`index.html`、`style.css`、`docs/ARCHITECTURE.md`、この検証記録、`tests/mobile-nav.browser.mjs`、`tests/video-tag-filter.test.cjs`、`tests/video-tag-filter.browser.mjs`。

DB/schema・migration・RLS・Storage・Edge・Cron・Secret・Auth設定に変更なし。本番データ操作なし。SQL実行・Edge再Deploy不要。Mergeはこの作業では行わない。

Merge後はGitHub Pagesの23.40反映を確認してPWAを完全終了・再起動し、実機で白いカプセル、ホームインジケーター、最後の動画までのスクロール、4タブ、タグ選択、modal/キーボード/回転/復帰を確認する。**物理iPhone、実OSキーボード、Safari chrome伸縮、standalone固有挙動、rubber-bandは自動試験の検証対象外。** 合成viewport/34pxと実機safe-areaを同一視しない。
