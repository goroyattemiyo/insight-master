// ===========================================
// CompetitorWatch.gs — 競合ウォッチ（API不要版）
// Grounding検索 + 手動蓄積 + AI分析
// ===========================================

// -------------------------------------------
// 競合アカウント CRUD
// -------------------------------------------
function addCompetitor(ss, params) {
  var username = (params.username || '').trim().replace(/^@/, '');
  if (!username) throw new Error('ユーザー名を入力してください');
  var account = getActiveAccount(ss);
  var accountId = account ? account.accountId || '' : '';
  var sheet = ss.getSheetByName('競合アカウント');
  if (!sheet) throw new Error('競合アカウントシートがありません。設定を再初期化してください。');
  // 重複チェック
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === accountId && rows[i][2].toString().toLowerCase() === username.toLowerCase()) {
      throw new Error('@' + username + ' は既に登録されています');
    }
  }
  var id = 'comp_' + Utilities.getUuid().substring(0, 8);
  sheet.appendRow([
    id,
    accountId,
    username,
    (params.displayName || '').trim(),
    (params.category || '同業').trim(),
    parseInt(params.followersCount) || 0,
    new Date().toISOString(),
    (params.memo || '').trim(),
    new Date().toISOString()
  ]);
  return { competitorId: id, username: username };
}

function getCompetitors(ss) {
  var account = getActiveAccount(ss);
  var accountId = account ? account.accountId || '' : '';
  var sheet = ss.getSheetByName('競合アカウント');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var results = [];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] !== accountId) continue;
    results.push({
      competitorId: rows[i][0],
      username: rows[i][2],
      displayName: rows[i][3],
      category: rows[i][4],
      followersCount: rows[i][5],
      followersUpdated: rows[i][6],
      memo: rows[i][7],
      createdAt: rows[i][8]
    });
  }
  // 記録投稿数を付与
  var watchSheet = ss.getSheetByName('競合ウォッチ');
  if (watchSheet && watchSheet.getLastRow() > 1) {
    var wRows = watchSheet.getDataRange().getValues();
    var countMap = {};
    for (var j = 1; j < wRows.length; j++) {
      if (wRows[j][1] !== accountId) continue;
      var u = wRows[j][2];
      countMap[u] = (countMap[u] || 0) + 1;
    }
    results.forEach(function(c) {
      c.watchCount = countMap[c.username] || 0;
    });
  }
  return results;
}

function updateCompetitor(ss, params) {
  var competitorId = params.competitorId;
  if (!competitorId) throw new Error('競合IDが指定されていません');
  var sheet = ss.getSheetByName('競合アカウント');
  if (!sheet) throw new Error('シートがありません');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === competitorId) {
      if (params.followersCount !== undefined) {
        sheet.getRange(i + 1, 6).setValue(parseInt(params.followersCount) || 0);
        sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      }
      if (params.category !== undefined) sheet.getRange(i + 1, 5).setValue(params.category);
      if (params.memo !== undefined) sheet.getRange(i + 1, 8).setValue(params.memo);
      if (params.displayName !== undefined) sheet.getRange(i + 1, 4).setValue(params.displayName);
      return { success: true };
    }
  }
  throw new Error('競合が見つかりません');
}

function deleteCompetitor(ss, params) {
  var competitorId = params.competitorId;
  var sheet = ss.getSheetByName('競合アカウント');
  if (!sheet) throw new Error('シートがありません');
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === competitorId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  throw new Error('競合が見つかりません');
}

