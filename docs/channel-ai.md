# チャンネルAI：23.34の実装境界

## 現在できること／できないこと

ホームから4ナビを変えず全画面dialogを開く。30質問の最初8個、もっと見る、編集可能な質問、送信中表示、失敗時の入力・会話保持と再試行を実装。会話はメモリのみ、logoutで消去。

**実回答は未実装。** リポジトリに既存provider設定は見つからず、稼働中3関数の一覧と既存smart-actionの内容を読み取り確認したが、LLMではなかった。Supabase Secretの全一覧は今回の接続機能では未確認。新しいproviderを勝手に契約・選択せず、`channel-assistant` はAuth検証と入力検証後に503 `AI_NOT_CONFIGURED`を返す。ダミー回答や分析結果は作らない。本番Deployは行っていない。

## データ境界

`buildChannelAiContext` は現在読み込まれているデータから生成する。JST当月、取得日時、最終YouTube同期、6主要指標・目標・activeタグ集計・投稿ペース・共通週間予定を含む。全体件数と再生数取得済み件数も伝える。

- 動画最大24件：質問関連タグ6件・最近8件・再生上位5件・投稿待ち/不備5件を重複排除。title160文字、memo200文字。
- 企画12件、企画内アイデア12件。title160文字、note200文字。
- 過去snapshot最大12か月。未保存月やNULLを0に補完しない。
- context最大60,000 UTF-8 bytes、request最大75,000 bytes。履歴直近6発言、各2,000文字に制限。質問最大1,500文字。
- URL・画像URL・支払い情報・メール・キーは文脈に含めない。ただし利用者がタイトル/メモに書いた内容はデータそのものとして含まれるため、実provider接続前に利用先を明示する。
- 現在累計しかないため「最近伸び始めた」「停止原因」「増加速度」は断定できない旨を明示。抜粋であることも明示する。

## 接続口と安全性

新規 `supabase/functions/channel-assistant/index.ts`。POST/OPTIONS、CORS、Bearerの`auth.getUser`検証、公開キー使用、service_role不使用。80KBストリーム上限、質問・context配列・履歴role制限。DB/RPC/Storageへの書き込みもLLM呼び出しもない。

クライアントは35秒で待機解除、single-flight、セッション世代照合、HTML escape。タイムアウトは呼び出し自体の中止保証ではない。実provider接続時にはサーバー側abort/timeout・レート・コスト上限も必要。未設定の現状は課金呼び出しを行わない。

## 実回答を有効にするための残作業

1. 所有者がprovider・モデル・利用予算/制限を決定する。キーの実値をチャットやGitへ貼らない。
2. その公式APIに合わせadapterを実装する。固定system指示と利用者のtitle/memoを分離し、文脈中の命令を実行しない。DB更新toolは提供しない。数値根拠、不足時の回答、費用制限・レート制限・中止・timeoutをテストする。
3. Supabase Secretを安全に設定し、CLI/APIで新規関数をDeploy。認証失敗、provider障害、実データ回答、prompt injection、入力保持を本番相当で確認する。
4. フロントの常時「provider未設定」表示を接続状態に合わせ変更する。

SQL/RLS/Cron/Storageの追加はこの接続口には不要。既存YouTube同期・月末確定関数の再Deployも不要。
