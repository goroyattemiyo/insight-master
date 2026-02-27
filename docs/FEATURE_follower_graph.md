# フォロワー推移グラフ機能 設計書

## 概要
フォロワー数を日次で記録し、成長推移を可視化する。
マネタイズ勢がブランドに見せる最重要指標。

---

## データ設計

### スプレッドシート: 「フォロワー推移」シート（新規作成）
| 列 | 内容 | 型 | 例 |
|---|---|---|---|
| A | date | Date | 2026-02-27 |
| B | followers_count | Number | 1234 |
| C | follows_count | Number | 456 |
| D | daily_change | Number | +12 |
| E | weekly_change_pct | Number | 2.3 |
| F | account_id | String | 12345678 |

### 自動記録トリガー
- GAS の時間主導型トリガー（毎日 06:00）
- Threads API `GET /me?fields=followers_count` を呼び出し
- 当日レコードが既にあれば上書き、なければ追加
- daily_change = 本日 - 前日
- weekly_change_pct = (本日 - 7日前) / 7日前 * 100

---

## サーバー側（新規ファイル: Followers.js）

### recordDailyFollowers()
- トリガーから呼ばれる関数
- 全アカウント分をループ
- API呼び出し → シートに追記
- エラー時はログのみ（トースト不要）

### getFollowerHistory(days)
- days: 7 / 30 / 90
- シートから該当期間のデータを取得
- { dates: [...], counts: [...], changes: [...] } を返す

### setupFollowerTrigger()
- 既存トリガーがなければ作成
- 設定画面から呼び出し可能に

---

## クライアント側（screen_dashboard.html に追加）

### UI配置
- ダッシュボード上部、インサイトカードの下
- カード型: 「フォロワー推移」
- 期間切替ボタン: 7日 / 30日 / 90日

### グラフ描画
- Canvas API で折れ線グラフを描画（外部ライブラリ不使用）
- X軸: 日付、Y軸: フォロワー数
- ホバー/タップでツールチップ（日付 + 数値）
- 色: var(--primary) のライン、var(--primary-light) の塗り

### 数値サマリー
- 現在のフォロワー数（大きく表示）
- 前日比: +12 (▲0.5%)
- 前週比: +84 (▲2.3%)
- トレンドアイコン: 上昇↑ 下降↓ 横ばい→

### Canvas グラフ仕様
Copy
function drawFollowerChart(canvasId, data) { // data = { dates: [], counts: [] } // Canvas サイズ: 幅100%, 高さ200px // 左マージン40px（Y軸ラベル用）、下マージン30px（X軸ラベル用） // Y軸: min-max に10%マージン // X軸ラベル: 7日→毎日、30日→5日おき、90日→15日おき // ライン: 2px, var(--primary) // 塗り: ライン下をグラデーション（primary 20%→transparent） // ドット: 各データポイントに4px円 // レスポンシブ: ResizeObserver で再描画 }


---

## API変更

### processApiRequest に追加
- action: 'getFollowerHistory' → Followers.getFollowerHistory(params.days)
- action: 'setupFollowerTrigger' → Followers.setupFollowerTrigger()

---

## 画面遷移
1. ダッシュボード表示
2. loadDashboardData_ 内で getFollowerHistory(7) を並列呼び出し
3. データ受信後 drawFollowerChart を実行
4. 期間ボタンタップ → getFollowerHistory(30 or 90) → 再描画

---

## テスト項目
- [ ] トリガーが正しく登録される
- [ ] 日次記録が重複しない
- [ ] 7/30/90日の切替でグラフが更新される
- [ ] フォロワー0人の場合のエッジケース
- [ ] ダークモードでグラフの色が適切
- [ ] モバイルでタップ時ツールチップが表示される
- [ ] 複数アカウントで正しく分離される
