// ===========================================
// KeywordSearch.gs - キーワード/トピック検索・トレンド分析
// ===========================================

/**
 * キーワード検索のメインエントリ
 * Threads API → 失敗時 → Geminiフォールバック
 */
function searchKeyword(ss, params) {
  var activeAccount = getActiveAccount(ss);
  if (!activeAccount || !activeAccount.accessToken) {
    throw new Error('認証が必要です');
  }

  var keyword = (params.keyword || '').trim();
  if (!keyword) throw new Error('キーワードを入力してください');

  var apiResult = tryThreadsKeywordSearch_(ss, activeAccount, keyword, params);

  if (apiResult.success) {
    storeKeywordSearchResults_(ss, activeAccount.accountId, keyword,
      params.searchType || 'TOP', params.searchMode || 'KEYWORD', apiResult.posts);
    addSearchHistory_(ss, activeAccount.accountId, keyword,
      params.searchMode || 'KEYWORD', apiResult.posts.length);

    var styleAnalysis = analyzePostStyles_(apiResult.posts);

    return {
      success: true,
      source: 'threads_api',
      posts: apiResult.posts,
      keyword: keyword,
      totalCount: apiResult.posts.length,
      searchType: params.searchType || 'TOP',
      searchMode: params.searchMode || 'KEYWORD',
      hasMore: apiResult.hasMore,
      styleAnalysis: styleAnalysis
    };
  }

  // API失敗 → Geminiフォールバック
  var settings = getSettings(ss);
  var geminiKey = settings.gemini_api_key;

  if (!geminiKey) {
    throw new Error(apiResult.error + '\n\n※ Gemini APIキーを設定すると、AIによる代替分析が利用できます。');
  }

  var fallbackResult = geminiKeywordFallback_(ss, activeAccount, keyword, params, geminiKey);

  addSearchHistory_(ss, activeAccount.accountId, keyword,
    params.searchMode || 'KEYWORD', fallbackResult.myPosts.length);

  return {
    success: true,
    source: 'gemini_fallback',
    keyword: keyword,
    apiError: apiResult.error,
    myPosts: fallbackResult.myPosts,
    analysis: fallbackResult.analysis,
    totalCount: fallbackResult.myPosts.length,
    searchType: params.searchType || 'TOP',
    searchMode: params.searchMode || 'KEYWORD'
  };
}

/**
 * Threads API keyword_search を試行（内部用）
 */
function tryThreadsKeywordSearch_(ss, activeAccount, keyword, params) {
  var accessToken = activeAccount.accessToken;
  var searchType = params.searchType || 'TOP';
  var searchMode = params.searchMode || 'KEYWORD';
  var mediaType = params.mediaType || '';
  var limit = Math.min(Math.max(parseInt(params.limit) || 25, 1), 100);

  var queryParts = [
    'q=' + encodeURIComponent(keyword),
    'search_type=' + searchType,
    'search_mode=' + searchMode,
    'fields=id,text,media_type,permalink,timestamp,username,has_replies,is_quote_post,is_reply,topic_tag',
    'limit=' + limit,
    'access_token=' + accessToken
  ];

  if (mediaType && mediaType !== 'ALL') {
    queryParts.push('media_type=' + mediaType);
  }
  if (params.since) {
    var sinceTs = parseInt(params.since);
    if (sinceTs && sinceTs >= 1688540400) queryParts.push('since=' + sinceTs);
  }
  if (params.until) {
    var untilTs = parseInt(params.until);
    if (untilTs) queryParts.push('until=' + untilTs);
  }
  if (params.authorUsername) {
    queryParts.push('author_username=' + encodeURIComponent(params.authorUsername.replace(/^@/, '')));
  }

  var url = CONFIG.THREADS_API_BASE + '/keyword_search?' + queryParts.join('&');

  try {
    var data = fetchJson_(url);
    if (data.error) {
      var errMsg = (data.error && data.error.message) ? data.error.message : JSON.stringify(data.error);
      return { success: false, error: '検索API: ' + errMsg };
    }
    var posts = (data.data || []).map(function(post) {
      return {
        postId: post.id || '',
        text: post.text || '',
        mediaType: post.media_type || 'TEXT',
        permalink: post.permalink || '',
        timestamp: post.timestamp || '',
        username: post.username || '',
        hasReplies: post.has_replies || false,
        isQuotePost: post.is_quote_post || false,
        isReply: post.is_reply || false,
        topicTag: post.topic_tag || ''
      };
    });

    return {
      success: true,
      posts: posts,
      hasMore: !!(data.paging && data.paging.cursors && data.paging.cursors.after)
    };
  } catch (e) {
    return { success: false, error: 'API通信エラー: ' + e.message };
  }
}

