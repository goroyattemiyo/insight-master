# Insight Master 製品仕様書 (v2.4.0)
最終更新: 2026-03-15

## 1. 製品概要

**Insight Master** は、Threads（Meta社のテキストSNS）の運用を数値ベースで改善するためのWebアプリケーションです。Google Apps Script（GAS）上で動作し、Googleスプレッドシートをデータストアとして使用します。ユーザーは自身のGoogleアカウントにコピーするだけで利用開始できます。

### 1.1 ターゲットユーザー
- Threadsを個人で運用しているクリエイター・副業層
- 感覚ではなくデータで投稿改善したい人
- SNSマーケティング担当者（小規模チーム）

### 1.2 提供価値
- 投稿パフォーマンスの自動収集・可視化
- AIによる投稿生成・改善提案
- 競合分析・トレンド把握
- 運用コスト: サーバー費用ゼロ（GAS + スプレッドシート）

### 1.3 動作環境
- **バックエンド**: Google Apps Script (V8ランタイム)
- **フロントエンド**: HTML/CSS/JavaScript（GAS HtmlService、SPA風構成）
- **データストア**: Google スプレッドシート
- **外部API**: Threads API v1.0, Gemini API (generativelanguage.googleapis.com)
- **対応ブラウザ**: Chrome, Safari, Edge（最新版）
- **対応デバイス**: PC, スマートフォン（レスポンシブ対応）

---

## 2. 機能一覧

### 2.1 ダッシュボード
- **ユーザーインサイト表示**: 過去7日間のビュー数、フォロワー数、いいね、返信、リポスト、引用、リンククリック
- **投稿パフォーマンスサマリー**: 投稿数、平均ER、総ビュー、総いいね、総リポスト、総シェア
- **フォロワー推移グラフ**: Canvas描画、7/30/90日切替、CSV/画像エクスポート
- **フォロワー属性**: 国、都市、年齢、性別の分布グラフ
- **自動更新**: 6時間以上経過で自動データ取得
- **AI分析ボタン**: 分析レポート生成、改善提案生成（Gemini API連携）

### 2.2 Growth Score（リテンション機能）
- **総合スコア**: 0-100点（フォロワー変動/ER傾向/投稿頻度/AI活用の4指標、各25点満点）
- **リングアニメーション**: スコアに応じた色変化（critical/low/medium/high）
- **カウントアップアニメーション**: スコア表示時
- **前週比表示**: ↑/↓/±0の変動表示

### 2.3 デイリーチェックイン
- **ログインストリーク**: 連続アクセス日数の表示
- **おすすめ投稿時間**: 時間帯分析データに基づくAI推奨
- **おすすめテーマ**: Gemini AIによるテーマ提案
- **今日のひとこと**: AIによるモチベーションメッセージ

### 2.4 目標管理
- **目標タイプ**: フォロワー増加、投稿数、ER目標の3種類
- **進捗バー**: アニメーション付きプログレスバー
- **達成アニメーション**: コンフェティ（紙吹雪）演出
- **目標の追加/削除**: モーダルUI

### 2.5 投稿分析
- **投稿一覧**: ER順ソート、期間フィルタ（7日/30日/全期間）
- **指標表示**: ビュー、いいね、返信、リポスト、ER
- **遅延ローディング**: 20件ずつ表示（もっと見るボタン）
- **CSVエクスポート**: 全投稿データの出力
- **Threadsリンク**: 各投稿からThreadsアプリへの直接遷移

### 2.6 時間帯分析
- **ヒートマップ**: 曜日×24時間のER平均値（色分け表示）
- **ゴールデンタイム検出**: 最も反応が良い時間帯の特定
- **アカウント別管理**: マルチアカウント対応

### 2.7 バズパターン分析
- **統計比較**: ER上位投稿と下位投稿の構造的違い
- **分析項目**: 平均文字数、平均ER、最適投稿時間/曜日、メディア添付率、質問形式率、フック長、ハッシュタグ率
- **AIレポート**: Gemini APIによる成功パターン・改善アクション・テーマ提案の自動生成
- **期間選択**: 30/60/90日

### 2.8 AI投稿生成
- **通常モード**: テーマを入力して1-5パターン生成
- **スレッドモード**: 親投稿+返信2-3件のツリー構成で生成
- **分析ベースモード**: 過去の高ER投稿パターンを参考に生成
- **7種切り口セレクタ**: ツール紹介/ハウツー/失敗例/比較/事例/初心者向け/自動選択
- **JSONパース+フォールバック**: AI応答のパース失敗時もテキストとして返却

