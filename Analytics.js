// ===========================================
// Analytics.gs - 機能1: 投稿パフォーマンス分析 / 機能2: 時間帯分析
// account_id でアカウント別にデータを管理
// ===========================================

/**
 * 機能1: Threads APIから投稿一覧+インサイトを取得しスプレッドシートに蓄積
 * fetchAll による並列リクエストで高速化
 */
function fetchAndStorePostAnalytics(ss) {
  var auth = getActiveAccountAuth(ss);
  if (!auth || !auth.accessToken) throw new Error('認証が必要です');

  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : 'default';
  var accountUsername = activeAccount ? activeAccount.username : '';

  console.log('分析データ取得開始: @' + accountUsername + ' (' + accountId + ')');

  // --- 投稿一覧取得（ページネーション対応） ---
  var allPosts = [];
  var url = CONFIG.THREADS_API_BASE + '/' + auth.userId + '/threads' +
    '?fields=id,media_type,text,timestamp,permalink,is_quote_post' +
    '&limit=50&access_token=' + auth.accessToken;

  var maxPages = 5;
  for (var page = 0; page < maxPages; page++) {
    var data = fetchJson_(url);
    if (data.error) throw new Error(data.error.message);
    if (data.data) allPosts = allPosts.concat(data.data);
    if (data.paging && data.paging.next) {
      url = data.paging.next;
    } else {
      break;
    }
    Utilities.sleep(200);
  }

  console.log('取得した投稿数:', allPosts.length);

  // --- 分析データシートの準備 ---
  var sheet = ss.getSheetByName('分析データ');
  if (!sheet) throw new Error('分析データシートが見つかりません');

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = {};
  headers.forEach(function(h, i) { col[h] = i; });

  // このアカウントの既存post_idを取得
  var lastRow = sheet.getLastRow();
  var existingIds = {};
  var existingRowMap = {};
  if (lastRow > 1) {
    var existingData = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var e = 0; e < existingData.length; e++) {
      var rowAccountId = existingData[e][col['account_id']] || '';
      var rowPostId = existingData[e][col['post_id']] || '';
      if (rowAccountId === accountId && rowPostId) {
        existingIds[rowPostId] = true;
        existingRowMap[rowPostId] = e + 2;
      }
    }
  }

  // --- インサイト取得対象を決定 ---
  // 新規投稿: 全件インサイト取得
  // 既存投稿: 直近50件のみ更新（古い投稿はスキップ）
  var MAX_UPDATE_EXISTING = 50;
  var newPosts = [];
  var existingToUpdate = [];

  allPosts.forEach(function(post) {
    if (existingIds[post.id]) {
      existingToUpdate.push(post);
    } else {
      newPosts.push(post);
    }
  });

  // 既存の更新は直近N件に制限（timestampが新しい順にソート済み前提）
  existingToUpdate = existingToUpdate.slice(0, MAX_UPDATE_EXISTING);

  var postsToFetchInsights = newPosts.concat(existingToUpdate);
  console.log('インサイト取得対象: 新規' + newPosts.length + '件 + 更新' + existingToUpdate.length + '件 = ' + postsToFetchInsights.length + '件');

   // --- fetchAll で並列インサイト取得（バッチ処理） ---
  var BATCH_SIZE = 5; // ← 20から5に変更
  var insightsMap = {};

  for (var batchStart = 0; batchStart < postsToFetchInsights.length; batchStart += BATCH_SIZE) {
    var batch = postsToFetchInsights.slice(batchStart, batchStart + BATCH_SIZE);

    var requests = batch.map(function(post) {
      return {
        url: CONFIG.THREADS_API_BASE + '/' + post.id + '/insights' +
          '?metric=views,likes,replies,reposts,quotes,shares' +
          '&access_token=' + auth.accessToken,
        muteHttpExceptions: true
      };
    });

    var responses = UrlFetchApp.fetchAll(requests);

    responses.forEach(function(res, idx) {
      var postId = batch[idx].id;
      var insights = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 };
      try {
        var insData = JSON.parse(res.getContentText());
        if (insData.data) {
          insData.data.forEach(function(m) {
            if (m.values && m.values[0]) insights[m.name] = m.values[0].value || 0;
          });
        }
      } catch (err) {
        console.log('インサイトパースエラー (post ' + postId + '):', err.message);
      }
      insightsMap[postId] = insights;
    });

    // バッチ間のウェイト（API制限対策）
    if (batchStart + BATCH_SIZE < postsToFetchInsights.length) {
      Utilities.sleep(1000); // ← 500msから1000msに変更
    }
  }

  // --- データ書き込み ---
  var newRows = [];
  var updatedCount = 0;
  var now = new Date().toISOString();

  allPosts.forEach(function(post) {
    var insights = insightsMap[post.id];

    // インサイト未取得（既存の古いデータ）はスキップ
    if (!insights) return;

    var er = 0;
    if (insights.views > 0) {
      er = Math.round(((insights.likes + insights.replies + insights.reposts + insights.quotes) / insights.views) * 10000) / 100;
    }

    var textPreview = (post.text || '').substring(0, 50);

    if (existingIds[post.id]) {
      // 既存データ更新
      var updateRow = existingRowMap[post.id];
      if (updateRow) {
        sheet.getRange(updateRow, col['views'] + 1, 1, 7).setValues([[
          insights.views, insights.likes, insights.replies,
          insights.reposts, insights.quotes, insights.shares, er
        ]]);
        sheet.getRange(updateRow, col['fetched_at'] + 1).setValue(now);
        updatedCount++;
      }
    } else {
      newRows.push([
        post.id, accountId, textPreview, post.media_type || 'TEXT', post.timestamp || '',
        insights.views, insights.likes, insights.replies, insights.reposts,
        insights.quotes, insights.shares, er,
        post.permalink || '', post.is_quote_post || false, '', now
      ]);
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 16).setValues(newRows);
  }

  console.log('分析データ更新完了: @' + accountUsername + ' 新規' + newRows.length + '件, 更新' + updatedCount + '件');
  return {
    success: true,
    accountUsername: accountUsername,
    total: allPosts.length,
    newPosts: newRows.length,
    updatedPosts: updatedCount
  };
}

