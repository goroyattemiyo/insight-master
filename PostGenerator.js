/**
 * 分析データを組み込んだAI投稿生成
 */
function generatePostWithAnalysis(ss, params) {
  var theme = params.theme || '';
  var count = params.count || 3;
  
  var settings = getSettings(ss);
  var geminiKey = settings.gemini_api_key;
  if (!geminiKey) throw new Error('Gemini APIキーが未設定です');
  
  // --- 分析データ収集 ---
  var analyticsData = getAnalyticsData(ss, 30);
  var posts = analyticsData.posts || [];
  var summary = analyticsData.summary || {};
  
  // 高ER投稿TOP5を抽出
  var topPosts = posts
    .filter(function(p) { return p.engagementRate > 0; })
    .sort(function(a, b) { return b.engagementRate - a.engagementRate; })
    .slice(0, 5);
  
  // 時間帯分析
  var timeData = null;
  try { timeData = getTimeAnalysisData(ss); } catch(e) {}
  
  // デモグラフィクス
  var insightSheet = ss.getSheetByName('ユーザーインサイト');
  var demographics = null;
  if (insightSheet && insightSheet.getLastRow() > 1) {
    try {
      var lastRow = insightSheet.getLastRow();
      var headers = insightSheet.getRange(1, 1, 1, insightSheet.getLastColumn()).getValues()[0];
      var row = insightSheet.getRange(lastRow, 1, 1, insightSheet.getLastColumn()).getValues()[0];
      demographics = {};
      for (var i = 0; i < headers.length; i++) {
        if (headers[i].toString().indexOf('demo_') === 0 || 
            headers[i].toString().indexOf('country') !== -1 ||
            headers[i].toString().indexOf('age') !== -1 ||
            headers[i].toString().indexOf('gender') !== -1) {
          demographics[headers[i]] = row[i];
        }
      }
    } catch(e) {}
  }
  
  // --- プロンプト構築 ---
  var prompt = 'あなたはThreads（Meta社のSNS）の投稿コンサルタントです。\n';
  prompt += 'ユーザーのアカウント分析データに基づき、高エンゲージメントが期待できる投稿を生成してください。\n\n';
  
  prompt += '## アカウント分析サマリー（直近30日）\n';
  prompt += '- 総投稿数: ' + (summary.totalPosts || 0) + '件\n';
  prompt += '- 平均エンゲージメント率: ' + (summary.avgEngagementRate || 0) + '%\n';
  prompt += '- 総ビュー数: ' + (summary.totalViews || 0).toLocaleString() + '\n';
  prompt += '- 総いいね数: ' + (summary.totalLikes || 0).toLocaleString() + '\n';
  prompt += '- 総返信数: ' + (summary.totalReplies || 0).toLocaleString() + '\n';
  prompt += '- 総リポスト数: ' + (summary.totalReposts || 0).toLocaleString() + '\n';
  prompt += '- 総シェア数: ' + (summary.totalShares || 0).toLocaleString() + '\n\n';
  
  if (topPosts.length > 0) {
    prompt += '## 高エンゲージメント投稿TOP' + topPosts.length + '\n';
    topPosts.forEach(function(p, i) {
      var text = (p.text || '').substring(0, 150);
      prompt += (i+1) + '. 「' + text + '」\n';
      prompt += '   ER: ' + p.engagementRate.toFixed(1) + '% | ';
      prompt += '👁' + (p.views || 0) + ' ❤️' + (p.likes || 0) + ' 💬' + (p.replies || 0) + ' 🔄' + (p.reposts || 0) + '\n';
      prompt += '   メディア: ' + (p.mediaType || 'TEXT') + ' | 投稿時間: ' + (p.timestamp ? new Date(p.timestamp).toLocaleString('ja-JP') : '不明') + '\n\n';
    });
  }
  
  // ゴールデンタイム
  if (timeData && timeData.heatmap) {
    prompt += '## 投稿時間ヒートマップ分析\n';
    var bestSlots = [];
    var days = ['月', '火', '水', '木', '金', '土', '日'];
    for (var d = 0; d < 7; d++) {
      for (var h = 0; h < 24; h++) {
        var val = timeData.heatmap[d] && timeData.heatmap[d][h];
        if (val && val.avgER > 0) {
          bestSlots.push({ day: days[d], hour: h, er: val.avgER, count: val.count });
        }
      }
    }
    bestSlots.sort(function(a, b) { return b.er - a.er; });
    var topSlots = bestSlots.slice(0, 5);
    if (topSlots.length > 0) {
      prompt += 'ゴールデンタイム（ER上位5枠）:\n';
      topSlots.forEach(function(s) {
        prompt += '- ' + s.day + '曜 ' + s.hour + '時台: 平均ER ' + s.er.toFixed(1) + '%（' + s.count + '投稿）\n';
      });
      prompt += '\n';
    }
  }
  
  // デモグラフィクス
  if (demographics && Object.keys(demographics).length > 0) {
    prompt += '## フォロワー属性\n';
    for (var key in demographics) {
      if (demographics[key]) {
        prompt += '- ' + key + ': ' + demographics[key] + '\n';
      }
    }
    prompt += '\n';
  }
  
  prompt += '## 生成リクエスト\n';
  prompt += 'テーマ: 「' + theme + '」\n\n';
  prompt += '上記の分析データを踏まえ、以下の条件で投稿案を' + count + 'つ生成してください：\n';
  prompt += '1. 高ER投稿の文体・構造・トーンを参考にする\n';
  prompt += '2. フォロワー属性に合った内容にする\n';
  prompt += '3. ゴールデンタイムに投稿することを前提に話題を選ぶ\n';
  prompt += '4. 各投稿に「なぜこの構成にしたか」の理由を添える\n';
  prompt += '5. 500文字以内の投稿にする\n\n';
  prompt += '以下のJSON形式で返してください：\n';
  prompt += '```json\n';
  prompt += '[\n';
  prompt += '  {\n';
  prompt += '    "text": "投稿本文",\n';
  prompt += '    "reason": "この投稿案の根拠（どの分析データに基づいているか）",\n';
  prompt += '    "expectedER": "予想ER（例: 5-7%）",\n';
  prompt += '    "bestTime": "推奨投稿時間（例: 水曜20時）",\n';
  prompt += '    "mediaAdvice": "画像やメディアの提案"\n';
  prompt += '  }\n';
  prompt += ']\n';
  prompt += '```';
  
  // --- Gemini API 呼び出し ---
  var url = CONFIG.GEMINI_API_BASE + '?key=' + geminiKey;
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 3000 }
  };
  var fetchOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };

  var body = fetchJsonWithRetry_(url, fetchOptions);
  var rawText = '';
  if (body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts) {
    rawText = body.candidates[0].content.parts[0].text;
  }
  
  // JSONパース試行
  var results = [];
  try {
    var jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      results = JSON.parse(jsonMatch[0]);
    }
  } catch(e) {
    // JSONパース失敗時はテキストをそのまま返す
    results = [{ text: rawText, reason: 'AI生成結果（JSON解析不可のため原文表示）' }];
  }
  
    // --- 生成ログ保存 ---
  storeAIGenerationLog_(ss, {
    theme: theme,
    mode: 'analysis-based',
    results: results,
    analysisUsed: {
      totalPosts: summary.totalPosts || 0,
      avgER: summary.avgEngagementRate || 0,
      topPostCount: topPosts.length
    }
  });

  return {
    mode: 'analysis-based',
    results: results,
    analysisUsed: {
      totalPosts: summary.totalPosts || 0,
      avgER: summary.avgEngagementRate || 0,
      topPostCount: topPosts.length,
      hasTimeData: !!(timeData && timeData.heatmap),
      hasDemographics: !!(demographics && Object.keys(demographics).length > 0)
    }
  };
}
/**
 * AI生成ログをシートに自動保存
 */