### 2.9 AI投稿リファイン
- **7つのスタイル**: improve/shorter/longer/casual/professional/engaging/hook
- **3バリエーション生成**: 各スタイルで3パターンの書き直し
- **追加指示対応**: フリーテキストで細かい調整指示可能

### 2.10 競合ウォッチ
- **Grounding検索**: Gemini AIがGoogle検索経由で競合情報を調査
- **手動記録**: 競合の投稿テキスト・いいね・返信・リポスト・メディア・タグを記録
- **一覧表示**: 競合アカウント管理、記録投稿の閲覧
- **AI分析**: スタイル分析、自分との比較分析、バズパターン分析

### 2.11 キーワード検索
- **Threads API検索**: キーワードでThreads投稿を検索
- **検索履歴**: 過去の検索キーワードと結果件数の記録
- **AIトレンド分析**: 検索結果をAIで分析

### 2.12 下書き管理
- **保存/編集/削除**: AI生成結果を下書きとして保存
- **ステータス管理**: 下書き/投稿済みの切替
- **コピー機能**: ワンタップでクリップボードにコピー

### 2.13 週次レポート
- **自動生成**: フォロワー増減、総ビュー、平均ER、投稿数、トップ投稿
- **AIサマリー**: Gemini APIによる週次分析コメント
- **メール送信**: 毎週月曜8時に自動送信（トリガー設定）
- **過去レポート閲覧**: 直近8週分の履歴

### 2.14 マルチアカウント
- **アカウント切替**: 複数のThreadsアカウントを管理
- **アカウント別データ**: 分析データ・時間帯分析がアカウント単位で分離
- **外部シートインポート**: 別スプレッドシートから認証情報をインポート
- **トークン期限警告**: 5日以内に期限切れのトークンを警告

### 2.15 デモモード
- **サンプルデータ**: 設定不要で全機能を体験可能
- **デモ終了**: セットアップ画面への遷移

### 2.16 設定
- **Threads API設定**: App ID, App Secret, OAuth認証フロー
- **Gemini API設定**: APIキー入力
- **アカウント管理**: 追加/削除/切替
- **トリガー設定**: フォロワー自動記録、週次レポート自動生成

---

## 3. セキュリティ要件

### 3.1 認証情報の保護
- **セキュアキー**: ccess_token, pp_secret, gemini_api_key の3項目は PropertiesService.getScriptProperties() に保存
- **スプレッドシート非保存**: セキュアキーはシートに平文保存しない（マイグレーション済み）
- **自動マイグレーション**: 旧バージョンからのアップデート時、シートに残った秘密情報を自動でPropertiesServiceに移行し、シートからは削除

### 3.2 セッション管理
- **セッショントークン**: CacheService.getUserCache() でUUIDベースのトークンを生成（有効期限1時間）
- **リクエスト検証**: doPost の全APIリクエストでセッショントークンを検証
- **クライアント設定**: uildClientSettings_() でフロントに渡す設定からはセキュアキーを除外し、hasAccessToken/hasAppSecret/hasGeminiKey のboolean フラグのみ送信

### 3.3 OAuth認証
- **Threads OAuth 2.0**: 認可コード → 短期トークン → 長期トークンの3ステップ
- **State パラメータ**: CSRF対策としてシートID + UUID の複合stateを使用
- **リダイレクトURI**: GASデプロイURLを自動検出

### 3.4 API通信
- **HTTPS強制**: Threads API, Gemini API ともにHTTPSのみ
- **レート制限対策**: etchJsonWithRetry_() でHTTP 429時に45秒待機してリトライ
- **バッチ処理**: インサイト取得は5件ずつバッチ処理、バッチ間1秒ウェイト

### 3.5 入力バリデーション
- **App ID**: 10-20桁の数字のみ
- **App Secret**: 20-40文字の16進数のみ
- **HTMLエスケープ**: scapeHtml() で全ユーザー入力をサニタイズ

---

## 4. データスキーマ