/**
 * 機能1: 分析データをUIに返す（アクティブアカウント + フィルター対応）
 */
function getAnalyticsData(ss, periodDays) {
  var sheet = ss.getSheetByName('分析データ');
  if (!sheet) return { posts: [], summary: {} };

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { posts: [], summary: {} };

  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : 'default';

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = {};
  headers.forEach(function(h, i) { col[h] = i; });

  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var now = new Date();
  var cutoff = null;
  if (periodDays && periodDays !== 'all') {
    cutoff = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  }

  var posts = [];
  var totalViews = 0, totalLikes = 0, totalReplies = 0, totalReposts = 0, totalQuotes = 0, totalShares = 0;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if ((row[col['account_id']] || '') !== accountId) continue;

    var ts = row[col['timestamp']] ? new Date(row[col['timestamp']]) : null;
    if (cutoff && ts && ts < cutoff) continue;

    var post = {
      postId: row[col['post_id']],
      text: row[col['text']],
      mediaType: row[col['media_type']],
      timestamp: row[col['timestamp']],
      views: Number(row[col['views']]) || 0,
      likes: Number(row[col['likes']]) || 0,
      replies: Number(row[col['replies']]) || 0,
      reposts: Number(row[col['reposts']]) || 0,
      quotes: Number(row[col['quotes']]) || 0,
      shares: Number(row[col['shares']]) || 0,
      engagementRate: Number(row[col['engagement_rate']]) || 0,
      permalink: row[col['permalink']],
      isQuotePost: row[col['is_quote_post']],
      topicTag: row[col['topic_tag']]
    };
    posts.push(post);
    totalViews += post.views;
    totalLikes += post.likes;
    totalReplies += post.replies;
    totalReposts += post.reposts;
    totalQuotes += post.quotes;
    totalShares += post.shares;  // ★ 追加
  }

  posts.sort(function(a, b) { return b.engagementRate - a.engagementRate; });

  var avgEr = 0;
  if (posts.length > 0 && totalViews > 0) {
    avgEr = Math.round(((totalLikes + totalReplies + totalReposts + totalQuotes) / totalViews) * 10000) / 100;
  }

  return {
    posts: posts,
    summary: {
      totalPosts: posts.length,
      totalViews: totalViews,
      totalLikes: totalLikes,
      totalReplies: totalReplies,
      totalReposts: totalReposts,
      totalQuotes: totalQuotes,
      totalShares: totalShares,  // ★ 追加
      avgEngagementRate: avgEr
    }
  };
}

// ===========================================
// 機能2: 最適投稿時間帯分析（アカウント別）
// ===========================================

/**
 * 曜日×時間帯マトリクスを生成（アクティブアカウントのデータのみ）
 */
