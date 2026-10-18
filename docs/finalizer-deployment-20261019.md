# 月末確定関数 Deploy 記録

## 対象・承認範囲

Project `jyxrrnfnypqaecfojsle`、`finalize-monthly-achievements` だけ。ユーザーが条件付きで正式承認した後、全文比較・隔離テスト・v2復元ソース確保を行い、Supabase APIでDeployした。Dashboardへのindex.ts単体貼り付けではない。

使用main: `10415d928018ae6445e3cac35b429ca30a671994`。Deploy直前にもGitHubのmain SHAが同一であることを再確認。このPRの未Mergeコードは一切Deployしていない。

## 全文比較と結果

| 項目 | Deploy前 | Deploy後 |
|---|---|---|
| version | 2 | 3 |
| status | ACTIVE | ACTIVE |
| verify_jwt | false | false |
| entrypoint | finalize-monthly-achievements/index.ts | 同一相対パス |
| shared | _shared/youtube.ts | 同一相対パス、mainと一致 |
| import map | false | false |

v2からmainへの意味のある差分は4行だけ：VIDEO_TAGSに「疑問解決系」「横動画の切り抜き」、TAG_GOAL_KEYSにtag_question/tag_clipを追加。その他全文は改行と末尾空行を正規化して一致。sharedも同じ方法で全文一致。認証、publishable-key照合、JST集計、YouTube API、報酬、既存目標、既存タグに差分なし。

Deploy後、get_edge_functionで本番を**再取得**。本体とsharedの両方がmainと全文一致し、新2タグ・新2キーとメタデータを確認。list_edge_functionsでもv3 ACTIVE / verify_jwt=false。sync-youtube-videoはv6、smart-actionはv6のままで、どちらもDeployしていない。

SHA-256（LF化・trimEnd＋末尾LFで比較）：

- 本体v2: 7ad5e750a16ce80e3c59a53fa1131a394befaf1027976b5f4a727bdf664fd132
- 本体main/v3: 1ee9e7bedc8dcfd4e765243168c4a0ca06cb8b859e7224db2e4784cadb2d989c
- shared共通: 7e4fa50985fbee5278c904849a558676fc8ed5bbf501d6cf067251129974e0b3

## Deploy前テスト

tests/edge-functions.test.cjs 15件成功（既存7＋追加8）。JST 10/31 23:59:59→11/1 00:00、YouTube公開日時優先、年境界、開始月前、既存snapshot即skip、初回成功→再試行skip、並行23505、DB insert失敗→再試行、API通信失敗→再試行、動画欠落→再試行、動画更新失敗→再試行を隔離VMで確認。新2タグとtag_question/tag_clipの保存、legacy tag_online保持も確認。

既存の関数は動画統計更新とsnapshot INSERTが単一transactionではない。失敗時に統計だけ更新される可能性は既存仕様で、今回変更していない。snapshotが作成されなければ次のCronで再試行、作成済みなら最初の読取でskipする。過去snapshotへのUPDATE/DELETEはしない。

## 変更していないもの

本番関数をテスト目的で呼び出していない。本番動画・企画・支払い・実績・snapshotに書き込みなし。Auth/Redirect/DB schema/RLS/Storage/Cron/Secretの変更なし。既存の認証方式・verify_jwt=falseを維持。

Cronは読取のみ：finalize-monthly-achievements-jst、`5 15 * * *`、active=true（毎日00:05 JST）。10月分の最初の確定対象時刻は2026-11-01 00:05 JST。Secret/Vaultを含むcommand本文は取得・掲載していない。

## rollbackと未検証

v2本体・sharedの復元用ファイルはworkspace直下 `outputs/finalizer-rollback-v2/` に保存（git対象外）。必要になった場合だけ同じAPI・同じ2ファイル構成・verify_jwt=falseでこの関数を戻す。将来実行を戻すだけで、確定済みsnapshotを上書き・削除しない。v2では新2タグを次月以降保存しない点に注意。

配置確認は成功したが、本番の実際の月末実行、YouTube API quota/非公開・削除動画、実際のCron再試行は未検証。v3は15件の隔離テストと本番再取得で検証したもので、実月末成功を先取りして保証しない。次の通常Cron実行と11月1日の10月snapshotを、書き換えず読取で確認する。