### 4.1 スプレッドシート構成
| シート名 | 用途 | 主要カラム |
|----------|------|------------|
| 設定 | アプリ設定（Key-Value形式） | key, value |
| アカウント | Threadsアカウント情報 | account_id, access_token, user_id, username, profile_pic_url, token_expires, created_at |
| 分析データ | 投稿パフォーマンス | post_id, account_id, text, media_type, timestamp, views, likes, replies, reposts, quotes, shares, engagement_rate, permalink, is_quote_post, topic_tag, fetched_at |
| 時間帯分析 | 曜日×時間帯ER | account_id, 曜日, 0-23(時間帯別ER) |
| ユーザーインサイト | アカウント概要メトリクス | account_id, date, views, likes, replies, reposts, quotes, clicks, followers_count, fetched_at |
| 下書き | AI生成/手動の下書き | draft_id, account_id, text, type, created_at, status, source |
| 競合アカウント | 競合管理 | competitor_id, account_id, username, display_name, category, followers_count, followers_updated, memo, created_at |
| 競合ウォッチ | 競合投稿記録 | watch_id, account_id, competitor_username, post_url, post_text, media_type, likes, replies, reposts, post_date, tags, memo, created_at |
| キーワード検索 | 検索結果 | account_id, keyword, search_mode, search_type, post_id, username, text, media_type, permalink, timestamp, has_replies, is_quote_post, is_reply, fetched_at |
| 検索履歴 | 検索ログ | account_id, keyword, search_mode, result_count, searched_at |
| フォロワー推移 | 日次フォロワー数 | date, followers_count, follows_count, daily_change, weekly_change_pct, account_id |
| 成長スコア | Growth Score履歴 | (Retention.jsで管理) |
| チェックイン | 日次チェックイン | (Retention.jsで管理) |
| 目標 | 目標管理 | (Retention.jsで管理) |
| AI生成ログ | AI投稿生成の履歴 | timestamp, account_id, theme, mode, text, reason, expectedER, bestTime, mediaAdvice, analysisUsed |

### 4.2 PropertiesService（セキュアストレージ）
| キー | 用途 |
|------|------|
| access_token | Threads API長期アクセストークン |
| app_secret | Threads App Secret |
| gemini_api_key | Gemini API Key |

---

## 5. ファイル構成

### 5.1 バックエンド (Google Apps Script .js)
| ファイル | 行数 | 役割 |
|----------|------|------|
| Code.js | 312 | エントリーポイント、doGet/doPost、APIルーター |
| Sheets.js | 300 | シート初期化、設定読み書き、PropertiesService管理 |
| Auth.js | 140 | OAuth認証（認可URL生成、トークン交換、プロフィール取得） |
| Accounts.js | 311 | マルチアカウント管理 |
| Analytics.js | 407 | 投稿分析データ取得・集計、時間帯分析 |
| BuzzAnalysis.js | 187 | バズパターン分析、AIレポート生成 |
| Gemini.js | 206 | Gemini API共通呼び出し、投稿生成、リファイン |
| GeminiAnalysis.js | 360 | AI分析レポート、改善提案生成 |
| GeminiPostAnalysis.js | 139 | 分析ベース投稿生成 |
| CompetitorWatch.js | 404 | 競合ウォッチ（検索・記録・分析） |
| KeywordSearch.js | 504 | キーワード検索、検索履歴 |
| Drafts.js | 252 | 下書き管理 |
| Followers.js | 145 | フォロワー推移記録、トリガー管理 |
| Insights.js | 120 | ユーザーインサイト取得 |
| Retention.js | 497 | Growth Score、チェックイン、目標管理、メール通知 |
| WeeklyReport.js | 170 | 週次レポート生成 |
| PostGenerator.js | 257 | 投稿生成ヘルパー |
| Utils.js | 36 | fetchJson_, fetchJsonWithRetry_, normalizeUrl_ |
| TestRunner.js | 161 | テストフレームワーク |
| Tests.js | 286 | テストケース（16関数、59アサーション） |

### 5.2 フロントエンド (HTML/CSS/JS)
| ファイル | 行数 | 役割 |
|----------|------|------|
| index.html | 145 | メインテンプレート、スプラッシュ画面、include構成 |
| styles.html | 632 | ベースCSS + コンポーネントCSS |
| styles_retention.html | 217 | Retention機能CSS（アクセシビリティ含む） |
| app_core.html | 523 | Appオブジェクト定義、API通信、画面遷移、共通UI |
| app_ui.html | 623 | スケルトン、Tips、Markdown変換、エクスポート |
| app_init.html | 3 | アプリ初期化（endSplash呼び出し） |
| screen_dashboard.html | 371 | ダッシュボード描画 + データ読み込み |
| screen_dashboard_charts.html | 346 | フォロワーチャート + 週次レポートUI |
| screen_dashboard_retention.html | 321 | Growth Score + チェックイン + 目標UI |
| screen_analytics.html | 784 | 分析ハブ（投稿分析/時間帯/競合） |
| screen_generate.html | 400 | AI投稿生成UI |
| screen_keywords.html | 492 | キーワード検索UI |
| screen_drafts.html | 524 | 下書き管理UI |
| screen_settings.html | 404 | 設定・認証UI |