/**
 * 投稿スタイル分析（API検索結果用）— 新規追加
 */
function analyzePostStyles_(posts) {
  if (!posts || posts.length === 0) {
    return {
      totalPosts: 0, mediaBreakdown: {}, avgTextLength: 0,
      hourDistribution: {}, topAuthors: [], textLengthBuckets: {},
      replyRate: 0, quoteRate: 0
    };
  }

  var total = posts.length;

  // メディアタイプ別集計
  var mediaCount = {};
  posts.forEach(function(p) {
    var mt = p.mediaType || 'TEXT';
    mediaCount[mt] = (mediaCount[mt] || 0) + 1;
  });

  // テキスト長の統計
  var totalChars = 0;
  var textPosts = 0;
  var lengthBuckets = { short: 0, medium: 0, long: 0, verylong: 0 };
  posts.forEach(function(p) {
    if (p.text) {
      var len = p.text.length;
      totalChars += len;
      textPosts++;
      if (len <= 50) lengthBuckets.short++;
      else if (len <= 150) lengthBuckets.medium++;
      else if (len <= 300) lengthBuckets.long++;
      else lengthBuckets.verylong++;
    }
  });
  var avgTextLength = textPosts > 0 ? Math.round(totalChars / textPosts) : 0;

  // 時間帯分布（UTC → JST: +9h）
  var hourDist = {};
  for (var h = 0; h < 24; h++) hourDist[h] = 0;
  posts.forEach(function(p) {
    if (p.timestamp) {
      try {
        var d = new Date(p.timestamp);
        var jstHour = (d.getUTCHours() + 9) % 24;
        hourDist[jstHour] = (hourDist[jstHour] || 0) + 1;
      } catch (e) { /* skip */ }
    }
  });

  // 投稿者ランキング
  var authorMap = {};
  posts.forEach(function(p) {
    if (p.username) authorMap[p.username] = (authorMap[p.username] || 0) + 1;
  });
  var topAuthors = Object.keys(authorMap)
    .sort(function(a, b) { return authorMap[b] - authorMap[a]; })
    .slice(0, 10)
    .map(function(name) { return { username: name, count: authorMap[name] }; });

  // 返信・引用の割合
  var replyCount = 0, quoteCount = 0;
  posts.forEach(function(p) {
    if (p.isReply) replyCount++;
    if (p.isQuotePost) quoteCount++;
  });

  return {
    totalPosts: total,
    mediaBreakdown: mediaCount,
    avgTextLength: avgTextLength,
    textLengthBuckets: lengthBuckets,
    hourDistribution: hourDist,
    topAuthors: topAuthors,
    replyRate: total > 0 ? Math.round((replyCount / total) * 100) : 0,
    quoteRate: total > 0 ? Math.round((quoteCount / total) * 100) : 0
  };
}

/**
 * Geminiフォールバック: 自分の投稿データ＋AI分析
 */
function geminiKeywordFallback_(ss, activeAccount, keyword, params, geminiKey) {
  var accountId = activeAccount.accountId;
  var username = activeAccount.username || '';

  var myPosts = getMyPostsByKeyword_(ss, accountId, keyword);
  // ★ バグ修正: 引数を正しく4つ渡す（keyword, username, myPosts, geminiKey）
  var analysis = generateGeminiFallbackAnalysis_(keyword, username, myPosts, geminiKey);

  return { myPosts: myPosts, analysis: analysis };
}

