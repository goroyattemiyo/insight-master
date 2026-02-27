/**
 * WeeklyReport.js - 週次レポート自動生成
 */

function ensureWeeklyReportSheet_(ss) {
  var sheet = ss.getSheetByName('週次レポート');
  if (!sheet) {
    sheet = ss.insertSheet('週次レポート');
    sheet.appendRow(['week_start', 'week_end', 'account_id', 'followers_start', 'followers_end', 'followers_change',
      'total_views', 'total_likes', 'total_replies', 'total_reposts', 'avg_er', 'post_count', 'top_posts_json', 'ai_summary', 'created_at']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function generateWeeklyReport(ss) {
  if (!ss) ss = SpreadsheetApp.openById(getBoundSpreadsheetId());
  var settings = getSettings(ss);
  if (!settings || !settings.access_token) return { success: false, error: 'アクセストークンがありません' };

  var now = new Date();
  var weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() - weekEnd.getDay());
  var weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  var weekStartStr = Utilities.formatDate(weekStart, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var weekEndStr = Utilities.formatDate(weekEnd, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var accountId = settings.account_id || settings.user_id || 'default';

  var sheet = ensureWeeklyReportSheet_(ss);
  var existing = sheet.getDataRange().getValues();
  for (var r = 1; r < existing.length; r++) {
    if (existing[r][0] && Utilities.formatDate(new Date(existing[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd') === weekStartStr
        && String(existing[r][2]) === String(accountId)) {
      return { success: true, message: '今週のレポートは既に生成済みです', weekStart: weekStartStr, weekEnd: weekEndStr };
    }
  }

  var analytics = null;
  try { analytics = getAnalyticsData(ss, 7); } catch (e) {}
  var summary = (analytics && analytics.summary) || {};
  var posts = (analytics && analytics.posts) || [];

  var topPosts = posts
    .filter(function(p) { return p.engagementRate > 0; })
    .sort(function(a, b) { return b.engagementRate - a.engagementRate; })
    .slice(0, 3)
    .map(function(p) {
      return { text: (p.text || '').substring(0, 100), er: p.engagementRate, likes: p.likes, views: p.views };
    });

  var followerStart = 0, followerEnd = 0;
  try {
    var fSheet = ss.getSheetByName('フォロワー推移');
    if (fSheet && fSheet.getLastRow() > 1) {
      var fData = fSheet.getDataRange().getValues();
      for (var r = 1; r < fData.length; r++) {
        if (String(fData[r][5]) !== String(accountId)) continue;
        var d = Utilities.formatDate(new Date(fData[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
        if (d >= weekStartStr && d <= weekEndStr) {
          if (!followerStart) followerStart = fData[r][1];
          followerEnd = fData[r][1];
        }
      }
    }
  } catch (e) {}

  var aiSummary = '';
  if (settings.gemini_api_key && posts.length > 0) {
    try {
      var prompt = '以下のThreads週次データを日本語で200字以内に要約し、改善ポイントを3つ挙げてください。\n' +
        '投稿数: ' + (summary.totalPosts || 0) + '\n' +
        '平均ER: ' + (summary.avgEngagementRate || 0) + '%\n' +
        '総ビュー: ' + (summary.totalViews || 0) + '\n' +
        'フォロワー変動: ' + followerStart + ' -> ' + followerEnd + '\n' +
        'TOP投稿:\n' + topPosts.map(function(p, i) { return (i+1) + '. ER ' + p.er + '% / ' + p.text; }).join('\n');

      var payload = { contents: [{ parts: [{ text: prompt }] }] };
      var res = UrlFetchApp.fetch(
        CONFIG.GEMINI_API_BASE + '?key=' + settings.gemini_api_key,
        { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
      );
      var json = JSON.parse(res.getContentText());
      if (json.candidates && json.candidates[0] && json.candidates[0].content) {
        aiSummary = json.candidates[0].content.parts[0].text || '';
      }
    } catch (e) { aiSummary = '(AI分析に失敗しました)'; }
  }

  var row = [
    weekStart, weekEnd, accountId,
    followerStart, followerEnd, followerEnd - followerStart,
    summary.totalViews || 0, summary.totalLikes || 0, summary.totalReplies || 0, summary.totalReposts || 0,
    summary.avgEngagementRate || 0, summary.totalPosts || 0,
    JSON.stringify(topPosts), aiSummary, new Date()
  ];
  sheet.appendRow(row);

  return {
    success: true, weekStart: weekStartStr, weekEnd: weekEndStr,
    followers: { start: followerStart, end: followerEnd, change: followerEnd - followerStart },
    summary: summary, topPosts: topPosts, aiSummary: aiSummary
  };
}

function getWeeklyReport(weekOffset) {
  var ss = SpreadsheetApp.openById(getBoundSpreadsheetId());
  var settings = getSettings(ss);
  var accountId = (settings && (settings.account_id || settings.user_id)) || 'default';
  var sheet = ss.getSheetByName('週次レポート');
  if (!sheet || sheet.getLastRow() < 2) return null;

  var data = sheet.getDataRange().getValues();
  var reports = [];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][2]) === String(accountId)) {
      reports.push({
        weekStart: Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        weekEnd: Utilities.formatDate(new Date(data[r][1]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        followersStart: data[r][3], followersEnd: data[r][4], followersChange: data[r][5],
        totalViews: data[r][6], totalLikes: data[r][7], totalReplies: data[r][8], totalReposts: data[r][9],
        avgER: data[r][10], postCount: data[r][11],
        topPosts: JSON.parse(data[r][12] || '[]'), aiSummary: data[r][13] || '',
        createdAt: data[r][14]
      });
    }
  }

  reports.sort(function(a, b) { return new Date(b.weekStart) - new Date(a.weekStart); });
  var offset = weekOffset || 0;
  return reports[offset] || null;
}

function getWeeklyReportList() {
  var ss = SpreadsheetApp.openById(getBoundSpreadsheetId());
  var settings = getSettings(ss);
  var accountId = (settings && (settings.account_id || settings.user_id)) || 'default';
  var sheet = ss.getSheetByName('週次レポート');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][2]) === String(accountId)) {
      list.push({
        weekStart: Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        weekEnd: Utilities.formatDate(new Date(data[r][1]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        postCount: data[r][11], avgER: data[r][10], followersChange: data[r][5]
      });
    }
  }
  list.sort(function(a, b) { return new Date(b.weekStart) - new Date(a.weekStart); });
  return list;
}

function setupWeeklyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'generateWeeklyReport') {
      return { success: true, message: '週次レポートトリガーは既に設定済みです' };
    }
  }
  ScriptApp.newTrigger('generateWeeklyReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)
    .create();
  return { success: true, message: '週次レポートトリガーを設定しました（毎週月曜6時）' };
}
