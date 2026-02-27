
// ===========================================
// Insights.gs - ユーザーインサイト & 競合分析
// fetchCompetitorPosts: keyword_search + author_username で代替
// ===========================================

function fetchUserInsights(ss, sinceDays) {
  var auth = getActiveAccountAuth(ss);
  if (!auth || !auth.accessToken) throw new Error('認証が必要です');

  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : 'default';

  sinceDays = sinceDays || 30;
  var now = new Date();
  var until = Math.floor(now.getTime() / 1000);
  var since = Math.floor((now.getTime() - sinceDays * 24 * 60 * 60 * 1000) / 1000);

  // ★ clicks を除外（HTTP 400 を返すため）
  var url = CONFIG.THREADS_API_BASE + '/' + auth.userId + '/threads_insights' +
    '?metric=views,likes,replies,reposts,quotes,followers_count' +
    '&since=' + since +
    '&until=' + until +
    '&access_token=' + auth.accessToken;

  var data = fetchJson_(url);
  if (data.error) throw new Error(data.error.message);

  var insights = {
    views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0,
    clicks: 0, followersCount: 0,
    accountId: accountId,
    accountUsername: activeAccount ? activeAccount.username : '',
    period: {
      since: new Date(since * 1000).toISOString(),
      until: new Date(until * 1000).toISOString(),
      days: sinceDays
    }
  };

  if (data.data) {
    data.data.forEach(function(metric) {
      if (metric.name === 'followers_count' && metric.total_value) {
        insights.followersCount = metric.total_value.value || 0;
      } else if (metric.values && metric.values.length > 0) {
        var total = 0;
        metric.values.forEach(function(v) { total += v.value || 0; });
        insights[metric.name] = total;
      } else if (metric.total_value) {
        insights[metric.name] = metric.total_value.value || 0;
      }
    });
  }

  // ★ clicks を個別に取得（エラーでも他に影響しない）
  try {
    var clicksUrl = CONFIG.THREADS_API_BASE + '/' + auth.userId + '/threads_insights' +
      '?metric=clicks&since=' + since + '&until=' + until +
      '&access_token=' + auth.accessToken;
    var clicksData = fetchJson_(clicksUrl);
    if (clicksData.data && clicksData.data[0]) {
      if (clicksData.data[0].total_value) {
        insights.clicks = clicksData.data[0].total_value.value || 0;
      } else if (clicksData.data[0].values) {
        var clickTotal = 0;
        clicksData.data[0].values.forEach(function(v) { clickTotal += v.value || 0; });
        insights.clicks = clickTotal;
      }
    }
  } catch (e) {
    Logger.log('clicks取得スキップ: ' + e.message);
  }

    // フォロワーデモグラフィクス取得（フォロワー100人以上）
  insights.demographics = null;
  try {
    var breakdowns = ['country', 'city', 'age', 'gender'];
    var demoData = {};
    breakdowns.forEach(function(breakdown) {
      var demoUrl = CONFIG.THREADS_API_BASE + '/' + auth.userId + '/threads_insights' +
        '?metric=follower_demographics&breakdown=' + breakdown +
        '&access_token=' + auth.accessToken;
      var demoResult = fetchJson_(demoUrl);
      
      // API レスポンスをフラットオブジェクト {key: value} に変換
      var flat = {};
      if (demoResult.data && demoResult.data[0] && demoResult.data[0].total_value) {
        var bkdowns = demoResult.data[0].total_value.breakdowns;
        if (bkdowns && bkdowns.length > 0 && bkdowns[0].results) {
          bkdowns[0].results.forEach(function(item) {
            var key = item.dimension_values[0];
            flat[key] = item.value;
          });
        }
      }
      
      if (Object.keys(flat).length > 0) {
        demoData[breakdown] = flat;
      }
      Utilities.sleep(300);
    });
    if (Object.keys(demoData).length > 0) insights.demographics = demoData;
  } catch (e) {
    Logger.log('デモグラフィクス取得不可: ' + e.message);
  }

  // ユーザーインサイトシートに記録（account_id付き）
  var insightSheet = ss.getSheetByName('ユーザーインサイト');
  if (insightSheet) {
    insightSheet.appendRow([
      accountId,
      now.toISOString(),
      insights.views, insights.likes, insights.replies,
      insights.reposts, insights.quotes, insights.clicks,
      insights.followersCount, now.toISOString()
    ]);
  }

  return insights;
}
