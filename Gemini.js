// ===========================================
// Gemini.gs — AI機能 統合版（Phase 2 完全実装）
// ===========================================

/**
 * Gemini APIキーを取得
 */
function getGeminiKey_(ss) {
  var settings = getSettings(ss);
  var key = settings['gemini_api_key'] || '';
  if (!key) {
    throw new Error('Gemini APIキーが設定されていません。設定画面でAPIキーを登録してください。');
  }
  return key;
}

/**
 * Gemini API 共通呼び出し
 * @param {string} apiKey
 * @param {string} prompt
 * @param {Object} options - { temperature, maxTokens }
 * @return {string} レスポンステキスト
 */
function callGemini_(apiKey, prompt, options) {
  options = options || {};
  var temperature = options.temperature != null ? options.temperature : 0.7;
  var maxTokens = options.maxTokens || 4096;
  var url = CONFIG.GEMINI_API_BASE + '?key=' + apiKey;

  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
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
    throw new Error('AI生成に失敗しました: ' + e.message);
  }
  if (body.error) {
    var errMsg = (body.error && body.error.message) ? body.error.message : 'unknown';
    throw new Error('AI生成に失敗しました: ' + errMsg);
  }

  try {
    return body.candidates[0].content.parts[0].text;
  } catch (e) {
    throw new Error('Gemini APIレスポンスの形式が不正です');
  }
}

/**
 * JSONブロックをパース（```json ... ``` 対応）
 */
function parseGeminiJson_(text) {
  var cleaned = text;
  // ```json ... ``` ブロック抽出
  var match = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    cleaned = match[1].trim();
  }
  return JSON.parse(cleaned);
}


// ===========================================
// AI投稿生成
// ===========================================

/**
 * generatePostWithAI — テーマベースの投稿生成
 * @param {Spreadsheet} ss
 * @param {Object} params - { theme, mode, count }
 * @return {Object} { results, mode, theme }
 */