/**
 * 分析データシートからキーワードに該当する自分の投稿を抽出
 */
function getMyPostsByKeyword_(ss, accountId, keyword) {
  var sheet = ss.getSheetByName('分析データ');
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var idx = {};
  headers.forEach(function(h, i) { idx[h] = i; });

  var kw = keyword.toLowerCase();
  var posts = [];

  for (var i = 0; i < data.length; i++) {
    if (data[i][idx['account_id']] !== accountId) continue;
    var text = String(data[i][idx['text']] || '').toLowerCase();
    var topicTag = String(data[i][idx['topic_tag']] || '').toLowerCase();

    if (text.indexOf(kw) !== -1 || topicTag.indexOf(kw) !== -1) {
      posts.push({
        postId: data[i][idx['post_id']] || '',
        text: data[i][idx['text']] || '',
        mediaType: data[i][idx['media_type']] || 'TEXT',
        timestamp: data[i][idx['timestamp']] || '',
        views: Number(data[i][idx['views']]) || 0,
        likes: Number(data[i][idx['likes']]) || 0,
        replies: Number(data[i][idx['replies']]) || 0,
        reposts: Number(data[i][idx['reposts']]) || 0,
        quotes: Number(data[i][idx['quotes']]) || 0,
        engagementRate: Number(data[i][idx['engagement_rate']]) || 0,
        permalink: data[i][idx['permalink']] || '',
        topicTag: data[i][idx['topic_tag']] || ''
      });
    }
  }

  posts.sort(function(a, b) { return b.engagementRate - a.engagementRate; });
  return posts;
}

/**
 * Geminiフォールバック分析の生成
 * ★ 修正: 引数を4つに統一（旧コードは定義が3引数だが呼び出しが5引数だった）
 */
function generateGeminiFallbackAnalysis_(keyword, username, myPosts, geminiKey) {
  try {
    var prompt = '';

    if (myPosts.length > 0) {
      var postSummaries = [];
      var maxPosts = Math.min(myPosts.length, 20);
      for (var i = 0; i < maxPosts; i++) {
        var p = myPosts[i];
        postSummaries.push(
          '投稿' + (i + 1) + ': "' + (p.text || '').substring(0, 100) + '" ' +
          '(👁️' + p.views + ' ❤️' + p.likes + ' 💬' + p.replies +
          ' 🔄' + p.reposts + ' ER:' + p.engagementRate.toFixed(1) + '%)'
        );
      }
      prompt = 'Threads（SNS）で「' + keyword + '」というキーワードについて分析してください。\n\n' +
        'ユーザー: @' + username + '\n' +
        '以下はこのキーワードに関連するユーザーの過去の投稿データです：\n' +
        postSummaries.join('\n') + '\n\n' +
        '以下の項目について日本語で分析してください：\n' +
        '## トレンド概要\n「' + keyword + '」に関するThreadsでの一般的なトレンドと傾向\n\n' +
        '## パフォーマンス分析\n上記投稿データから見える成功パターンと改善点\n\n' +
        '## 投稿アイデア（3つ）\nこのキーワードで高エンゲージメントが期待できる投稿案\n\n' +
        '## 関連キーワード・ハッシュタグ\n組み合わせると効果的なキーワードやタグ（5〜10個）\n\n' +
        '## 投稿タイミング\n効果的な投稿時間帯の提案';
    } else {
      prompt = 'Threads（SNS）で「' + keyword + '」というキーワードについて分析してください。\n\n' +
        'ユーザー @' + username + ' はまだこのキーワードで投稿していません。\n' +
        '以下の項目について日本語で分析してください：\n' +
        '## トレンド概要\n「' + keyword + '」に関するThreadsでの一般的なトレンドと傾向\n\n' +
        '## 投稿アイデア（3つ）\nこのキーワードで初めて投稿する場合の効果的な投稿案\n\n' +
        '## 関連キーワード・ハッシュタグ\n組み合わせると効果的なキーワードやタグ（5〜10個）\n\n' +
        '## コンテンツ戦略\nこのキーワード分野に参入するための具体的なステップ\n\n' +
        '## 投稿タイミング\n効果的な投稿時間帯の提案';
    }

    var url = CONFIG.GEMINI_API_BASE + '?key=' + geminiKey;
    var payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    };
    var fetchOptions = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var body;
    try {
      body = fetchJsonWithRetry_(url, fetchOptions);
    } catch (e) {
      Logger.log('Gemini API error: ' + e.message);
      if (/^HTTP 429/.test(e.message)) {
        return '⚠️ AI分析のリクエスト上限に達しました。1分ほど待ってから再度お試しください。';
      }
      return '⚠️ AI分析を生成できませんでした。しばらく待ってから再度お試しください。';
    }
    if (body.candidates && body.candidates.length > 0 &&
        body.candidates[0].content && body.candidates[0].content.parts &&
        body.candidates[0].content.parts.length > 0) {
      return body.candidates[0].content.parts[0].text;
    }
    return '⚠️ AI分析の生成結果が空でした。別のキーワードをお試しください。';
  } catch (e) {
    Logger.log('generateGeminiFallbackAnalysis_ error: ' + e.message);
    return '⚠️ AI分析中にエラーが発生しました: ' + e.message;
  }
}

