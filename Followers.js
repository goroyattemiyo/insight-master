/**
 * Followers.js - フォロワー推移記録・取得
 */

/**
 * 日次フォロワー数を記録（トリガーから呼び出し）
 */
function recordDailyFollowers() {
  try {
    var ss = SpreadsheetApp.openById(getBoundSpreadsheetId());
    var sheet = ensureFollowerSheet_(ss);
    var settings = getSettings();
    if (!settings || !settings.access_token) return;

    var accounts = getAccounts ? getAccounts() : [settings];
    accounts.forEach(function(acc) {
      var token = acc.access_token || settings.access_token;
      var accountId = acc.account_id || acc.user_id || '';
      if (!token || !accountId) return;

      try {
        var url = 'https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url,threads_biography&access_token=' + token;
        var userRes = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());

        var insightUrl = 'https://graph.threads.net/v1.0/' + accountId + '/threads_insights?metric=followers_count&access_token=' + token;
        var insightRes = JSON.parse(UrlFetchApp.fetch(insightUrl, { muteHttpExceptions: true }).getContentText());

        var followersCount = 0;
        if (insightRes && insightRes.data) {
          for (var i = 0; i < insightRes.data.length; i++) {
            if (insightRes.data[i].name === 'followers_count') {
              var vals = insightRes.data[i].total_value;
              followersCount = vals ? vals.value : 0;
              break;
            }
          }
        }

        var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
        var data = sheet.getDataRange().getValues();
        var existingRow = -1;
        for (var r = 1; r < data.length; r++) {
          var rowDate = Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
          if (rowDate === today && String(data[r][5]) === String(accountId)) {
            existingRow = r + 1;
            break;
          }
        }

        var prevCount = 0;
        for (var r = data.length - 1; r >= 1; r--) {
          if (String(data[r][5]) === String(accountId) && data[r][0]) {
            var rowDate = Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
            if (rowDate !== today) { prevCount = data[r][1] || 0; break; }
          }
        }
        var dailyChange = followersCount - prevCount;

        var weekAgoDate = new Date();
        weekAgoDate.setDate(weekAgoDate.getDate() - 7);
        var weekAgoStr = Utilities.formatDate(weekAgoDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        var weekAgoCount = 0;
        for (var r = 1; r < data.length; r++) {
          if (String(data[r][5]) === String(accountId) && data[r][0]) {
            var rowDate = Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
            if (rowDate <= weekAgoStr) weekAgoCount = data[r][1] || 0;
          }
        }
        var weeklyPct = weekAgoCount > 0 ? Math.round((followersCount - weekAgoCount) / weekAgoCount * 1000) / 10 : 0;

        var row = [new Date(), followersCount, 0, dailyChange, weeklyPct, accountId];
        if (existingRow > 0) {
          sheet.getRange(existingRow, 1, 1, 6).setValues([row]);
        } else {
          sheet.appendRow(row);
        }
      } catch (e) {
        console.error('recordDailyFollowers error for ' + accountId + ': ' + e.message);
      }
    });
  } catch (e) {
    console.error('recordDailyFollowers error: ' + e.message);
  }
}

/**
 * フォロワー履歴を取得
 */
function getFollowerHistory(days) {
  var ss = SpreadsheetApp.openById(getBoundSpreadsheetId());
  var sheet = ss.getSheetByName('フォロワー推移');
  if (!sheet || sheet.getLastRow() < 2) {
    return { dates: [], counts: [], changes: [] };
  }

  var settings = getSettings();
  var accountId = (settings && (settings.account_id || settings.user_id)) || '';
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days || 7));
  var data = sheet.getDataRange().getValues();
  var dates = [], counts = [], changes = [];

  for (var r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    var d = new Date(data[r][0]);
    if (d < cutoff) continue;
    if (accountId && String(data[r][5]) !== String(accountId)) continue;
    dates.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'MM/dd'));
    counts.push(data[r][1] || 0);
    changes.push(data[r][3] || 0);
  }

  return { dates: dates, counts: counts, changes: changes };
}

/**
 * フォロワー記録トリガーを設定
 */
function setupFollowerTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'recordDailyFollowers') {
      return { success: true, message: 'トリガーは既に設定済みです' };
    }
  }
  ScriptApp.newTrigger('recordDailyFollowers')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  return { success: true, message: 'トリガーを設定しました（毎日6時）' };
}

/**
 * フォロワー推移シートを確保
 */
function ensureFollowerSheet_(ss) {
  var sheet = ss.getSheetByName('フォロワー推移');
  if (!sheet) {
    sheet = ss.insertSheet('フォロワー推移');
    sheet.appendRow(['date', 'followers_count', 'follows_count', 'daily_change', 'weekly_change_pct', 'account_id']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
