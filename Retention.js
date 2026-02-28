// ===========================================
// Retention.js - リテンション機能（Growth Score / チェックイン / 目標管理 / メール通知）
// ===========================================

// --- シート確保 ---

function ensureGrowthScoreSheet_(ss) {
  var sheet = ss.getSheetByName('成長スコア');
  if (!sheet) {
    sheet = ss.insertSheet('成長スコア');
    sheet.appendRow(['date', 'account_id', 'score', 'follower_score', 'er_trend_score', 'frequency_score', 'ai_usage_score', 'details_json']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureCheckInSheet_(ss) {
  var sheet = ss.getSheetByName('チェックイン');
  if (!sheet) {
    sheet = ss.insertSheet('チェックイン');
    sheet.appendRow(['date', 'account_id', 'streak', 'message', 'recommended_time', 'recommended_theme']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureGoalSheet_(ss) {
  var sheet = ss.getSheetByName('目標');
  if (!sheet) {
    sheet = ss.insertSheet('目標');
    sheet.appendRow(['id', 'account_id', 'type', 'label', 'target', 'current', 'achieved', 'created_at', 'achieved_at']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ===========================================
// Growth Score 計算 (0-100)
// ===========================================

function calculateGrowthScore(ss) {
  var settings = getSettings(ss);
  var account = getActiveAccount(ss);
  var accountId = account ? (account.accountId || account.account_id) : (settings.account_id || settings.user_id || 'default');

  // --- 1. フォロワー変動スコア (0-25) ---
  var followerScore = 0;
  try {
    var fSheet = ss.getSheetByName('フォロワー推移');
    if (fSheet && fSheet.getLastRow() > 1) {
      var fData = fSheet.getDataRange().getValues();
      var now = new Date();
      var weekAgo = new Date(now.getTime() - 7 * 86400000);
      var latestCount = 0, weekAgoCount = 0;
      for (var r = 1; r < fData.length; r++) {
        if (String(fData[r][5]) !== String(accountId)) continue;
        var d = new Date(fData[r][0]);
        if (d >= weekAgo) {
          if (!weekAgoCount) weekAgoCount = fData[r][1] || 0;
          latestCount = fData[r][1] || 0;
        }
      }
      if (weekAgoCount > 0) {
        var growthPct = (latestCount - weekAgoCount) / weekAgoCount * 100;
        // -2%以下=0, +5%以上=25, 線形補間
        followerScore = Math.min(25, Math.max(0, Math.round((growthPct + 2) / 7 * 25)));
      } else if (latestCount > 0) {
        followerScore = 12; // データ不足時はニュートラル
      }
    }
  } catch (e) { Logger.log('GrowthScore follower error: ' + e.message); }

  // --- 2. ERトレンドスコア (0-25) ---
  var erTrendScore = 0;
  try {
    var thisWeekData = getAnalyticsData(ss, 7);
    var lastWeekData = getAnalyticsData(ss, 14);
    var thisWeekER = (thisWeekData && thisWeekData.summary) ? thisWeekData.summary.avgEngagementRate || 0 : 0;
    var lastWeekPosts = (lastWeekData && lastWeekData.posts) ? lastWeekData.posts : [];
    // 14日データから後半7日分を除外して前半7日のERを計算
    var now = new Date();
    var sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    var olderPosts = lastWeekPosts.filter(function(p) {
      return new Date(p.timestamp) < sevenDaysAgo;
    });
    var prevER = 0;
    if (olderPosts.length > 0) {
      var totalEng = 0, totalViews = 0;
      olderPosts.forEach(function(p) {
        totalEng += (p.likes || 0) + (p.replies || 0) + (p.reposts || 0) + (p.quotes || 0);
        totalViews += (p.views || 0);
      });
      prevER = totalViews > 0 ? totalEng / totalViews * 100 : 0;
    }
    if (prevER > 0) {
      var erChange = thisWeekER - prevER;
      // -2%pt以下=0, +2%pt以上=25, 線形補間
      erTrendScore = Math.min(25, Math.max(0, Math.round((erChange + 2) / 4 * 25)));
    } else if (thisWeekER > 0) {
      // 比較データなし：現在のER自体で評価 (0-6%→0-25)
      erTrendScore = Math.min(25, Math.round(thisWeekER / 6 * 25));
    }
  } catch (e) { Logger.log('GrowthScore ER error: ' + e.message); }

  // --- 3. 投稿頻度スコア (0-25) ---
  var frequencyScore = 0;
  try {
    var weekAnalytics = getAnalyticsData(ss, 7);
    var postCount = (weekAnalytics && weekAnalytics.summary) ? weekAnalytics.summary.totalPosts || 0 : 0;
    // 0投稿=0, 7投稿(毎日)=25, 線形
    frequencyScore = Math.min(25, Math.round(postCount / 7 * 25));
  } catch (e) { Logger.log('GrowthScore frequency error: ' + e.message); }

  // --- 4. AI活用スコア (0-25) ---
  var aiUsageScore = 0;
  try {
    var aiSheet = ss.getSheetByName('AI生成ログ');
    if (aiSheet && aiSheet.getLastRow() > 1) {
      var aiData = aiSheet.getDataRange().getValues();
      var weekAgo = new Date(new Date().getTime() - 7 * 86400000);
      var aiCount = 0;
      for (var r = 1; r < aiData.length; r++) {
        if (aiData[r][0] && new Date(aiData[r][0]) >= weekAgo) {
          if (!aiData[r][1] || String(aiData[r][1]) === String(accountId)) aiCount++;
        }
      }
      // 0回=0, 10回以上=25, 線形
      aiUsageScore = Math.min(25, Math.round(aiCount / 10 * 25));
    }
  } catch (e) { Logger.log('GrowthScore AI error: ' + e.message); }

  var totalScore = followerScore + erTrendScore + frequencyScore + aiUsageScore;

  // --- 保存 ---
  var sheet = ensureGrowthScoreSheet_(ss);
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var data = sheet.getDataRange().getValues();
  var existingRow = -1;
  for (var r = 1; r < data.length; r++) {
    if (data[r][0] && Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd') === today
        && String(data[r][1]) === String(accountId)) {
      existingRow = r + 1;
      break;
    }
  }

  var details = { followerGrowthPct: 0, thisWeekER: 0, prevER: 0, postCount: 0, aiCount: 0 };
  var row = [new Date(), accountId, totalScore, followerScore, erTrendScore, frequencyScore, aiUsageScore, JSON.stringify(details)];
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, 8).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  // --- 前週スコアを取得 ---
  var previousScore = 0;
  var weekAgoDate = new Date(new Date().getTime() - 7 * 86400000);
  var weekAgoStr = Utilities.formatDate(weekAgoDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][1]) === String(accountId) && data[r][0]) {
      var rowDate = Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (rowDate <= weekAgoStr) { previousScore = data[r][2] || 0; break; }
    }
  }

  return {
    current: totalScore,
    previous: previousScore,
    change: totalScore - previousScore,
    breakdown: {
      follower: followerScore,
      erTrend: erTrendScore,
      frequency: frequencyScore,
      aiUsage: aiUsageScore
    },
    updatedAt: new Date().toISOString()
  };
}

function getGrowthScore(ss) {
  var settings = getSettings(ss);
  var account = getActiveAccount(ss);
  var accountId = account ? (account.accountId || account.account_id) : (settings.account_id || settings.user_id || 'default');
  var sheet = ss.getSheetByName('成長スコア');
  if (!sheet || sheet.getLastRow() < 2) {
    return { current: 0, previous: 0, change: 0, breakdown: { follower: 0, erTrend: 0, frequency: 0, aiUsage: 0 }, updatedAt: null };
  }

  var data = sheet.getDataRange().getValues();
  var scores = [];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][1]) === String(accountId)) {
      scores.push({
        date: data[r][0],
        score: data[r][2] || 0,
        breakdown: { follower: data[r][3] || 0, erTrend: data[r][4] || 0, frequency: data[r][5] || 0, aiUsage: data[r][6] || 0 }
      });
    }
  }
  scores.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  var latest = scores[0] || { score: 0, breakdown: { follower: 0, erTrend: 0, frequency: 0, aiUsage: 0 } };
  var previous = scores[1] || { score: 0 };

  return {
    current: latest.score,
    previous: previous.score,
    change: latest.score - previous.score,
    breakdown: latest.breakdown,
    updatedAt: latest.date ? new Date(latest.date).toISOString() : null
  };
}

// ===========================================
// デイリーチェックイン
// ===========================================

function dailyCheckIn(ss) {
  var settings = getSettings(ss);
  var account = getActiveAccount(ss);
  var accountId = account ? (account.accountId || account.account_id) : (settings.account_id || settings.user_id || 'default');
  var sheet = ensureCheckInSheet_(ss);
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // 既にチェックイン済みか確認
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0] && Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd') === today
        && String(data[r][1]) === String(accountId)) {
      return {
        streak: data[r][2] || 1,
        todayMessage: data[r][3] || '',
        recommendedTime: data[r][4] || '',
        recommendedTheme: data[r][5] || '',
        checkedIn: true,
        alreadyCheckedIn: true
      };
    }
  }

  // ストリーク計算
  var streak = 1;
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = Utilities.formatDate(yesterday, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][1]) !== String(accountId)) continue;
    if (data[r][0]) {
      var rowDate = Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (rowDate === yesterdayStr) {
        streak = (data[r][2] || 0) + 1;
        break;
      } else if (rowDate < yesterdayStr) {
        streak = 1;
        break;
      }
    }
  }

  // おすすめ投稿時間を時間帯分析から取得
  var recommendedTime = '21:00';
  var bestHour = 21;
  try {
    var timeData = getTimeAnalysisData(ss);
    if (timeData && timeData.matrix) {
      var maxER = 0;
      var days = Object.keys(timeData.matrix);
      var todayDow = ['日曜','月曜','火曜','水曜','木曜','金曜','土曜'][new Date().getDay()];
      var todayMatrix = timeData.matrix[todayDow];
      if (todayMatrix) {
        for (var h = 0; h < 24; h++) {
          var er = todayMatrix[h] || 0;
          if (er > maxER) { maxER = er; bestHour = h; }
        }
      }
      recommendedTime = (bestHour < 10 ? '0' : '') + bestHour + ':00';
    }
  } catch (e) { Logger.log('dailyCheckIn time error: ' + e.message); }

  // AI生成「今日のひとこと」
  var todayMessage = '';
  var recommendedTheme = '';
  try {
    var apiKey = getGeminiKey_(ss);
    var prompt = 'あなたはThreads SNSの運用コーチです。\n' +
      '今日は' + ['日曜日','月曜日','火曜日','水曜日','木曜日','金曜日','土曜日'][new Date().getDay()] + 'です。\n' +
      'おすすめ投稿時間は' + bestHour + '時台です。\n' +
      'ユーザーの連続ログイン日数は' + streak + '日です。\n\n' +
      '以下のJSON形式で、今日の短いアドバイス（80文字以内）と投稿テーマ案（20文字以内）を生成してください。\n' +
      '励ましの言葉を含め、具体的で実行可能なアドバイスにしてください。\n' +
      '```json\n{"message": "...", "theme": "..."}\n```';
    var raw = callGemini_(apiKey, prompt, { temperature: 0.9, maxTokens: 256 });
    var parsed = parseGeminiJson_(raw);
    todayMessage = parsed.message || '';
    recommendedTheme = parsed.theme || '';
  } catch (e) {
    Logger.log('dailyCheckIn AI error: ' + e.message);
    // フォールバックメッセージ
    var fallbacks = [
      '今日も一歩前進！投稿を1つ書いてみましょう。',
      '継続は力なり。今日も分析をチェック！',
      bestHour + '時台の投稿がおすすめです。テーマを考えてみましょう。',
      '昨日のデータを振り返って、今日の投稿に活かそう！',
      'フォロワーとの対話を意識した投稿をしてみましょう。'
    ];
    todayMessage = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    recommendedTheme = '日常のTips共有';
  }

  // 保存
  sheet.appendRow([new Date(), accountId, streak, todayMessage, recommendedTime, recommendedTheme]);

  return {
    streak: streak,
    todayMessage: todayMessage,
    recommendedTime: recommendedTime,
    recommendedTheme: recommendedTheme,
    checkedIn: true,
    alreadyCheckedIn: false
  };
}

