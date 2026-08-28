# 変更時の最小ルール

1. 最新mainと本番スキーマを読む。未マージブランチや古いSQLだけで構造を推測しない。
2. 不具合は再現テストを先に追加。成功ケースも残し、修正・回帰・差分確認の順に進める。
3. 描画は状態から生成し、保存/取得を混ぜない。月集計・タグ・報酬・日付は既存共通関数を再利用する。
4. 固定週間予定は `WEEKLY_UPLOAD_SCHEDULE` だけを編集する。DB目標/動画タグと別概念。9ルールを別のHTMLへ複製しない。
5. 非同期処理はセッション世代とsingle-flightを守る。logout後の応答が状態を戻さないことを検証する。onAuthStateChangeのcallback内でSupabase APIをawaitしない。
6. 画像は「既存−明示削除＋追加」。空FileListを削除と解釈しない。既存pathを再アップロード/上書きしない。
7. 過去月snapshot/目標ロック・支払いフラグ・DB内部ステータスを保存形式ごと維持する。新規migrationは必要時のみ。既存baseline SQLの再実行を通常更新手順にしない。
8. UIは390/430/768/1280pxで確認。入力16px、safe-area、4ナビ、dialogスクロールとEscape、長文・画像比率を保つ。
9. 新CSSは部品固有のclassへ限定。古いoverride層を「見た目が同じはず」でまとめない。
10. HTMLのapp-versionとJSのAPP_VERSION、3資産のquery versionを一緒に更新。Service Workerや依存/ビルド導入は別の変更として判断する。
11. DB・Storageの破壊的テストはローカル隔離Postgresだけ。本番でのテスト投稿/支払い変更は禁止。Secret値をログ・テストfixture・commitへ入れない。
12. `tests/browser-server.mjs` はテスト専用。loopback/CSP制限を維持し、デプロイや実認証用途に使わない。実機未確認を「iPhoneで確認済み」と記載しない。
