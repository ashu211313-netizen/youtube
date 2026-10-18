# 実装履歴・報酬履歴の監査（2026-10-19）

## 範囲と証拠

開始mainは `10415d928018ae6445e3cac35b429ca30a671994`、Ver23.37。GitHubのPR metadataとmainのfirst-parent履歴で、PR #1〜#18がすべてMerge済みであることを照合した。PR本文は当時の報告であり、本番適用済みの証拠としては扱わない。

本番 `jyxrrnfnypqaecfojsle` への支払い監査は `information_schema.columns` の読み取りのみ。支払い行・動画行への書き込み、金額の確定保存、フラグ変更、backfill、DDLは行っていない。この文書は設計監査であり、報酬計算・支払い仕様を変更するものではない。

## PR #1〜#18の採用・廃止・再変更

| PR | 導入・修正した内容 | 現行仕様との関係 |
| --- | --- | --- |
| [#1](https://github.com/ashu211313-netizen/youtube/pull/1) | 詳細エラー、manifest、モバイル、通知、YouTube同期、24時間再生数を整備 | 基盤修正は維持。5ナビと24時間再生数は後続で廃止 |
| [#2](https://github.com/ashu211313-netizen/youtube/pull/2) | 最新の成功同期判定、24時間値の誤保存防止、部分失敗 | 成功同期判定は維持。24時間専用ポリシーは#3で撤去 |
| [#3](https://github.com/ashu211313-netizen/youtube/pull/3) | 固定6タグ、4ナビ、投稿日順、レース映像0円、進捗UI。旧目標タブ・24時間機能を撤去 | 4ナビ・投稿日順・廃止方針は維持。タグ数と実績指標は後続で更新。旧DB値は削除しない |
| [#4](https://github.com/ashu211313-netizen/youtube/pull/4) | 実績6指標、月間・タグ目標、目標基準バー。簡単な成績分析を撤去 | 実績内の月別目標として維持。旧目標タブの復活ではない |
| [#5](https://github.com/ashu211313-netizen/youtube/pull/5) | 月別目標・実績選択、ホーム目標、最近投稿した動画の撤去 | 月別選択・最近投稿の撤去は維持。ホーム目標は#6で撤去 |
| [#6](https://github.com/ashu211313-netizen/youtube/pull/6) | 月末snapshot、過去月ロック、月末確定関数、ホームYouTube更新 | 維持。過去月実績は不変snapshot、現在月はLIVE。ホーム月間目標は撤去済み |
| [#7](https://github.com/ashu211313-netizen/youtube/pull/7) | 競艇ニュース100円、投稿待ち表記、PCモーダル改善、動画別目標UI | 報酬・表記・モーダルは維持。誤解に基づく動画別目標の追加変更は#8で撤回 |
| [#8](https://github.com/ashu211313-netizen/youtube/pull/8) | 選択月の有効目標があるタグだけ表示、ニュース100円をShorts欄へ統合 | 維持。実績0本でも目標ありなら表示。報酬は1動画1回 |
| [#9](https://github.com/ashu211313-netizen/youtube/pull/9) | JWT/Auth復旧、PWA再開、single-flight、core/optional取得分離 | 基盤として維持。パスワード再設定とは別の認証復旧処理 |
| [#10](https://github.com/ashu211313-netizen/youtube/pull/10) | 画像全体のcontain表示、企画内アイデア詳細の画像表示 | 維持。後続の複数画像にも表示方針を継承 |
| [#11](https://github.com/ashu211313-netizen/youtube/pull/11) | 最大10枚、既存−明示削除＋追加の原子的保存、画像参照保護 | 維持。旧image_urlも互換保持。単なるFileList複数選択ではなく永続保存を修正 |
| [#12](https://github.com/ashu211313-netizen/youtube/pull/12) | 週間予定と旧基本ルール、セッション世代・タイマー競合対策 | 世代ガードと週間予定は維持。旧基本ルールは#13で撤去 |
| [#13](https://github.com/ashu211313-netizen/youtube/pull/13) | 今日hero＋残り6日、Dashboard月別LIVE、ネット競艇の選択肢除外 | 維持。旧ネット競艇の動画値・tag_online・snapshotは保存。Dashboard過去月LIVEと実績snapshotは別物 |
| [#14](https://github.com/ashu211313-netizen/youtube/pull/14) | カード／compact切替と端末保存 | カードと表示設定の仕組みは維持。compactは#18で正式撤去 |
| [#15](https://github.com/ashu211313-netizen/youtube/pull/15) | 超簡素、詳細前後移動・swipe、投稿ペース、比較、不備警告、AI接続口 | 超簡素・移動等は維持。不備警告は開始mainでは詳細のみ。AIは#17で撤去、compactと一覧サムネ切替は#18で撤去 |
| [#16](https://github.com/ashu211313-netizen/youtube/pull/16) | 指定順8タグ、週間内容、新目標キーtag_question/tag_clip、将来snapshot対応 | 維持。ソースのMergeと本番finalizerのDeployは別途照合が必要 |
| [#17](https://github.com/ashu211313-netizen/youtube/pull/17) | AI専用UI・JS・CSS・Edge・test・docsを完全撤去 | 維持。接続口や有料AIを復活させない |
| [#18](https://github.com/ashu211313-netizen/youtube/pull/18) | カード／超簡素の2表示、旧設定fallback、削除の終了保証・結果不明時の再送防止 | 開始mainの仕様。compact・サムネON/OFFを復活させない |

旧仕様を含むPR本文のSQL実行手順を、現在の本番へ無条件に再適用しない。特に旧baseline SQLと現在の画像RPCは同一世代とは限らない。

## 報酬・支払いの現在の構造

本番schemaで確認した `public.monthly_payments` の全カラム：

| カラム | 型 | NULL | default |
| --- | --- | --- | --- |
| month_key | text | 不可 | なし |
| is_paid | boolean | 不可 | false |
| paid_at | timestamp with time zone | 可 | なし |
| updated_at | timestamp with time zone | 不可 | now() |

確定金額・計算内訳・計算ルール版・支払いイベント履歴は保存されていない。

開始mainの処理経路：

- `getPostedVideos()`：取得済みの非削除動画から、投稿済みかつ投稿日がある動画を対象にする。
- `getMonthlyPostStats()`：YouTube公開日時優先、未取得なら手入力投稿日で月に分ける。
- `getVideoReward()`：レース映像0円 → 競艇ニュース100円 → Shorts100円 → 横動画1,000円。動画タイプとタグ「横動画」「横動画の切り抜き」は別概念。
- `calculateMonthlyReward()`：ニュースを含む100円対象をShorts欄へ一度だけ加算する。
- `calculateOutstandingBalance()`：現在の算出額のうち、月単位の支払済みフラグがfalseの月だけ合算する。
- `renderPostStats()` / `renderPostStatsMonthlyList()`：支払済み月も現在の動画から報酬を再計算して表示する。
- `setMonthlyPaymentStatus()`：月・フラグ・paid_at・updated_atだけupsertする。true操作ではpaid_atを現在時刻に、false操作ではNULLにする。過去の支払いイベントは残らない。
- `mapMonthlyPayment()`：画面状態にはmonthKey/isPaidだけを保持し、paid_atは表示状態へ取り込まない。

`monthly_achievement_snapshots` は実績指標・タグ本数・目標の不変履歴であって、実際の支払金額や請求内訳の証拠ではない。報酬画面はこのsnapshotを金額根拠に使っていない。

## 再現：支払済みフラグと表示額は独立

開始mainを `tests/fixtures/app-harness.cjs` の `ref: 'origin/main'` で実行した隔離VMの結果。実DB・本番データは使っていない。

初期条件は、2026年8月10日投稿の横動画1本、タグなし、8月の支払済みフラグtrue。各行は前行からの変更結果。

| 操作 | 8月表示額 | 9月表示額 | 未払合計 | 8月フラグ |
| --- | ---: | ---: | ---: | --- |
| 初期状態 | 1,000円 | 0円 | 0円 | 支払済み |
| レース映像タグを追加 | 0円 | 0円 | 0円 | 支払済みのまま |
| タグを外し、投稿日を9月へ変更 | 0円 | 1,000円 | 1,000円 | 支払済みのまま |
| 対象動画をactiveデータから外す | 0円 | 0円 | 0円 | 支払済みのまま |

最後の行はゴミ箱移動後のactive配列と同じ集計入力を模擬したもので、本番の削除操作を実施したという意味ではない。削除・復元の永続化自体は既存の削除回帰テストの対象。

この再現が証明するのは「現在のデータから算出した額」と「当時実際に支払った額」が一致する保証がないこと。支払いが実際に二重実行された、または本番で金銭被害が起きたことは証明していない。

コード上、動画type/tag変更、投稿日変更、初回YouTube同期での正式投稿日取得、削除／復元、過去月動画の追加でも対象月・対象本数・算出額が変わり得る。将来ルール変更の影響もLIVE再計算へ及ぶ。これらの設計リスクを、既存報酬式の不具合として勝手に修正しない。

## 将来案の比較（仕様判断待ち）

| 案 | 利点 | 制約 |
| --- | --- | --- |
| 現行LIVE見積額＋表示上の説明 | 最小変更。既存操作やDBを変えない | 実支払額は保存されず、過去額の固定にはならない |
| monthly_paymentsにnullable確定額・確定日時を追加 | 少ない追加で将来の確定値を分離できる | 部分支払い・取り消し・再支払い・訂正履歴を1行で扱う設計が難しい |
| 追記型の支払いイベント台帳＋不変の確定内訳 | LIVE見積／確定請求／実支払／訂正を区別できる | 新しい運用・権限・トランザクション・表示設計が必要 |

推奨する検討方向は追記型台帳。ただしこれは承認済み仕様ではなく、今回の実装対象ではない。

### 非破壊migration案の条件

実行SQLはこの監査では追加しない。正式判断後の案は、次の条件で作成する。

1. 新テーブルまたはnullableカラムの追加だけから開始。既存の支払いフラグ・日時・金額推定値を更新しない。
2. 履歴がない既存支払済み月の実支払額はNULL／不明のまま。現在動画からの推測backfillや0円defaultをしない。
3. 将来の明示的な確定時だけ、対象月・確定額・日時・計算ルール版・必要な内訳を保存する。動画が後で編集されても確定内訳を上書きしない。
4. 実支払いは別イベントとして記録。訂正・取り消しも原記録の削除ではなく追記で表す。通貨と整数単位を明示する。
5. 月の確定と実支払いを同一操作とするか、部分支払いを許可するか、操作権限を誰に与えるかを先に決める。
6. 既存共有チャンネルの権限方針を保ち、RLS／RPC内ガード／二重要求防止／原子的保存／監査記録を隔離DBで検証する。
7. 新旧併存中は、LIVE見積額・不明な旧実支払額・保存済み確定額をUIで区別する。旧is_paidを自動的に新台帳へ変換しない。
8. 本番適用は承認後。rollbackは新機能を停止して旧表示へ戻す方法を優先し、作成済み支払記録を削除しない。

## 今回の変更禁止と未決事項

- 報酬優先順位、Shorts欄へのニュース統合、1動画1回の計算は変更しない。
- monthly_payments・過去動画・目標・snapshotを更新しない。実支払額の固定保存方式も今回勝手に導入しない。
- 未決：確定と支払いの関係、部分支払い、訂正権限、既存支払済み月の未知額の表示、将来台帳への移行境界。
- 未確認：過去に実際に支払われた金額と時点、金銭の外部記録との照合。本監査だけで確定できない。
- 本番finalizerのDeploy状況は別の運用監査で扱い、このPR履歴表の「Merge済み」から推定しない。

## 関連する技術負債

開始mainはapp.js 5,293行、style.css 3,256行。広域overrideと重複media層の整理・分割はP3候補であり、今回まとめて変更しない。手入力日のローカル時刻とJST/date-only集計の差、削除以外の要求のAbortSignal不足、安全な障害診断、Deploy済みソースとの継続照合はP2候補。状態管理・Auth・画像保存を壊さない小単位の再現テスト付き変更へ分ける。