function generatePostWithAI(ss, params) {
  // テーマの空チェックを最初に行う
  var theme = (params.theme || '').trim();
  if (!theme) {
    throw new Error('テーマを入力してください');
  }

  var mode = params.mode || 'normal';

  // analysis-based は専用関数に委譲
  if (mode === 'analysis-based' || mode === 'analysis') {
    return generatePostWithAnalysis(ss, params);
  }

  var apiKey = getGeminiKey_(ss);
  var count = Math.min(Math.max(parseInt(params.count) || 3, 1), 5);

  var prompt = '';
  // 切り口（angle）の補足指示マップ
  var angleInstructions = {
    'tools': 'テーマに関連する具体的なツール・サービスを紹介。名前・用途・効果を明記。',
    'howto': '手順を3〜5ステップで解説。各ステップに具体的な操作や数値を含める。',
    'mistakes': 'よくある失敗例を3つ挙げ、それぞれ原因と対策を具体的に記述。',
    'comparison': '2〜3つの選択肢を比較。料金・機能・向いている人を整理。',
    'case': '実際の活用事例を1つ詳しく紹介。Before/Afterの数値変化を含める。',
    'beginner': '初心者が今日から始められる最初の1歩を解説。専門用語は使わない。'
  };
  var angle = (params.angle || '').trim();
  var angleHint = angleInstructions[angle] || '最も有益な切り口を自動選択し、読者が保存したくなる情報密度で書く。';

  if (mode === 'thread') {
    prompt = 'あなたはThreads（テキストSNS）の投稿ライターです。\n' +
      'テーマ「' + theme + '」について、ツリー投稿（親投稿＋返信2〜3件）を' + count + 'パターン生成してください。\n\n' +
      '## 切り口の指示\n' + angleHint + '\n\n' +
      '## 必須ルール:\n' +
      '- 親投稿: 具体的な数字・ツール名・事実で興味を引く（抽象的な前置き禁止）\n' +
      '- 返信1: 詳細な手順・具体例\n' +
      '- 返信2: 読者がすぐ試せるアクションアイテム\n' +
      '- 返信3（任意）: よくある落とし穴・注意点\n' +
      '- 各投稿は500文字以内\n' +
      '- 自然な日本語、絵文字は控えめに\n\n' +
      '## 禁止事項:\n' +
      '- テーマと無関係な精神論（「継続は力なり」「やるかやらないか」等）\n' +
      '- 具体的な名詞・数字・手順を含まない抽象文\n\n' +
      '以下のJSON形式で出力:\n' +
      '```json\n[\n  {\n    "text": "親投稿テキスト",\n    "replies": ["返信1", "返信2"],\n    "reason": "この構成にした理由"\n  }\n]\n```';
  } else {
    prompt = 'あなたはThreads（テキストSNS）の投稿ライターです。\n' +
      'テーマ「' + theme + '」について、投稿を' + count + 'パターン生成してください。\n\n' +
      '## 必須ルール:\n' +
      '- 各投稿は500文字以内\n' +
      '- 冒頭で具体的な数字・ツール名・事実を提示する\n' +
      '- 各投稿に最低1つの固有名詞または数値を含める\n' +
      '- 読者の反応（いいね・返信）を得やすい文体\n' +
      '- 自然な日本語、絵文字は控えめに\n\n' +
      '## 禁止事項:\n' +
      '- テーマと無関係な精神論（「継続は力なり」「やるかやらないか」等）\n' +
      '- 具体的な名詞・数字・手順を含まない抽象文\n\n' +
      '以下のJSON形式で出力:\n' +
      '```json\n[\n  {\n    "text": "投稿テキスト",\n    "reason": "この投稿の狙い"\n  }\n]\n```';
  }

  var raw = callGemini_(apiKey, prompt, { temperature: 0.8 });
  var results;
  try {
    results = parseGeminiJson_(raw);
    // 配列でない場合の対処
    if (!Array.isArray(results)) {
      results = [results];
    }
    // スレッドモード: replies配列が存在することを保証
    if (mode === 'thread') {
      results = results.map(function(item) {
        return {
          text: item.text || '',
          replies: Array.isArray(item.replies) ? item.replies : [],
          reason: item.reason || ''
        };
      });
    }
  } catch (e) {
    Logger.log('generatePostWithAI JSON parse failed, trying fallback');
    // フォールバック: --- 区切りで分割を試行
    var parts = raw.split(/---+/).map(function(s) { return s.trim(); }).filter(Boolean);
    results = parts.map(function(part) {
      if (mode === 'thread') {
        try {
          var cleaned = part.replace(/```json\n?/g, '').replace(/```/g, '').trim();
          var json = JSON.parse(cleaned);
          return { text: json.text || part, replies: json.replies || [], reason: json.reason || 'AI生成' };
        } catch (e2) {
          return { text: part, replies: [], reason: 'JSONパース失敗' };
        }
      }
      return { text: part, reason: 'JSONパース失敗のため原文を返却' };
    });
    if (results.length === 0) {
      results = [{ text: raw, replies: mode === 'thread' ? [] : undefined, reason: 'JSONパース失敗のため原文を返却' }];
    }
  }

  // ログ記録
  try {
    storeAIGenerationLog_(ss, {
      theme: theme,
      mode: mode,
      results: results
    });
  } catch (logErr) {
    Logger.log('storeAIGenerationLog_ error: ' + logErr.message);
  }

  return {
    results: results,
    mode: mode,
    theme: theme,
    count: results.length
  };
}


// ===========================================
// 分析ベース投稿生成
// ===========================================

/**
 * generatePostWithAnalysis — 分析データを活用した投稿生成
 */
