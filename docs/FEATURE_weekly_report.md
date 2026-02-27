# 週次レポート自動生成 設計書

## 概要
毎週の成果を自動集計し、ブランド案件の提案資料（メディアキット）
としてそのまま使えるレポートを生成する。

---

## レポート内容

### サマリーカード
| 指標 | 内容 |
|---|---|
| 期間 | 2026/02/17 〜 2026/02/23 |
| フォロワー数 | 1,234（+84, +7.3%） |
| 総閲覧数 | 45,678 |
| 総インタラクション | 2,345 |
| 平均ER | 5.2%（前週比 +0.8pt） |
| 投稿数 | 12件 |

### トップ投稿 TOP3
| 順位 | テキスト（先頭50字） | ER | いいね | 返信 | リポスト |
|---|---|---|---|---|---|
| 1 | ○○○... | 12.3% | 89 | 34 | 23 |
| 2 | ○○○... | 9.8% | 67 | 28 | 15 |
| 3 | ○○○... | 8.1% | 54 | 19 | 12 |

### AI分析（Gemini生成）
- 今週のハイライト（何が良かったか）
- 改善ポイント（何を変えるべきか）
- 来週の推奨アクション（3つ）

### フォロワー推移グラフ（7日間）
- 折れ線グラフ（画像としてエクスポート時に含める）

---

## データフロー

Copy
毎週月曜 06:00（トリガー） │ ▼ generateWeeklyReport() │ ├─ getAnalyticsData(7) → 投稿データ ├─ getFollowerHistory(7) → フォロワー推移 ├─ fetchUserInsights() → アカウントインサイト │ ▼ 集計・計算 │ ├─ ER平均、トップ投稿、成長率 │ ▼ Gemini API（AI分析） │ ▼ 保存 ├─ 「週次レポート」シートに追記 └─ キャッシュ（CacheService 6h）


---

## サーバー側（新規ファイル: WeeklyReport.js）

### generateWeeklyReport()
- トリガーまたは手動から呼ばれる
- 上記データフローを実行
- シートに結果を書き込み
- 戻り値: レポートオブジェクト

### getWeeklyReport(weekOffset)
- weekOffset: 0=今週, 1=先週, 2=2週前...
- シートから該当週のレポートを取得
- なければ null

### getWeeklyReportList()
- 過去12週分のレポート一覧（日付+サマリー）を返す

### setupWeeklyTrigger()
- 毎週月曜 06:00 のトリガーを登録

---

## スプレッドシート: 「週次レポート」シート（新規作成）

| 列 | 内容 |
|---|---|
| A | week_start（月曜日の日付） |
| B | week_end（日曜日の日付） |
| C | account_id |
| D | followers_start |
| E | followers_end |
| F | follower_change |
| G | follower_change_pct |
| H | total_views |
| I | total_interactions |
| J | avg_er |
| K | post_count |
| L | top_posts_json |
| M | ai_summary |
| N | created_at |

---

## クライアント側

### ダッシュボードに「週次レポート」セクション追加
- 最新レポートのサマリーカード表示
- 「📋 詳細を見る」→ モーダルで全文表示
- 「📅 過去のレポート」→ 一覧からスクロール選択

### 分析タブに「レポート」サブタブ追加（4つ目）
- 投稿分析 | 時間帯 | 競合 | **レポート**
- 過去12週分のレポート一覧
- タップで詳細表示
- エクスポートボタン（CSV / 画像）

### レポート詳細モーダル
┌─────────────────────────────────┐ │ 📊 週次レポート │ │ 2026/02/17 〜 02/23 │ │ │ │ フォロワー 1,234 (+84, +7.3%) │ │ 閲覧数 45,678 │ │ ER平均 5.2% (+0.8pt) │ │ 投稿数 12件 │ │ │ │ 🏆 トップ投稿 │ │ 1. ○○○... ER 12.3% │ │ 2. ○○○... ER 9.8% │ │ 3. ○○○... ER 8.1% │ │ │ │ 🤖 AI分析 │ │ (Gemini生成テキスト) │ │ │ │ [CSV出力] [画像保存] [閉じる] │ └─────────────────────────────────┘


---

## API変更

### processApiRequest に追加
- action: 'getWeeklyReport' → WeeklyReport.getWeeklyReport(params.weekOffset)
- action: 'getWeeklyReportList' → WeeklyReport.getWeeklyReportList()
- action: 'generateWeeklyReport' → WeeklyReport.generateWeeklyReport()
- action: 'setupWeeklyTrigger' → WeeklyReport.setupWeeklyTrigger()

---

## テスト項目
- [ ] トリガーが正しく毎週月曜に実行される
- [ ] データが不足する週（投稿0件）のフォールバック
- [ ] 複数アカウントで正しく分離
- [ ] Gemini未設定時はAI部分をスキップ
- [ ] レポート一覧の表示・スクロール
- [ ] CSV出力の文字化け対策（BOM付きUTF-8）
- [ ] 画像保存（html2canvas or Canvas API）