// ===========================================
// データ保存・取得・削除ユーティリティ（変更なし）
// ===========================================

function storeKeywordSearchResults_(ss, accountId, keyword, searchType, searchMode, posts) {
  var sheet = ss.getSheetByName('キーワード検索');
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var existing = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var rowsToDelete = [];
    for (var i = existing.length - 1; i >= 0; i--) {
      if (existing[i][0] === accountId && existing[i][1] === keyword) rowsToDelete.push(i + 2);
    }
    for (var j = 0; j < rowsToDelete.length; j++) sheet.deleteRow(rowsToDelete[j]);
  }
  var now = new Date().toISOString();
  var rows = posts.map(function(post) {
    return [
      accountId, keyword, searchMode, searchType,
      post.postId, post.username, (post.text || '').substring(0, 500), post.mediaType,
      post.permalink, post.timestamp,
      post.hasReplies ? 'TRUE' : 'FALSE',
      post.isQuotePost ? 'TRUE' : 'FALSE',
      post.isReply ? 'TRUE' : 'FALSE',
      now
    ];
  });
  if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function addSearchHistory_(ss, accountId, keyword, searchMode, resultCount) {
  var sheet = ss.getSheetByName('検索履歴');
  if (!sheet) return;
  var now = new Date().toISOString();
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    for (var i = data.length - 1; i >= 0; i--) {
      if (data[i][0] === accountId && data[i][1] === keyword && data[i][2] === searchMode) sheet.deleteRow(i + 2);
    }
  }
  sheet.appendRow([accountId, keyword, searchMode, resultCount, now]);
}

function getSearchHistory(ss) {
  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : '';
  var sheet = ss.getSheetByName('検索履歴');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var history = [];
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === accountId) {
      history.push({
        keyword: data[i][1],
        searchMode: data[i][2],
        resultCount: data[i][3],
        searchedAt: data[i][4]
      });
    }
    if (history.length >= 20) break;
  }
  return history;
}

function getSavedSearchResults(ss, params) {
  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : '';
  var keyword = (params.keyword || '').trim();
  var sheet = ss.getSheetByName('キーワード検索');
  if (!sheet || sheet.getLastRow() <= 1) return { posts: [], keyword: keyword };
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  var posts = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === accountId && data[i][1] === keyword) {
      posts.push({
        postId: data[i][4], username: data[i][5], text: data[i][6],
        mediaType: data[i][7], permalink: data[i][8], timestamp: data[i][9],
        hasReplies: data[i][10] === 'TRUE', isQuotePost: data[i][11] === 'TRUE',
        isReply: data[i][12] === 'TRUE', fetchedAt: data[i][13]
      });
    }
  }
  return { posts: posts, keyword: keyword };
}