function generateAnalysisReport(ss, params) {
  var apiKey = getGeminiKey_(ss);
  params = params || {};
  var periodDays = parseInt(params.periodDays) || 30;

  // 分析データ取得
  var analyticsData;
  try {
    analyticsData = getAnalyticsData(ss, periodDays);
  } catch (e) {
    throw new Error('分析データがありません。先に「分析データ取得」を実行してください。');
  }

  if (!analyticsData || !analyticsData.posts || analyticsData.posts.length === 0) {
    throw new Error('分析データがありません。先に「分析データ取得」を実行してください。');
  }

  var summary = analyticsData.summary || {};
  var posts = analyticsData.posts || [];

  // ER順ソート
  var sorted = posts.slice().sort(function(a, b) {
    return (b.engagementRate || 0) - (a.engagementRate || 0);
  });
  var topPosts = sorted.slice(0, 5);
  var worstPosts = sorted.slice(-3).reverse();

  // 時間帯データ取得
  var timeData = null;
  try {
    timeData = getTimeAnalysisData(ss);
  } catch (e) {
    Logger.log('generateAnalysisReport: time data fetch error: ' + e.message);
  }

  // ユーザーインサイトデータ取得
  var insightData = null;
  try {
    var insightSheet = ss.getSheetByName('ユーザーインサイト');
    if (insightSheet && insightSheet.getLastRow() > 1) {
      var lastRow = insightSheet.getLastRow();
      var row = insightSheet.getRange(lastRow, 1, 1, insightSheet.getLastColumn()).getValues()[0];
      insightData = { raw: row };
    }
  } catch (e) {
    Logger.log('generateAnalysisReport: insight fetch error: ' + e.message);
  }

  // メディアタイプ別集計
  var mediaStats = {};
  posts.forEach(function(p) {
    var mt = p.mediaType || 'TEXT';
    if (!mediaStats[mt]) mediaStats[mt] = { count: 0, totalER: 0 };
    mediaStats[mt].count++;
    mediaStats[mt].totalER += (p.engagementRate || 0);
  });

  // プロンプト構築
  var prompt = 'あなたはSNSマーケティングの専門アナリストです。\n' +
    '以下のThreadsアカウントの分析データを基に、日本語で詳細なレポートを生成してください。\n\n' +
    '## 基本統計（過去' + periodDays + '日）\n' +
    '- 総投稿数: ' + (summary.totalPosts || 0) + '\n' +
    '- 平均ER: ' + ((summary.avgEngagementRate || 0) ).toFixed(2) + '%\n' +
    '- 総閲覧数: ' + (summary.totalViews || 0) + '\n' +
    '- 総いいね: ' + (summary.totalLikes || 0) + '\n' +
    '- 総返信: ' + (summary.totalReplies || 0) + '\n' +
    '- 総リポスト: ' + (summary.totalReposts || 0) + '\n' +
    '- 総シェア: ' + (summary.totalShares || 0) + '\n\n';

  prompt += '## 高ER投稿 TOP5\n';
  topPosts.forEach(function(p, i) {
    prompt += (i + 1) + '. ER=' + ((p.engagementRate || 0) ).toFixed(2) + '% | ' +
      (p.text || '').substring(0, 80) + '\n';
  });

  prompt += '\n## 低ER投稿\n';
  worstPosts.forEach(function(p, i) {
    prompt += (i + 1) + '. ER=' + ((p.engagementRate || 0) ).toFixed(2) + '% | ' +
      (p.text || '').substring(0, 80) + '\n';
  });

  prompt += '\n## メディアタイプ別\n';
  Object.keys(mediaStats).forEach(function(mt) {
    var ms = mediaStats[mt];
    var avgER = ms.count > 0 ? (ms.totalER / ms.count ).toFixed(2) : '0';
    prompt += '- ' + mt + ': ' + ms.count + '件, 平均ER=' + avgER + '%\n';
  });

  if (timeData && timeData.length > 0) {
    var topSlots = timeData.slice()
      .sort(function(a, b) { return (b.avgEngagementRate || 0) - (a.avgEngagementRate || 0); })
      .slice(0, 5);
    prompt += '\n## ゴールデンタイム\n';
    topSlots.forEach(function(slot) {
      prompt += '- ' + (slot.day || '') + ' ' + (slot.hour || '') + '時: ER=' +
        ((slot.avgEngagementRate || 0) ).toFixed(2) + '%\n';
    });
  }

  prompt += '\n## レポート出力形式\n' +
    'Markdownで以下のセクションを含めてください:\n' +
    '1. **📊 総合評価** — アカウントの現状と健全性（A〜Dランク付け）\n' +
    '2. **🏆 強みの分析** — 高ER投稿の共通パターン、得意分野\n' +
    '3. **⚠️ 課題と改善点** — 低ER投稿の原因分析、改善の方向性\n' +
    '4. **⏰ 投稿タイミング** — ゴールデンタイムの活用度と推奨スケジュール\n' +
    '5. **📈 成長戦略** — 今後2週間の具体的アクションプラン（3〜5項目）\n' +
    '6. **🎯 KPI目標** — 次の30日間の現実的な数値目標\n';

  var report = callGemini_(apiKey, prompt, { temperature: 0.6, maxTokens: 8192 });

  return {
    success: true,
    report: report,
    summary: summary,
    topPostCount: topPosts.length,
    periodDays: periodDays
  };
}