// ===========================================
// 目標管理
// ===========================================

function getGoals(ss) {
  var settings = getSettings(ss);
  var account = getActiveAccount(ss);
  var accountId = account ? (account.accountId || account.account_id) : (settings.account_id || settings.user_id || 'default');
  var sheet = ss.getSheetByName('目標');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var goals = [];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][1]) !== String(accountId)) continue;
    if (data[r][6] === true || data[r][6] === 'true') continue; // 達成済みは除外
    goals.push({
      id: data[r][0],
      type: data[r][2],
      label: data[r][3],
      target: data[r][4],
      current: data[r][5],
      achieved: data[r][6] === true || data[r][6] === 'true',
      createdAt: data[r][7] ? Utilities.formatDate(new Date(data[r][7]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : ''
    });
  }

  // 進捗を更新
  goals.forEach(function(goal) {
    try {
      if (goal.type === 'follower_increase') {
        var fSheet = ss.getSheetByName('フォロワー推移');
        if (fSheet && fSheet.getLastRow() > 1) {
          var fData = fSheet.getDataRange().getValues();
          var startDate = new Date(goal.createdAt);
          var startCount = 0, latestCount = 0;
          for (var r = 1; r < fData.length; r++) {
            if (String(fData[r][5]) !== String(accountId)) continue;
            var d = new Date(fData[r][0]);
            if (d >= startDate) {
              if (!startCount) startCount = fData[r][1] || 0;
              latestCount = fData[r][1] || 0;
            }
          }
          goal.current = latestCount - startCount;
        }
      } else if (goal.type === 'post_count') {
        var analytics = getAnalyticsData(ss, 30);
        goal.current = (analytics && analytics.summary) ? analytics.summary.totalPosts || 0 : 0;
      } else if (goal.type === 'er_target') {
        var analytics = getAnalyticsData(ss, 7);
        goal.current = (analytics && analytics.summary) ? Math.round((analytics.summary.avgEngagementRate || 0) * 10) / 10 : 0;
      }
    } catch (e) { Logger.log('getGoals progress error: ' + e.message); }

    goal.percentage = goal.target > 0 ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0;
    if (goal.percentage >= 100 && !goal.achieved) {
      goal.achieved = true;
      goal.justAchieved = true;
    }
  });

  return goals;
}