// -------------------------------------------
// 競合投稿ウォッチ CRUD
// -------------------------------------------
function saveWatchPost(ss, params) {
  var username = (params.competitorUsername || '').trim().replace(/^@/, '');
  if (!username) throw new Error('競合ユーザー名を入力してください');
  var postText = (params.postText || '').trim();
  if (!postText) throw new Error('投稿テキストを入力してください');
  var account = getActiveAccount(ss);
  var accountId = account ? account.accountId || '' : '';
  var sheet = ss.getSheetByName('競合ウォッチ');
  if (!sheet) throw new Error('競合ウォッチシートがありません');
  var id = 'watch_' + Utilities.getUuid().substring(0, 8);
  sheet.appendRow([
    id,
    accountId,
    username,
    (params.postUrl || '').trim(),
    postText,
    (params.mediaType || 'TEXT').toUpperCase(),
    parseInt(params.likes) || 0,
    parseInt(params.replies) || 0,
    parseInt(params.reposts) || 0,
    params.postDate || new Date().toISOString().split('T')[0],
    (params.tags || '').trim(),
    (params.memo || '').trim(),
    new Date().toISOString()
  ]);
  // 競合アカウントに未登録なら自動登録
  try {
    var compSheet = ss.getSheetByName('競合アカウント');
    if (compSheet) {
      var cRows = compSheet.getDataRange().getValues();
      var found = false;
      for (var i = 1; i < cRows.length; i++) {
        if (cRows[i][1] === accountId && cRows[i][2].toString().toLowerCase() === username.toLowerCase()) {
          found = true; break;
        }
      }
      if (!found) {
        addCompetitor(ss, { username: username, category: '自動登録' });
      }
    }
  } catch (e) { Logger.log('Auto-register competitor error: ' + e.message); }
  return { watchId: id, username: username };
}

function getWatchPosts(ss, params) {
  params = params || {};
  var account = getActiveAccount(ss);
  var accountId = account ? account.accountId || '' : '';
  var sheet = ss.getSheetByName('競合ウォッチ');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var rows = sheet.getDataRange().getValues();
  var results = [];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] !== accountId) continue;
    if (params.username && rows[i][2].toString().toLowerCase() !== params.username.toLowerCase()) continue;
    if (params.tags) {
      var rowTags = (rows[i][10] || '').toLowerCase();
      if (rowTags.indexOf(params.tags.toLowerCase()) === -1) continue;
    }
    results.push({
      watchId: rows[i][0],
      competitorUsername: rows[i][2],
      postUrl: rows[i][3],
      postText: rows[i][4],
      mediaType: rows[i][5],
      likes: rows[i][6],
      replies: rows[i][7],
      reposts: rows[i][8],
      postDate: rows[i][9],
      tags: rows[i][10],
      memo: rows[i][11],
      createdAt: rows[i][12]
    });
  }
  results.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  return results;
}

function deleteWatchPost(ss, params) {
  var watchId = params.watchId;
  var sheet = ss.getSheetByName('競合ウォッチ');
  if (!sheet) throw new Error('シートがありません');
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === watchId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  throw new Error('記録が見つかりません');
}

// -------------------------------------------
// Gemini Grounding 検索（Google検索経由）
// -------------------------------------------
function searchCompetitorByGrounding(ss, params) {
  var apiKey = getGeminiKey_(ss);
  var query = (params.query || '').trim();
  if (!query) throw new Error('検索キーワードを入力してください');
  var searchTarget = (params.searchTarget || '').trim();
  var prompt = 'あなたはSNSリサーチャーです。\n';
  if (searchTarget) {
    prompt += 'Threadsの @' + searchTarget + ' のアカウントについて、「' + query + '」に関連する投稿や活動を調査してください。\n';
  } else {
    prompt += 'Threadsで「' + query + '」に関連する投稿やトレンドを調査してください。\n';
  }
  prompt += '\nサイト threads.net を中心に検索し、以下の形式で日本語レポートを作成:\n' +
    '1. **検索結果サマリー** — 見つかった投稿や情報の概要\n' +
    '2. **主要な投稿・発言** — 具体的な投稿内容や傾向（見つかった場合）\n' +
    '3. **トレンド・話題** — このキーワードに関する全体的な傾向\n' +
    '4. **活用ヒント** — この情報を自分の投稿にどう活かすか\n\n' +
    '検索結果が少ない場合は正直にその旨を伝え、一般的なSNSトレンドの知識で補完してください。';

  var result = callGeminiWithGrounding_(apiKey, prompt, { temperature: 0.5, maxTokens: 4096 });
  // スプシに検索履歴を保存
  try {
    var account = getActiveAccount(ss);
    var accountId = account ? account.accountId || '' : '';
    var histSheet = ss.getSheetByName('検索履歴');
    if (histSheet) {
      histSheet.appendRow([accountId, query + (searchTarget ? ' @' + searchTarget : ''), 'grounding', 1, new Date().toISOString()]);
    }
  } catch (e) { Logger.log('Search history save error: ' + e.message); }
  return {
    query: query,
    searchTarget: searchTarget || null,
    report: result.text,
    sources: result.sources || []
  };
}

