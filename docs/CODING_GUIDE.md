# 変更時の最小ルール

1. 最新mainと本番スキーマを読む。未マージブランチや古いSQLだけで構造を推測しない。
2. 不具合は再現テストを先に追加。成功ケースも残し、修正・回帰・差分確認の順に進める。
3. 描画は状態から生成し、保存/取得を混ぜない。月集計・タグ・報酬・日付は既存共通関数を再利用する。Dashboardの過去月はLIVE video値、実績の過去月は確定snapshotであり混同しない。
4. 固定週間予定は `WEEKLY_UPLOAD_SCHEDULE` だけを編集する。今日hero＋残り6日を元の曜日順で描画し、DB目標/動画タグと混同しない。
5. 非同期処理はセッション世代とsingle-flightを守る。logout後の応答が状態を戻さないことを検証する。onAuthStateChangeのcallback内でSupabase APIをawaitしない。
6. 画像は「既存−明示削除＋追加」。空FileListを削除と解釈しない。既存pathを再アップロード/上書きしない。
7. 過去月snapshot/目標ロック・支払いフラグ・DB内部ステータスを保存形式ごと維持する。新規migrationは必要時のみ。既存baseline SQLの再実行を通常更新手順にしない。
8. `ACTIVE_VIDEO_TAGS` から外れた「ネット競艇」はlegacy preserved tag。UIから非表示でも、既存動画の編集保存、既存goal、snapshotのDB値から削除しない。
9. UIは390/430/768/1280pxで確認。入力16px、safe-area、4ナビ、dialogスクロールとEscape、長文・画像比率を保つ。
10. 新CSSは部品固有のclassへ限定。古いoverride層を「見た目が同じはず」でまとめない。
11. HTMLのapp-versionとJSのAPP_VERSION、3資産のquery versionを一緒に更新。Service Workerや依存/ビルド導入は別の変更として判断する。
12. DB・Storageの破壊的テストはローカル隔離Postgresだけ。本番でのテスト投稿/支払い変更は禁止。Secret値をログ・テストfixture・commitへ入れない。
13. `tests/browser-server.mjs` はテスト専用。loopback/CSP制限を維持し、デプロイや実認証用途に使わない。実機未確認を「iPhoneで確認済み」と記載しない。
14. 動画カード/一覧の違いは描画だけ。`activeVideoViewMode` と `activeVideoFilter` を独立させ、同じ配列・並び順・既存イベント委譲を使う。表示切替に取得/保存/再購読を追加しない（端末内表示設定の保存を除く）。