function setGoal(ss, params) {
  var settings = getSettings(ss);
  var account = getActiveAccount(ss);
  var accountId = account ? (account.accountId || account.account_id) : (settings.account_id || settings.user_id || 'default');
  var sheet = ensureGoalSheet_(ss);

  var goalType = params.type || 'follower_increase';
  var label = params.label || '';
  var target = parseInt(params.target) || 0;

  if (!label) {
    switch (goalType) {
      case 'follower_increase': label = '今月の目標: フォロワー+' + target; break;
      case 'post_count': label = '今月の目標: ' + target + '投稿'; break;
      case 'er_target': label = '目標ER: ' + target + '%'; break;
      default: label = '目標: ' + target;
    }
  }

  var id = 'goal_' + Utilities.getUuid().substring(0, 8);
  sheet.appendRow([id, accountId, goalType, label, target, 0, false, new Date(), '']);

  return { success: true, id: id, message: '目標を設定しました！' };
}

function deleteGoal(ss, params) {
  var goalId = params.goalId;
  if (!goalId) return { success: false, error: '目標IDがありません' };
  var sheet = ss.getSheetByName('目標');
  if (!sheet) return { success: false, error: 'シートがありません' };

  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(goalId)) {
      sheet.deleteRow(r + 1);
      return { success: true, message: '目標を削除しました' };
    }
  }
  return { success: false, error: '目標が見つかりません' };
}