function analyzeKeywordTrend(ss, params) {
  var settings = getSettings(ss);
  var geminiKey = settings.gemini_api_key;
  if (!geminiKey) throw new Error('Gemini APIキーが設定されていません');
  var keyword = params.keyword || '';
  var posts = params.posts || [];
  if (posts.length === 0 && keyword) {
    var saved = getSavedSearchResults(ss, { keyword: keyword });
    posts = saved.posts || [];
  }
  if (posts.length === 0) throw new Error('分析する投稿データがありません');
  var samplePosts = posts.slice(0, 30).map(function(p, i) {
    return (i + 1) + '. @' + (p.username || '不明') + ' (' + (p.timestamp || '') + ')\n' + (p.text || '').substring(0, 300);
  }).join('\n\n');
  var prompt = 'あなたはSNSトレンドアナリストです。以下はThreadsで「' + keyword + '」を検索した結果の投稿データです。\n\n' +
    '【検索結果（' + posts.length + '件中、先頭' + Math.min(posts.length, 30) + '件を表示）】\n' + samplePosts + '\n\n' +
    '以下の観点で分析してください（日本語で、簡潔に）：\n' +
    '1. **トレンド概要**: このキーワードに関する全体的な傾向\n' +
    '2. **主なトピック**: 話題の中心となっているテーマ（3〜5個）\n' +
    '3. **感情分析**: ポジティブ/ネガティブ/ニュートラルの傾向\n' +
    '4. **注目ユーザー**: よく登場するユーザーや影響力のありそうなアカウント\n' +
    '5. **コンテンツ戦略の提案**: この話題に関連して投稿するなら、どんな切り口が効果的か（3つ程度）\n\n' +
    'マークダウン形式で出力してください。';
  var geminiUrl = CONFIG.GEMINI_API_BASE + '?key=' + geminiKey;
  var fetchOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    })
  };
  var resData;
  try {
    resData = fetchJsonWithRetry_(geminiUrl, fetchOptions);
  } catch (e) {
    throw new Error('Gemini API Error: ' + e.message);
  }
  try {
    return { success: true, analysis: resData.candidates[0].content.parts[0].text, keyword: keyword, postCount: posts.length };
  } catch (e) { throw new Error('AI分析結果の取得に失敗しました'); }
}

function clearSearchHistory(ss) {
  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : '';
  var sheet = ss.getSheetByName('検索履歴');
  if (!sheet || sheet.getLastRow() <= 1) return { success: true };
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var keepRows = data.filter(function(row) { return row[0] !== accountId; });
  var totalRows = sheet.getLastRow();
  if (totalRows > 1) sheet.getRange(2, 1, totalRows - 1, 5).clearContent();
  if (keepRows.length > 0) sheet.getRange(2, 1, keepRows.length, keepRows[0].length).setValues(keepRows);
  return { success: true };
}

function clearSavedSearchResults(ss, params) {
  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : '';
  var keyword = params ? (params.keyword || null) : null;
  var sheet = ss.getSheetByName('キーワード検索');
  if (!sheet || sheet.getLastRow() <= 1) return { success: true, deletedCount: 0 };
  var colCount = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, colCount).getValues();
  var keepRows = [], deletedCount = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === accountId && (!keyword || data[i][1] === keyword)) deletedCount++;
    else keepRows.push(data[i]);
  }
  var totalRows = sheet.getLastRow();
  if (totalRows > 1) sheet.getRange(2, 1, totalRows - 1, colCount).clearContent();
  if (keepRows.length > 0) sheet.getRange(2, 1, keepRows.length, keepRows[0].length).setValues(keepRows);
  return { success: true, deletedCount: deletedCount };
}