// -------------------------------------------
// Gemini + Grounding 共通呼び出し
// -------------------------------------------
function callGeminiWithGrounding_(apiKey, prompt, options) {
  options = options || {};
  var temperature = options.temperature != null ? options.temperature : 0.7;
  var maxTokens = options.maxTokens || 4096;
  var url = CONFIG.GEMINI_API_BASE + '?key=' + apiKey;
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens
    }
  };
  var fetchOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  var body;
  try {
    body = fetchJsonWithRetry_(url, fetchOptions);
  } catch (e) {
    var errMsg = e.message || 'unknown';
    throw new Error('検索に失敗しました: ' + errMsg);
  }
  var text = '';
  var sources = [];
  try { text = body.candidates[0].content.parts[0].text; }
  catch (e) { throw new Error('レスポンスの形式が不正です'); }
  // グラウンディングメタデータからソース抽出
  try {
    var gm = body.candidates[0].groundingMetadata;
    if (gm && gm.groundingChunks) {
      gm.groundingChunks.forEach(function(chunk) {
        if (chunk.web) {
          sources.push({ title: chunk.web.title || '', uri: chunk.web.uri || '' });
        }
      });
    }
  } catch (e) { /* sources extraction optional */ }
  return { text: text, sources: sources };
}

// -------------------------------------------
// AI 分析（蓄積データ使用）
// -------------------------------------------
function analyzeCompetitorStyle(ss, params) {
  var apiKey = getGeminiKey_(ss);
  var username = (params.username || '').trim();
  if (!username) throw new Error('競合ユーザー名を指定してください');
  var posts = getWatchPosts(ss, { username: username });
  if (posts.length === 0) throw new Error('@' + username + ' の記録投稿がありません。先に投稿を記録してください。');
  var prompt = 'あなたはSNSマーケティングの専門アナリストです。\n' +
    'Threadsの @' + username + ' のアカウントについて、以下の蓄積データからスタイル分析を行ってください。\n\n' +
    '## 蓄積投稿データ（' + posts.length + '件）\n';
  var sample = posts.slice(0, 30);
  sample.forEach(function(p, i) {
    prompt += (i + 1) + '. [' + (p.mediaType || 'TEXT') + '] likes=' + (p.likes || 0) +
      ' replies=' + (p.replies || 0) + ' reposts=' + (p.reposts || 0) +
      ' | ' + (p.postText || '').substring(0, 150) + '\n';
  });
  prompt += '\n## 分析項目\n' +
    '1. **📝 文体パターン** — 文の長さ、語調、絵文字使用、改行の癖\n' +
    '2. **🎯 コンテンツ戦略** — 主要テーマ、投稿カテゴリの傾向\n' +
    '3. **📊 エンゲージメント傾向** — 反応が良い/悪い投稿の特徴\n' +
    '4. **🕐 投稿パターン** — 投稿頻度、曜日・時間帯の傾向（データから読み取れる範囲）\n' +
    '5. **💡 学べるポイント** — この競合から取り入れるべき要素\n' +
    '6. **⚠️ 弱点・差別化ポイント** — 自分が差をつけられる部分\n';
  var analysis = callGemini_(apiKey, prompt, { temperature: 0.6, maxTokens: 8192 });
  return { username: username, postCount: posts.length, analysis: analysis };
}