// ===========================================
// 改善提案生成
// ===========================================

/**
 * generateImprovementSuggestions — AI改善提案
 * @param {Spreadsheet} ss
 * @param {Object} params - { periodDays }
 * @return {Object} { success, suggestions, summary, erBuckets, postFrequency }
 */
function generateImprovementSuggestions(ss, params) {
  var apiKey = getGeminiKey_(ss);
  params = params || {};
  var periodDays = parseInt(params.periodDays) || 30;

  // 分析データ取得
  var analyticsData;
  try {
    analyticsData = getAnalyticsData(ss, periodDays);
  } catch (e) {
    throw new Error('分析データがありません。先に「分析データ取得」を実行してください。');
  }

  if (!analyticsData || !analyticsData.posts || analyticsData.posts.length === 0) {
    throw new Error('分析データがありません。先に「分析データ取得」を実行してください。');
  }

  var posts = analyticsData.posts || [];
  var summary = analyticsData.summary || {};

  // ER分布バケット
  var erBuckets = { zero: 0, low: 0, medium: 0, high: 0, veryHigh: 0 };
  posts.forEach(function(p) {
    var er = (p.engagementRate || 0) ;
    if (er <= 0 && !p.views && !p.likes) erBuckets.zero++;
    else if (er < 2) erBuckets.low++;
    else if (er < 5) erBuckets.medium++;
    else if (er < 10) erBuckets.high++;
    else erBuckets.veryHigh++;
  });

  // 投稿頻度計算
  var postFrequency = { postsPerDay: 0, totalDays: 0, totalPosts: posts.length };
  if (posts.length >= 2) {
    var timestamps = posts.map(function(p) { return new Date(p.timestamp).getTime(); }).filter(function(t) { return !isNaN(t); });
    if (timestamps.length >= 2) {
      var oldest = Math.min.apply(null, timestamps);
      var newest = Math.max.apply(null, timestamps);
      var days = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));
      postFrequency.totalDays = Math.round(days);
      postFrequency.postsPerDay = +(timestamps.length / days).toFixed(2);
    }
  }

  // 直近5件の投稿
  var recentPosts = posts.slice().sort(function(a, b) {
    return new Date(b.timestamp) - new Date(a.timestamp);
  }).slice(0, 5);

  // プロンプト構築
  var prompt = 'あなたはSNSグロースハッカーです。\n' +
    '以下のThreadsアカウントのデータを分析し、具体的な改善提案を日本語で生成してください。\n\n' +
    '## 基本統計\n' +
    '- 投稿数: ' + posts.length + '件（過去' + periodDays + '日）\n' +
    '- 平均ER: ' + ((summary.avgEngagementRate || 0) ).toFixed(2) + '%\n' +
    '- 投稿頻度: ' + postFrequency.postsPerDay + '件/日\n\n' +
    '## ER分布\n' +
    '- 低ER（<2%）: ' + erBuckets.low + '件\n' +
    '- 中ER（2-5%）: ' + erBuckets.medium + '件\n' +
    '- 高ER（5-10%）: ' + erBuckets.high + '件\n' +
    '- 超高ER（>10%）: ' + erBuckets.veryHigh + '件\n\n' +
    '## 直近5投稿\n';

  recentPosts.forEach(function(p, i) {
    prompt += (i + 1) + '. ER=' + ((p.engagementRate || 0) ).toFixed(2) + '% | ' +
      'views=' + (p.views || 0) + ' | ' +
      (p.text || '').substring(0, 100) + '\n';
  });

  prompt += '\n## 出力形式\n' +
    'Markdownで以下のセクションを含めてください:\n' +
    '1. **🔍 現状診断** — 投稿パターンの問題点（投稿頻度、ER分布の偏り等）\n' +
    '2. **💡 即実行できる改善（3つ）** — 今日から始められる具体的アクション\n' +
    '3. **📝 コンテンツ改善** — 文体、長さ、構成のアドバイス\n' +
    '4. **🔥 エンゲージメント向上策** — 返信・リポストを増やす戦略\n' +
    '5. **📅 投稿スケジュール提案** — 曜日・時間帯の最適化\n' +
    '6. **🎯 2週間チャレンジ** — 具体的な日別アクションプラン\n';

  var suggestions = callGemini_(apiKey, prompt, { temperature: 0.7, maxTokens: 8192 });

  return {
    success: true,
    suggestions: suggestions,
    summary: summary,
    erBuckets: erBuckets,
    postFrequency: postFrequency.postsPerDay,
    postFrequencyDetail: postFrequency
  };
}