### 5.3 設定ファイル
| ファイル | 役割 |
|----------|------|
| appsscript.json | GASマニフェスト |
| .clasp.json | clasp設定（scriptId, rootDir） |
| .claspignore | clasp push除外ファイル |

---

## 6. 外部API仕様

### 6.1 Threads API
- **ベースURL**: https://graph.threads.net/v1.0
- **認証URL**: https://threads.net/oauth/authorize
- **トークンURL**: https://graph.threads.net/oauth/access_token
- **スコープ**: threads_basic, threads_manage_insights, threads_profile_discovery, threads_keyword_search
- **主要エンドポイント**:
  - /{user_id}/threads — 投稿一覧取得
  - /{post_id}/insights — 投稿インサイト取得（views, likes, replies, reposts, quotes, shares）
  - /{user_id}/threads_insights — ユーザーインサイト取得
  - /me — プロフィール取得

### 6.2 Gemini API
- **エンドポイント**: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
- **認証**: APIキー（URLパラメータ）
- **用途**: 投稿生成、分析レポート、改善提案、競合分析、キーワードトレンド分析、チェックインメッセージ
- **レート制限対応**: HTTP 429で45秒リトライ

---

## 7. 計算式・アルゴリズム

### 7.1 エンゲージメント率（ER）
ER = (likes + replies + reposts + quotes) / views × 100

- views = 0 の場合は ER = 0
- shares は ER 計算に含めない（現行仕様）
- 小数第2位まで（Math.round × 10000 / 100）

### 7.2 Growth Score（0-100）
4項目の合計、各0-25点：
- **フォロワー変動**: -2%→0点, +5%→25点（線形補間）
- **ER傾向**: -2ppt→0点, +2ppt→25点（線形補間）
- **投稿頻度**: 0件/週→0点, 7件/週→25点（線形、7超はキャップ）
- **AI活用**: 0回/週→0点, 10回/週→25点（線形、10超はキャップ）

---

## 8. テスト仕様

### 8.1 テストフレームワーク
- GAS内蔵テスト（TestRunner.js）
- 実行: GASエディタから unAllTests() を実行

### 8.2 テストカテゴリ
| カテゴリ | テスト数 | 内容 |
|----------|----------|------|
| 純ロジック | 6 | JSON パース、ER計算、Growth Score計算 |
| 設定整合性 | 3 | CONFIG値、モデルバージョン、関数存在確認 |
| 統合テスト | 3 | getAnalyticsData、シート初期化 |
| セキュリティ | 4 | PropertiesService読み書き、セキュアキー非露出 |
| **合計** | **16関数 / 59アサーション** | |

---

## 9. 既知の制限事項

- GAS実行時間制限: 6分/実行（大量データのバッチ処理に制約）
- Threads APIのAdvanced Access未対応（キーワード検索に制限あり）
- オフライン動作非対応（常時インターネット接続が必要）
- PWA非対応（ホーム画面追加は可能だがキャッシュなし）
- フォロワー属性は100人以上のアカウントのみ取得可能
- 同時編集非対応（1ユーザー利用を想定）

---

## 10. バージョン履歴

| バージョン | 日付 | 主な変更 |
|------------|------|----------|
| v1.5.0 | 2026-02-28 | オンボーディング（デモモード） |
| v2.0.0 | 2026-02-28 | エラーハンドリング強化 |
| v2.0.1 | 2026-02-28 | doGet プリフェッチ最適化 |
| v2.1.0 | 2026-02-28 | アクセシビリティ対応 |
| v2.2.0 | 2026-02-28 | リテンション設計（Growth Score等） |
| v2.3.0 | 2026-03-05 | AI投稿生成品質向上、切り口セレクタ |
| v2.4.0 | 2026-03-15 | セキュリティ強化（PropertiesService移行）、テスト基盤、アーキテクチャ改善 |