function analyzeVsSelf(ss, params) {
  var apiKey = getGeminiKey_(ss);
  var username = (params.username || '').trim();
  // 競合データ取得
  var competitorPosts = [];
  if (username) {
    competitorPosts = getWatchPosts(ss, { username: username });
  } else {
    competitorPosts = getWatchPosts(ss, {});
  }
  if (competitorPosts.length === 0) throw new Error('競合の記録投稿がありません。先に投稿を記録してください。');
  // 自分のデータ取得
  var analyticsData = null;
  try { analyticsData = getAnalyticsData(ss, { period: 30 }); }
  catch (e) { throw new Error('自分の分析データがありません。ダッシュボードで「データを更新」を実行してください。'); }
  if (!analyticsData || !analyticsData.posts || analyticsData.posts.length === 0) {
    throw new Error('自分の投稿データがありません。ダッシュボードで「データを更新」を実行してください。');
  }
  var prompt = 'あなたはSNSグロースコンサルタントです。\n' +
    '「自分」と「競合」のデータを比較し、具体的な改善提案を日本語で作成してください。\n\n';
  // 自分のサマリー
  var s = analyticsData.summary || {};
  prompt += '## 自分のアカウント（過去30日）\n' +
    '- 投稿数: ' + (s.totalPosts || 0) + '\n' +
    '- 平均ER: ' + ((s.avgEngagementRate || 0)).toFixed(2) + '%\n' +
    '- 総ビュー: ' + (s.totalViews || 0) + '\n' +
    '- 総いいね: ' + (s.totalLikes || 0) + '\n\n';
  // 自分のトップ投稿
  var myTop = (analyticsData.posts || []).slice()
    .sort(function(a, b) { return (b.engagementRate || 0) - (a.engagementRate || 0); })
    .slice(0, 5);
  prompt += '## 自分の高ER投稿TOP5\n';
  myTop.forEach(function(p, i) {
    prompt += (i + 1) + '. ER=' + ((p.engagementRate || 0)).toFixed(2) + '% | ' +
      (p.text || '').substring(0, 100) + '\n';
  });
  // 競合データ
  var targetLabel = username ? '@' + username : '競合全体';
  prompt += '\n## 競合（' + targetLabel + '）の蓄積投稿（' + competitorPosts.length + '件）\n';
  var cSample = competitorPosts.slice(0, 20);
  cSample.forEach(function(p, i) {
    prompt += (i + 1) + '. [@' + p.competitorUsername + '] likes=' + (p.likes || 0) +
      ' replies=' + (p.replies || 0) + ' | ' + (p.postText || '').substring(0, 120) + '\n';
  });
  prompt += '\n## 出力形式（Markdown）\n' +
    '1. **📊 数値比較** — 投稿頻度、反応数の差異\n' +
    '2. **📝 コンテンツ比較** — 文体、テーマ、構成の違い\n' +
    '3. **🏆 競合の強み** — 取り入れるべき要素\n' +
    '4. **💪 自分の強み** — 維持・伸ばすべきポイント\n' +
    '5. **🎯 具体的アクション（5つ）** — 明日からできる改善策\n' +
    '6. **📅 1週間チャレンジ** — 日別の具体的な行動計画\n';
  var analysis = callGemini_(apiKey, prompt, { temperature: 0.7, maxTokens: 8192 });
  return {
    targetLabel: targetLabel,
    myPostCount: (analyticsData.posts || []).length,
    competitorPostCount: competitorPosts.length,
    analysis: analysis
  };
}

function analyzeBuzzPatterns(ss, params) {
  var apiKey = getGeminiKey_(ss);
  var posts = getWatchPosts(ss, { tags: 'バズ' });
  // タグなしの場合、いいね上位を自動選定
  if (posts.length === 0) {
    var allPosts = getWatchPosts(ss, {});
    if (allPosts.length === 0) throw new Error('競合投稿の記録がありません。先に投稿を記録してください。');
    posts = allPosts.slice().sort(function(a, b) { return (b.likes || 0) - (a.likes || 0); }).slice(0, 15);
  }
  var prompt = 'あなたはバイラルコンテンツの専門家です。\n' +
    '以下のThreads高反応投稿（' + posts.length + '件）のパターンを分析してください。\n\n';
  posts.forEach(function(p, i) {
    prompt += (i + 1) + '. [@' + p.competitorUsername + '] likes=' + (p.likes || 0) +
      ' replies=' + (p.replies || 0) + ' reposts=' + (p.reposts || 0) +
      '\n   ' + (p.postText || '').substring(0, 200) + '\n\n';
  });
  prompt += '## 出力形式（Markdown）\n' +
    '1. **🔥 バズの共通パターン** — 構成、文体、長さ、トーンの共通点\n' +
    '2. **🎣 フック（書き出し）分析** — 冒頭文の特徴\n' +
    '3. **📊 数値傾向** — いいね・返信・リポストの比率傾向\n' +
    '4. **📝 テンプレート（3つ）** — パターンを応用した投稿テンプレート\n' +
    '5. **⏰ タイミング** — 投稿日時の傾向（データから判読可能な範囲）\n';
  var analysis = callGemini_(apiKey, prompt, { temperature: 0.7, maxTokens: 8192 });
  return { postCount: posts.length, analysis: analysis };
}
