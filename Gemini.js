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