// ===========================================
// AI投稿リファイン（編集）
// ===========================================

/**
 * refinePostWithAI — 下書きをAIで編集
 * @param {Spreadsheet} ss
 * @param {Object} params - { text, style, instruction }
 * @return {Object} { success, original, style, instruction, results }
 */
function refinePostWithAI(ss, params) {
  var apiKey = getGeminiKey_(ss);

  var text = (params.text || '').trim();
  if (!text) {
    throw new Error('編集する投稿文が空です');
  }

  var style = params.style || 'improve';
  var instruction = (params.instruction || '').trim();

  var validStyles = {
    improve:      '全体的な品質を向上させる（語彙、文法、表現力、読みやすさ）',
    shorter:      '元の内容を保ちつつ、コンパクトに要約・短縮する',
    longer:       '元の内容を膨らませ、具体例や補足を追加して拡張する',
    casual:       '親しみやすく、フレンドリーなカジュアルな文体に変更する',
    professional: 'ビジネス向けの丁寧でプロフェッショナルな文体に変更する',
    engaging:     '読者の反応（いいね・返信）を最大化するよう最適化する',
    hook:         '冒頭の1行で読者を引きつけるフック（書き出し）を強化する'
  };

  var styleDesc = validStyles[style] || validStyles['improve'];

  var prompt = 'あなたはThreads（テキストSNS）のライティング専門家です。\n\n' +
    '## 元の投稿\n' + text + '\n\n' +
    '## 編集指示\nスタイル: ' + style + ' — ' + styleDesc + '\n';

  if (instruction) {
    prompt += '追加指示: ' + instruction + '\n';
  }

  prompt += '\n## ルール\n' +
    '- 3つの異なるバリエーションを生成\n' +
    '- 各バリエーションは500文字以内\n' +
    '- 元の投稿の主旨は維持する\n' +
    '- 自然な日本語で出力\n\n' +
    '以下のJSON配列で出力:\n' +
    '```json\n[\n  {\n    "text": "編集後のテキスト",\n    "reason": "この編集の意図・変更点の説明"\n  }\n]\n```';

  var raw = callGemini_(apiKey, prompt, { temperature: 0.8 });
  var results;
  try {
    results = parseGeminiJson_(raw);
    // 配列でない場合の対処
    if (!Array.isArray(results)) {
      results = [results];
    }
  } catch (e) {
    Logger.log('refinePostWithAI JSON parse failed, creating fallback');
    // フォールバック: テキストを3分割して返す
    var lines = raw.split('\n\n').filter(function(l) { return l.trim().length > 0; });
    results = [];
    for (var i = 0; i < Math.min(lines.length, 3); i++) {
      results.push({ text: lines[i].trim(), reason: 'JSONパース失敗のためテキスト分割で返却' });
    }
    if (results.length === 0) {
      results = [{ text: raw.trim(), reason: 'JSONパース失敗のため原文を返却' }];
    }
  }

  return {
    success: true,
    original: text,
    style: style,
    instruction: instruction || null,
    results: results
  };
}

