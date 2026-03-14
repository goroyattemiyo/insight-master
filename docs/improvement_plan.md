# Insight Master 品質改善計画
> 作成日: 2026-03-14 有識者会議結果

---

## 🔴 High Priority（即修正）

### BUG-1: Followers.js getSettings() / getAccounts() に ss 引数なし
- **ファイル**: Followers.js (recordDailyFollowers 関数内)
- **現状**: getSettings() getAccounts() を引数なしで呼んでおり、トリガー実行時にデータ取得できない
- **修正**: getSettings(ss) getAccounts(ss) に変更

### BUG-2: Followers.js getFollowerHistory() も同様
- **ファイル**: Followers.js (getFollowerHistory 関数内)
- **現状**: getSettings() を引数なしで呼んでおり、アカウントIDフィルタが機能しない
- **修正**: ar ss = SpreadsheetApp.openById(getBoundSpreadsheetId()); var settings = getSettings(ss);

---

## 🟡 Medium Priority（近日修正）

### BUG-3: Code.js getUserProfile 呼び出しがGitHubに未反映の可能性
- **ファイル**: Code.js (doGet 内 157-162行目)
- **現状**: GitHub上は古いコードのまま。ローカル修正済みなら push 再確認
- **確認コマンド**: Get-Content "Code.js" -Encoding utf8 | Select-Object -Skip 155 -First 16