function generateTimeAnalysis(ss) {
  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : 'default';

  var analyticsSheet = ss.getSheetByName('分析データ');
  if (!analyticsSheet) throw new Error('分析データシートが見つかりません');

  var lastRow = analyticsSheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'データがありません' };

  var headers = analyticsSheet.getRange(1, 1, 1, analyticsSheet.getLastColumn()).getValues()[0];
  var col = {};
  headers.forEach(function(h, i) { col[h] = i; });

  var data = analyticsSheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var dayNames = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];

  // マトリクス初期化
  var sumMatrix = {};
  var cntMatrix = {};
  dayNames.forEach(function(day) {
    sumMatrix[day] = {};
    cntMatrix[day] = {};
    for (var h = 0; h < 24; h++) { sumMatrix[day][h] = 0; cntMatrix[day][h] = 0; }
  });

  // 集計（アカウントフィルタ付き）
  var postCount = 0;
  for (var i = 0; i < data.length; i++) {
    if ((data[i][col['account_id']] || '') !== accountId) continue;

    var ts = data[i][col['timestamp']];
    var er = Number(data[i][col['engagement_rate']]) || 0;
    if (!ts) continue;
    var d = new Date(ts);
    var dayName = dayNames[d.getDay()];
    var hour = d.getHours();
    sumMatrix[dayName][hour] += er;
    cntMatrix[dayName][hour] += 1;
    postCount++;
  }

  if (postCount === 0) return { success: false, error: 'このアカウントのデータがありません' };

  // 平均算出
  var avgMatrix = {};
  var allValues = [];
  dayNames.forEach(function(day) {
    avgMatrix[day] = {};
    for (var h = 0; h < 24; h++) {
      avgMatrix[day][h] = cntMatrix[day][h] > 0
        ? Math.round((sumMatrix[day][h] / cntMatrix[day][h]) * 100) / 100
        : 0;
      if (avgMatrix[day][h] > 0) allValues.push(avgMatrix[day][h]);
    }
  });

  // 時間帯分析シートに書き込み（アカウント別の行を管理）
  var timeSheet = ss.getSheetByName('時間帯分析');
  if (!timeSheet) timeSheet = ss.insertSheet('時間帯分析');

  // このアカウントの既存行を削除
  var timeLastRow = timeSheet.getLastRow();
  if (timeLastRow > 1) {
    var timeData = timeSheet.getRange(2, 1, timeLastRow - 1, 1).getValues();
    for (var r = timeData.length - 1; r >= 0; r--) {
      if (timeData[r][0] === accountId) {
        timeSheet.deleteRow(r + 2);
      }
    }
  }

  // ヘッダー確認
  if (timeSheet.getLastRow() === 0 || timeSheet.getLastColumn() === 0) {
    var thHeaders = ['account_id', '曜日'];
    for (var h = 0; h < 24; h++) thHeaders.push(String(h));
    timeSheet.getRange(1, 1, 1, 26).setValues([thHeaders]).setFontWeight('bold');
  }

  // データ行を追加
  var rows = [];
  dayNames.forEach(function(day) {
    var row = [accountId, day];
    for (var h = 0; h < 24; h++) row.push(avgMatrix[day][h]);
    rows.push(row);
  });
  var startRow = timeSheet.getLastRow() + 1;
  timeSheet.getRange(startRow, 1, 7, 26).setValues(rows);

  // ヒートマップ色付け
  if (allValues.length > 0) {
    var maxVal = Math.max.apply(null, allValues);
    var minVal = Math.min.apply(null, allValues);

    for (var ri = 0; ri < 7; ri++) {
      for (var c = 0; c < 24; c++) {
        var val = avgMatrix[dayNames[ri]][c];
        var cell = timeSheet.getRange(startRow + ri, c + 3); // 3列目から（account_id, 曜日の次）
        if (val === 0) {
          cell.setBackground('#f0f0f0');
        } else if (maxVal > minVal) {
          var ratio = (val - minVal) / (maxVal - minVal);
          var red, green;
          if (ratio < 0.5) { red = 255; green = Math.round(ratio * 2 * 255); }
          else { red = Math.round((1 - ratio) * 2 * 255); green = 255; }
          cell.setBackground('#' + ('0' + red.toString(16)).slice(-2) + ('0' + green.toString(16)).slice(-2) + '40');
        }
      }
    }
  }

  console.log('時間帯分析完了: @' + (activeAccount ? activeAccount.username : 'unknown') + ' (' + postCount + '件)');
  return { success: true, matrix: avgMatrix, postCount: postCount };
}