// ===========================================
// キーワードトレンドAI分析
// ===========================================

/**
 * analyzeKeywordTrend — キーワード検索結果をAIで分析
 * @param {Spreadsheet} ss
 * @param {Object} params - { keyword, posts }
 * @return {Object} { success, keyword, analysis }
 */
function storeAIGenerationLog_(ss, data) {
  try {
    if (!ss) return;

    var sheetName = 'AI生成ログ';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow([
        'timestamp', 'account_id', 'theme', 'mode',
        'text', 'reason', 'expectedER', 'bestTime',
        'mediaAdvice', 'analysisUsed'
      ]);
    }

    var account = getActiveAccount(ss);
    var accountId = account ? account.accountId || '' : '';
    var now = new Date().toISOString();
    var results = data.results || [];
    var analysisUsedStr = data.analysisUsed ? JSON.stringify(data.analysisUsed) : '';

    results.forEach(function(r) {
      sheet.appendRow([
        now,
        accountId,
        data.theme || '',
        data.mode || '',
        typeof r === 'string' ? r : (r.text || ''),
        (r && r.reason) || '',
        (r && r.expectedER) || '',
        (r && r.bestTime) || '',
        (r && r.mediaAdvice) || '',
        analysisUsedStr
      ]);
    });
  } catch (e) {
    Logger.log('storeAIGenerationLog_ error: ' + e.message);
  }
}


// ===========================================
// 分析ベース投稿生成 (C-6 fix)
// ===========================================

/**
 * generatePostWithAnalysis - 分析データを活用した投稿生成
 * @param {Spreadsheet} ss
 * @param {Object} params - { theme, count, angle }
 * @return {Object} { results, mode, theme, count, analysisUsed }
 */
