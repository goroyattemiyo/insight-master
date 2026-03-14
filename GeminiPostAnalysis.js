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