/**
 * 時間帯分析データをUIに返す（アクティブアカウントのみ）
 */
function getTimeAnalysisData(ss) {
  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : 'default';

  var sheet = ss.getSheetByName('時間帯分析');
  if (!sheet) return { matrix: {}, hasData: false };
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { matrix: {}, hasData: false };

  var data = sheet.getRange(2, 1, lastRow - 1, 26).getValues();
  var matrix = {};

  data.forEach(function(row) {
    if (row[0] === accountId && row[1]) {
      matrix[row[1]] = {};
      for (var h = 0; h < 24; h++) matrix[row[1]][h] = Number(row[h + 2]) || 0;
    }
  });

  var hasData = Object.keys(matrix).length > 0;
  return { matrix: matrix, hasData: hasData };
}

// === バズパターン分析 ===

function analyzeBuzzPattern(ss, days) {
  days = days || 30;
  var sheet = ss.getSheetByName('分析データ');
  if (!sheet || sheet.getLastRow() < 2) {
    return { error: false, stats: null, topPosts: [], bottomPosts: [], sampleSize: 0, message: '投稿データがありません' };
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var now = new Date();
  var cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // ヘッダーインデックス取得
  var idx = {};
  var colNames = ['id','timestamp','text','likes','replies','reposts','quotes','views','permalink'];
  colNames.forEach(function(name) {
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).toLowerCase().indexOf(name) >= 0) { idx[name] = i; break; }
    }
  });

  // 投稿データをパース
  var posts = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var ts = idx.timestamp !== undefined ? new Date(row[idx.timestamp]) : null;
    if (!ts || isNaN(ts.getTime()) || ts < cutoff) continue;

    var likes = Number(row[idx.likes] || 0);
    var replies = Number(row[idx.replies] || 0);
    var reposts = Number(row[idx.reposts] || 0);
    var quotes = Number(row[idx.quotes] || 0);
    var views = Number(row[idx.views] || 0);
    var text = String(row[idx.text] || '');
    var engagement = likes + replies + reposts + quotes;
    var er = views > 0 ? (engagement / views * 100) : 0;

    posts.push({
      id: row[idx.id] || '',
      timestamp: ts,
      text: text,
      likes: likes,
      replies: replies,
      reposts: reposts,
      quotes: quotes,
      views: views,
      engagement: engagement,
      er: er,
      hour: ts.getHours(),
      day: ts.getDay(),
      length: text.length,
      hasMedia: /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|mp4|webp)/i.test(text) || text.indexOf('[メディア]') >= 0,
      hasHashtag: /#\S+/.test(text),
      hashtagCount: (text.match(/#\S+/g) || []).length,
      isQuestion: /[？?]/.test(text),
      hookLength: (text.split(/[。\n！!？?]/)[0] || '').length,
      permalink: row[idx.permalink] || ''
    });
  }

  if (posts.length === 0) {
    return { error: false, stats: null, topPosts: [], bottomPosts: [], sampleSize: 0, message: days + '日間の投稿データがありません' };
  }

  // ER降順ソート
  posts.sort(function(a, b) { return b.er - a.er; });
  var topN = Math.min(10, Math.ceil(posts.length * 0.2));
  var top = posts.slice(0, topN);
  var bottom = posts.slice(-topN);

  // 統計関数
  function avg(arr, key) {
    if (arr.length === 0) return 0;
    var sum = 0;
    arr.forEach(function(p) { sum += (typeof key === 'function' ? key(p) : p[key]); });
    return Math.round(sum / arr.length * 10) / 10;
  }
  function rate(arr, key) {
    if (arr.length === 0) return 0;
    var count = 0;
    arr.forEach(function(p) { if (p[key]) count++; });
    return Math.round(count / arr.length * 100);
  }
  function modeVal(arr, key) {
    var freq = {};
    arr.forEach(function(p) { var v = p[key]; freq[v] = (freq[v] || 0) + 1; });
    var maxK = null, maxV = 0;
    for (var k in freq) { if (freq[k] > maxV) { maxV = freq[k]; maxK = k; } }
    return Number(maxK);
  }

  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  var stats = {
    avgLength:      { top: avg(top, 'length'),      bottom: avg(bottom, 'length') },
    avgER:          { top: avg(top, 'er'),           bottom: avg(bottom, 'er') },
    bestHour:       modeVal(top, 'hour'),
    bestDay:        dayNames[modeVal(top, 'day')],
    avgHour:        { top: avg(top, 'hour'),         bottom: avg(bottom, 'hour') },
    mediaRate:      { top: rate(top, 'hasMedia'),    bottom: rate(bottom, 'hasMedia') },
    questionRate:   { top: rate(top, 'isQuestion'),  bottom: rate(bottom, 'isQuestion') },
    hashtagRate:    { top: rate(top, 'hasHashtag'),  bottom: rate(bottom, 'hasHashtag') },
    avgHashtags:    { top: avg(top, 'hashtagCount'), bottom: avg(bottom, 'hashtagCount') },
    hookLength:     { top: avg(top, 'hookLength'),   bottom: avg(bottom, 'hookLength') },
    avgEngagement:  { top: avg(top, 'engagement'),   bottom: avg(bottom, 'engagement') },
    avgViews:       { top: avg(top, 'views'),        bottom: avg(bottom, 'views') }
  };

  var topPosts = top.map(function(p) {
    return { text: p.text.substring(0, 100), er: p.er, likes: p.likes, views: p.views, hour: p.hour, day: dayNames[p.timestamp.getDay()], permalink: p.permalink };
  });

  return {
    error: false,
    stats: stats,
    topPosts: topPosts,
    bottomPosts: bottom.slice(0, 3).map(function(p) { return { text: p.text.substring(0, 60), er: p.er }; }),
    sampleSize: posts.length,
    topN: topN,
    days: days,
    message: null
  };
}