### 改善-6: Auth.js getUserProfile にキャッシュ追加
- **ファイル**: Auth.js (getUserProfile 関数内)
- **理由**: doGet で毎回 Threads API を呼ぶとレート制限リスク
- **方針**: CacheService で1時間キャッシュ
- **実装案**:
  `javascript
  var cache = CacheService.getUserCache();
  var cacheKey = 'profile_pic_' + activeAccount.userId;
  var cached = cache.get(cacheKey);
  if (cached) return { success: true, user: JSON.parse(cached) };
  // ... API呼び出し後 ...
  cache.put(cacheKey, JSON.stringify({username, profilePicUrl, userId}), 3600);
Copy
🟢 Low Priority（軽微バグ）
BUG-4: screen_dashboard.html canvas の重複属性
行: <canvas id="followerCanvas" role="img" aria-label="..." role="img" aria-label="...">
修正: 重複した role="img" aria-label="フォロワー推移グラフ" を1つに
BUG-5: screen_analytics.html タブボタンの重複属性
行: 3つの subtab ボタンで role="tab" aria-controls="..." が2回ずつ
修正: 各ボタンの重複属性を削除
BUG-6: screen_settings.html アコーディオンの重複属性
行: .accordion-header で tabindex="0" aria-expanded="..." が2回ずつ
修正: 各ヘッダーの重複属性を削除
改善-2: app_core.html デモモード到達不能コード
箇所: demoData_ 内 toggleDraftStatus ケース
現状: return の後に saveDraft の return があり到達不能
修正: saveDraft ケースを独立させる
💡 UX改善（次フェーズ）
改善-3: ダッシュボードの長さ対策
Growth Score / チェックイン / 目標 / インサイト / チャート / デモグラ / サマリー / AI分析 / 週次レポートが1画面
方針: カードの折りたたみ（アコーディオン）化、または「概要」「詳細」の2段階表示
改善-4: デモグラフィクス都市名の日本語化
APIから返る英語都市名（Tokyo, Osaka等）に日本語マッピングを追加
改善-5: エラー時のリトライボタン追加
API失敗時に「🔄 再試行」ボタンを表示（現在はページ再読み込みが必要）
改善-7: sessionToken のタブ間共有
複数タブを開くと古いタブの sessionToken が無効になる問題
タブごとにトークンを管理する仕組みを検討
改善-8: importFromExternalSheet のセキュリティ強化
取得した資格情報のマスキング確認ダイアログを強化
改善-9: calculateGrowthScore のデータ取得最適化
getAnalyticsData(ss, 7) と getAnalyticsData(ss, 14) の重複取得を1回に統合
改善-10: 空ヒートマップ時のガイダンス
「データを更新してください」のガイダンス + ダッシュボードへの遷移ボタン追加
改善-11: 週次レポート this バインディング
renderWeeklyReport_ 内の .bind(this) を var self = this パターンに統一
改善-12: セットアップウィザードの時間目安表示
各ステップに所要時間（例: ステップ1: 約2分）を追加
改善-13: デモモード自動終了の確認
設定完了時に sessionStorage のデモフラグが確実にクリアされることを確認
改善-14: バージョン表記の自動化
screen_settings.html のハードコード v2.1.0 (2026-02-28) を動的に管理
修正順序チェックリスト
 BUG-1: Followers.js getSettings/getAccounts に ss 追加
 BUG-2: Followers.js getFollowerHistory に ss 追加
 BUG-3: Code.js getUserProfile 呼び出しの push 確認
 改善-6: Auth.js getUserProfile にキャッシュ追加
 BUG-4: screen_dashboard.html canvas 重複属性削除
 BUG-5: screen_analytics.html タブ重複属性削除
 BUG-6: screen_settings.html アコーディオン重複属性削除
 改善-2: app_core.html 到達不能コード修正
 改善-3〜14: UX改善（次フェーズ） "@ | Out-File -FilePath "docs/improvement_plan.md" -Encoding utf8
Write-Host "docs/improvement_plan.md saved"
@"
# Insight Master 品質改善計画
> 作成日: 2026-03-14 有識者会議結果

---

## Red High Priority（即修正）

### BUG-1: Followers.js getSettings/getAccounts に ss 引数なし
- ファイル: Followers.js (recordDailyFollowers 関数内)
- 現状: getSettings() getAccounts() を引数なしで呼んでおり、トリガー実行時にデータ取得できない
- 修正: getSettings(ss) getAccounts(ss) に変更

### BUG-2: Followers.js getFollowerHistory も同様
- ファイル: Followers.js (getFollowerHistory 関数内)
- 現状: getSettings() を引数なしで呼んでおり、アカウントIDフィルタが機能しない
- 修正: var ss = SpreadsheetApp.openById(getBoundSpreadsheetId()); var settings = getSettings(ss);

---

## Yellow Medium Priority（近日修正）

### BUG-3: Code.js getUserProfile 呼び出しがGitHubに未反映の可能性
- ファイル: Code.js (doGet 内 157-162行目)
- 現状: GitHub上は古いコードのまま。ローカル修正済みなら push 再確認
- 確認コマンド: Get-Content "Code.js" -Encoding utf8 | Select-Object -Skip 155 -First 16

### 改善-6: Auth.js getUserProfile にキャッシュ追加
- ファイル: Auth.js (getUserProfile 関数内)
- 理由: doGet で毎回 Threads API を呼ぶとレート制限リスク
- 方針: CacheService で1時間キャッシュ
- 実装: cache.get/put で profile_pic_{userId} を3600秒キャッシュ

---

## Green Low Priority（軽微バグ）

### BUG-4: screen_dashboard.html canvas の重複属性
- 行: canvas id=followerCanvas に role と aria-label が2回ずつ
- 修正: 重複を1つに

### BUG-5: screen_analytics.html タブボタンの重複属性
- 行: 3つの subtab ボタンで role=tab aria-controls が2回ずつ
- 修正: 各ボタンの重複属性を削除

### BUG-6: screen_settings.html アコーディオンの重複属性
- 行: accordion-header で tabindex と aria-expanded が2回ずつ
- 修正: 各ヘッダーの重複属性を削除

### 改善-2: app_core.html デモモード到達不能コード
- 箇所: demoData_ 内 toggleDraftStatus ケース
- 現状: return の後に saveDraft の return があり到達不能
- 修正: saveDraft ケースを独立させる

---

## UX改善（次フェーズ）

### 改善-3: ダッシュボードの長さ対策
- 全カードが1画面に展開される。アコーディオン化 or 概要/詳細の2段階表示

### 改善-4: デモグラフィクス都市名の日本語化
- APIの英語都市名（Tokyo, Osaka等）に日本語マッピング追加

### 改善-5: エラー時のリトライボタン追加
- API失敗時に再試行ボタンを表示（現在はページ再読み込みが必要）

### 改善-7: sessionToken のタブ間共有
- 複数タブで古いタブの token が無効になる問題

### 改善-8: importFromExternalSheet のセキュリティ強化
- 取得した資格情報のマスキング確認ダイアログを強化

### 改善-9: calculateGrowthScore のデータ取得最適化
- getAnalyticsData の重複取得を1回に統合

### 改善-10: 空ヒートマップ時のガイダンス
- ガイダンス文言 + ダッシュボードへの遷移ボタン追加

### 改善-11: 週次レポート this バインディング
- bind(this) を var self = this パターンに統一

### 改善-12: セットアップウィザードの時間目安表示
- 各ステップに所要時間（例: ステップ1 約2分）を追加

### 改善-13: デモモード自動終了の確認
- 設定完了時に sessionStorage のデモフラグが確実にクリアされることを確認

### 改善-14: バージョン表記の自動化
- screen_settings.html のハードコード v2.1.0 を動的管理に

---

## 修正順序チェックリスト

- [ ] BUG-1: Followers.js getSettings/getAccounts に ss 追加
- [ ] BUG-2: Followers.js getFollowerHistory に ss 追加
- [ ] BUG-3: Code.js getUserProfile 呼び出しの push 確認
- [ ] 改善-6: Auth.js getUserProfile にキャッシュ追加
- [ ] BUG-4: screen_dashboard.html canvas 重複属性削除
- [ ] BUG-5: screen_analytics.html タブ重複属性削除
- [ ] BUG-6: screen_settings.html アコーディオン重複属性削除
- [ ] 改善-2: app_core.html 到達不能コード修正
- [ ] 改善-3〜14: UX改善（次フェーズ）
