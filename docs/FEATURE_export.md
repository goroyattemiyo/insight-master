# CSV/PDFエクスポート 設計書

## 概要
投稿データ・レポートをCSV/画像/PDF形式で出力し、
ブランド提案・社内報告・外部共有に使えるようにする。

---

## エクスポート対象

| 対象 | 形式 | 用途 |
|---|---|---|
| 投稿一覧 | CSV | データ分析、Excel加工 |
| 週次レポート | CSV | 外部ツール連携 |
| 週次レポート | 画像（PNG） | SNS共有、メディアキット |
| バズ分析結果 | 画像（PNG） | ブランド提案資料 |
| フォロワー推移 | CSV | 成長記録 |

---

## CSV出力（クライアント側で完結）

### 仕組み
- サーバーからデータ取得（既存API）
- クライアント側でCSV文字列を組み立て
- BOM付きUTF-8でBlobを作成
- ダウンロードリンクを自動クリック

### 共通関数（app_ui.html に追加）

Copy
App.exportCSV = function(filename, headers, rows) { // headers: ['日付', 'テキスト', 'いいね', '返信', 'リポスト', 'ER'] // rows: [[...], [...], ...] var BOM = '\uFEFF'; var csv = BOM + headers.join(',') + '\n'; rows.forEach(function(row) { csv += row.map(function(cell) { var s = String(cell).replace(/"/g, '""'); return '"' + s + '"'; }).join(',') + '\n'; }); var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); App.showToast('CSVをダウンロードしました', 'success'); };


### 投稿一覧CSV
- ボタン配置: 分析タブ → 投稿分析 → 上部に「📥 CSV出力」
- ヘッダー: 日付, テキスト, いいね, 返信, リポスト, 引用, 閲覧数, ER
- 全件出力（ページネーション無視）

### フォロワー推移CSV
- ボタン配置: ダッシュボード → フォロワー推移カード → 「📥 CSV」
- ヘッダー: 日付, フォロワー数, 前日比, 週間変動率

### 週次レポートCSV
- ボタン配置: レポート詳細モーダル → 「📥 CSV出力」
- ヘッダー: 週開始, 週終了, フォロワー, 増減, 増減率, 閲覧数, インタラクション, 平均ER, 投稿数

---

## 画像出力（Canvas API）

### 仕組み
- レポートカードのHTMLをCanvas APIで画像化
- 外部ライブラリ不使用（GAS制約のため）
- Canvas に手動でレイアウトを描画

### 共通関数（app_ui.html に追加）

App.exportAsImage = function(canvasId, filename) { var canvas = document.getElementById(canvasId); if (!canvas) return; var dataUrl = canvas.toDataURL('image/png'); var a = document.createElement('a'); a.href = dataUrl; a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); App.showToast('画像を保存しました', 'success'); };


### レポート画像
- 週次レポートモーダル → 「📷 画像保存」ボタン
- Canvas サイズ: 1080x1350px（Instagram推奨比率）
- 背景: 白 / ダーク切替対応
- レイアウト:
  - 上部: ロゴ + 期間
  - 中央: 主要指標4つ（大きな数字）
  - 下部: トップ投稿3件 + AI一行サマリー
  - フッター: @ユーザー名 + Insight Master

### フォロワー推移グラフ画像
- グラフカード → 「📷 画像保存」
- 既存の drawFollowerChart の Canvas をそのまま出力

---

## PDF出力（サーバー側: GAS の機能を活用）

### 仕組み（将来対応、Phase3後半）
- GAS の HtmlService でHTMLテンプレートを生成
- UrlFetchApp で Google Docs API 経由でPDF変換
- または HTML → PDF サービス（制約あり）
- 現時点ではCSV + 画像で十分と判断

---

## UI配置まとめ

| 画面 | ボタン | 出力 |
|---|---|---|
| 分析 → 投稿分析 | 📥 CSV出力 | 投稿一覧CSV |
| ダッシュボード → フォロワー推移 | 📥 CSV | フォロワーCSV |
| 分析 → レポート → 詳細 | 📥 CSV出力 | 週次レポートCSV |
| 分析 → レポート → 詳細 | 📷 画像保存 | レポート画像PNG |
| ダッシュボード → フォロワー推移 | 📷 画像保存 | グラフ画像PNG |
| 分析 → バズ分析結果 | 📷 画像保存 | 分析結果画像PNG |

---

## テスト項目
- [ ] CSVがExcelで文字化けしない（BOM確認）
- [ ] CSVのセル内改行・カンマ・引用符が正しくエスケープ
- [ ] 画像がiPhone Safariでダウンロード可能
- [ ] 画像のダークモード対応
- [ ] 大量データ（500投稿）のCSV出力でブラウザが固まらない
- [ ] ファイル名に日付が入る
- [ ] エクスポート中のローディング表示