function generatePostWithAnalysis(ss, params) {
  var apiKey = getGeminiKey_(ss);
  var theme = (params.theme || '').trim();
  if (!theme) throw new Error('テーマを入力してください');

  var count = Math.min(Math.max(parseInt(params.count) || 3, 1), 5);

  // 分析データ取得
  var analyticsData;
  try {
    analyticsData = getAnalyticsData(ss, 30);
  } catch (e) {
    Logger.log('generatePostWithAnalysis: analytics fetch error: ' + e.message);
    analyticsData = null;
  }

  // 時間帯データ取得
  var timeData = null;
  try {
    timeData = getTimeAnalysisData(ss);
  } catch (e) {
    Logger.log('generatePostWithAnalysis: time data fetch error: ' + e.message);
  }

  // 上位投稿を抽出
  var topPosts = [];
  var avgER = 0;
  var bestHour = '21';
  if (analyticsData && analyticsData.posts && analyticsData.posts.length > 0) {
    var sorted = analyticsData.posts.slice().sort(function(a, b) {
      return (b.engagementRate || 0) - (a.engagementRate || 0);
    });
    topPosts = sorted.slice(0, 5);
    avgER = (analyticsData.summary && analyticsData.summary.avgEngagementRate) || 0;
  }

  // 最適時間帯を抽出
  if (timeData && timeData.matrix && timeData.hasData) {
    var bestVal = 0;
    Object.keys(timeData.matrix).forEach(function(day) {
      Object.keys(timeData.matrix[day]).forEach(function(hour) {
        var val = timeData.matrix[day][hour] || 0;
        if (val > bestVal) {
          bestVal = val;
          bestHour = hour;
        }
      });
    });
  }

  // 切り口指示
  var angleInstructions = {
    'tools': 'テーマに関連する具体的なツール・サービスを紹介。',
    'howto': '手順を3〜5ステップで解説。',
    'mistakes': 'よくある失敗例を3つ挙げ、原因と対策を記述。',
    'comparison': '2〜3つの選択肢を比較。',
    'case': '実際の活用事例を紹介。',
    'beginner': '初心者が今日から始められる最初の1歩を解説。'
  };
  var angle = (params.angle || '').trim();
  var angleHint = angleInstructions[angle] || '';

  // プロンプト構築
  var prompt = 'あなたはThreads（テキストSNS）の投稿ライターです。\n' +
    'テーマ「' + theme + '」について、投稿を' + count + 'パターン生成してください。\n\n';

  if (topPosts.length > 0) {
    prompt += '## このアカウントの高ER投稿の特徴\n' +
      '平均ER: ' + avgER.toFixed(2) + '%\n';
    topPosts.forEach(function(p, i) {
      prompt += (i + 1) + '. [ER ' + (p.engagementRate || 0).toFixed(1) + '%] ' +
        (p.text || '').substring(0, 80) + '\n';
    });
    prompt += '\n上記の成功パターン（文体・長さ・構成）を参考にしてください。\n\n';
  }

  prompt += '## 推奨投稿時間: ' + bestHour + '時台\n\n';

  if (angleHint) {
    prompt += '## 切り口の指示\n' + angleHint + '\n\n';
  }

  prompt += '## 必須ルール:\n' +
    '- 各投稿は500文字以内\n' +
    '- 冒頭で具体的な数字・ツール名・事実を提示する\n' +
    '- 読者の反応（いいね・返信）を得やすい文体\n' +
    '- 自然な日本語、絵文字は控えめに\n\n' +
    '## 禁止事項:\n' +
    '- テーマと無関係な精神論\n' +
    '- 具体的な名詞・数字・手順を含まない抽象文\n\n' +
    '以下のJSON形式で出力:\n' +
    '`json\n[\n  {\n    "text": "投稿テキスト",\n    "reason": "この投稿の狙い",\n    "expectedER": "予想ER（例: 5-8%）",\n    "bestTime": "推奨投稿時間"\n  }\n]\n`';

  var raw = callGemini_(apiKey, prompt, { temperature: 0.8 });
  var results;
  try {
    results = parseGeminiJson_(raw);
    if (!Array.isArray(results)) results = [results];
  } catch (e) {
    Logger.log('generatePostWithAnalysis JSON parse failed');
    results = [{ text: raw, reason: 'JSONパース失敗のため原文を返却' }];
  }

  // ログ記録
  try {
    storeAIGenerationLog_(ss, {
      theme: theme,
      mode: 'analysis-based',
      results: results,
      analysisUsed: {
        topPostCount: topPosts.length,
        avgER: avgER,
        bestHour: bestHour
      }
    });
  } catch (logErr) {
    Logger.log('storeAIGenerationLog_ error: ' + logErr.message);
  }

  return {
    results: results,
    mode: 'analysis-based',
    theme: theme,
    count: results.length,
    analysisUsed: {
      topPostCount: topPosts.length,
      avgER: avgER,
      bestHour: bestHour
    }
  };
}