function generateBuzzReport(ss, days) {
  days = days || 30;
  var analysis = analyzeBuzzPattern(ss, days);
  if (!analysis.stats) return analysis;

  var settings = getSettings_();
  var apiKey = settings.geminiApiKey;
  if (!apiKey) {
    analysis.aiReport = null;
    analysis.aiError = 'Gemini APIキーが設定されていません。統計データのみ表示します。';
    return analysis;
  }

  var s = analysis.stats;
  var prompt = 'あなたはSNSマーケティングの専門家です。以下はThreads投稿の分析データです。\n\n' +
    '【分析期間】直近' + days + '日間（' + analysis.sampleSize + '投稿）\n' +
    '【上位投稿の特徴】\n' +
    '- 平均文字数: ' + s.avgLength.top + '文字（下位: ' + s.avgLength.bottom + '文字）\n' +
    '- 平均ER: ' + s.avgER.top + '%（下位: ' + s.avgER.bottom + '%）\n' +
    '- 最適投稿時間: ' + s.bestHour + '時\n' +
    '- 最適曜日: ' + s.bestDay + '曜日\n' +
    '- メディア添付率: ' + s.mediaRate.top + '%（下位: ' + s.mediaRate.bottom + '%）\n' +
    '- 質問形式率: ' + s.questionRate.top + '%（下位: ' + s.questionRate.bottom + '%）\n' +
    '- フック（冒頭文）平均: ' + s.hookLength.top + '文字（下位: ' + s.hookLength.bottom + '文字）\n' +
    '- ハッシュタグ率: ' + s.hashtagRate.top + '%（平均' + s.avgHashtags.top + '個）\n\n' +
    '【上位投稿の例】\n';

  analysis.topPosts.forEach(function(p, i) {
    prompt += (i + 1) + '. [ER ' + p.er.toFixed(1) + '% / ' + p.likes + '♡ / ' + p.views + '👁] ' + p.text + '\n';
  });

  prompt += '\n以下の形式で日本語で回答してください：\n' +
    '## 📊 バズパターン分析レポート\n' +
    '### 発見された成功パターン\n（3-5つの具体的パターン）\n' +
    '### 💡 改善アクション\n（すぐに実行できる3-5つの提案）\n' +
    '### 🎯 おすすめテーマ3選\n（データに基づく投稿テーマ案）\n' +
    '### ⚠️ 避けるべきパターン\n（下位投稿から学ぶ注意点）';

  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
    var payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 2000 } };
    var options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates[0] && json.candidates[0].content) {
      analysis.aiReport = json.candidates[0].content.parts[0].text;
    } else {
      analysis.aiReport = null;
      analysis.aiError = 'AI応答の解析に失敗しました';
    }
  } catch (e) {
    analysis.aiReport = null;
    analysis.aiError = 'AI分析エラー: ' + e.message;
  }

  return analysis;
}

