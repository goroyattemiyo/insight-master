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
  var colNames = ['post_id','timestamp','text','likes','replies','reposts','quotes','views','permalink'];
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
      id: row[idx.post_id] || '',
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

  var settings = getSettings(ss);
  var apiKey = settings['gemini_api_key'];
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
    var url = CONFIG.GEMINI_API_BASE + '?key=' + apiKey;
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