// ===========================================
// 週次サマリーメール
// ===========================================

function sendWeeklySummaryEmail() {
  try {
    var ss = SpreadsheetApp.openById(getBoundSpreadsheetId());
    var settings = getSettings(ss);
    if (!settings || !settings.access_token) return;

    var email = Session.getActiveUser().getEmail();
    if (!email) return;

    var account = getActiveAccount(ss);
    var username = account ? account.username : 'ユーザー';

    // データ収集
    var scoreData = null;
    try { scoreData = calculateGrowthScore(ss); } catch (e) {}
    var analytics = null;
    try { analytics = getAnalyticsData(ss, 7); } catch (e) {}
    var followerData = null;
    try { followerData = getFollowerHistory(7); } catch (e) {}

    var summary = (analytics && analytics.summary) || {};
    var er = (summary.avgEngagementRate || 0).toFixed(1);
    var score = scoreData ? scoreData.current : 0;
    var scoreChange = scoreData ? scoreData.change : 0;
    var fChange = 0;
    if (followerData && followerData.changes) {
      followerData.changes.forEach(function(c) { fChange += c; });
    }

    var scoreSign = scoreChange >= 0 ? '+' : '';
    var fSign = fChange >= 0 ? '+' : '';

    var subject = '📊 Insight Master 週次レポート - @' + username;
    var body = 'こんにちは、@' + username + ' さん！\n\n' +
      '📊 先週のサマリーをお届けします。\n\n' +
      '━━━━━━━━━━━━━━━━━━━━\n' +
      '🚀 Growth Score: ' + score + '/100 (' + scoreSign + scoreChange + ')\n' +
      '📈 平均ER: ' + er + '%\n' +
      '📝 投稿数: ' + (summary.totalPosts || 0) + '件\n' +
      '👁 総ビュー: ' + (summary.totalViews || 0).toLocaleString() + '\n' +
      '👥 フォロワー変動: ' + fSign + fChange + '\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      'Insight Masterを開いて詳細を確認しましょう！\n' +
      'この調子で頑張りましょう！💪\n';

    MailApp.sendEmail(email, subject, body);
    Logger.log('Weekly summary email sent to ' + email);
  } catch (e) {
    Logger.log('sendWeeklySummaryEmail error: ' + e.message);
  }
}

function setupWeeklySummaryEmail() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendWeeklySummaryEmail') {
      return { success: true, message: '週次メールトリガーは既に設定済みです' };
    }
  }
  ScriptApp.newTrigger('sendWeeklySummaryEmail')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();
  return { success: true, message: '週次サマリーメールを設定しました（毎週月曜8時）' };
}