function storeAIGenerationLog_(ss, data) {
  try {
    var sheetName = 'AI生成ログ';
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, 10).setValues([[
        'generated_at',
        'account_id',
        'theme',
        'mode',
        'post_text',
        'reason',
        'expected_er',
        'best_time',
        'media_advice',
        'analysis_summary'
      ]]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    }
    
    var now = new Date().toISOString();
    var accountId = '';
    try {
      var active = getActiveAccount(ss);
      if (active && active.accountId) accountId = active.accountId;
    } catch(e) {}
    
    var analysisSummary = '';
    if (data.analysisUsed) {
      analysisSummary = '投稿' + (data.analysisUsed.totalPosts || 0) + '件分析 / ' +
        '平均ER ' + (data.analysisUsed.avgER || 0) + '% / ' +
        'TOP' + (data.analysisUsed.topPostCount || 0) + '参考';
    }
    
    var rows = [];
    var results = data.results || [];
    
    for (var i = 0; i < results.length; i++) {
      var item = results[i];
      var text = '';
      
      if (data.mode === 'thread' && item.parent) {
        text = '【親】' + item.parent + '\n' + (item.replies || []).map(function(r, ri) { 
          return '【返信' + (ri+1) + '】' + r; 
        }).join('\n');
      } else {
        text = item.text || (typeof item === 'string' ? item : JSON.stringify(item));
      }
      
      rows.push([
        now,
        accountId,
        data.theme || '',
        data.mode || 'normal',
        text,
        item.reason || '',
        item.expectedER || '',
        item.bestTime || '',
        item.mediaAdvice || '',
        analysisSummary
      ]);
    }
    
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
    }
    
  } catch(e) {
    Logger.log('storeAIGenerationLog_ error: ' + e.message);
  }
}
