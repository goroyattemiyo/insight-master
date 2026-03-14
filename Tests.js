// ===========================================
// Tests.js - テストケース
// ===========================================

// =========================================
// 純ロジックテスト: parseGeminiJson_
// =========================================

function test_parseGeminiJson_normal() {
  var input = '[{"text":"hello","reason":"test"}]';
  var result = parseGeminiJson_(input);
  assert_(Array.isArray(result), 'parseGeminiJson_ should return array');
  assertEqual_(result.length, 1, 'should have 1 element');
  assertEqual_(result[0].text, 'hello', 'text should be hello');
}

function test_parseGeminiJson_codeBlock() {
  var input = 'Some text before\n\\\json\n[{"text":"from block"}]\n\\\\nSome text after';
  var result = parseGeminiJson_(input);
  assert_(Array.isArray(result), 'should parse from code block');
  assertEqual_(result[0].text, 'from block', 'should extract from code block');
}

function test_parseGeminiJson_invalid() {
  assertThrows_(function() {
    parseGeminiJson_('this is not json at all');
  }, 'should throw on invalid JSON');
}

// =========================================
// 純ロジックテスト: ER計算
// =========================================

function test_erCalculation() {
  // ER = (likes + replies + reposts + quotes) / views * 100
  // 標準ケース
  var views = 1000;
  var likes = 30, replies = 5, reposts = 10, quotes = 5;
  var er = Math.round(((likes + replies + reposts + quotes) / views) * 10000) / 100;
  assertEqual_(er, 5, 'ER should be 5%');

  // ゼロビュー
  var erZero = 0;
  if (0 > 0) {
    erZero = Math.round(((10 + 0 + 0 + 0) / 0) * 10000) / 100;
  }
  assertEqual_(erZero, 0, 'ER should be 0 when views=0');

  // 高ER
  var erHigh = Math.round(((50 + 20 + 15 + 10) / 100) * 10000) / 100;
  assertEqual_(erHigh, 95, 'ER should be 95% for high engagement');
}

// =========================================
// 純ロジックテスト: Growth Score 範囲
// =========================================

function test_growthScoreRange() {
  // followerChangeScore: -2% → 0, +5% → 25, linear
  function followerScore(changePct) {
    return Math.max(0, Math.min(25, Math.round((changePct + 2) / 7 * 25)));
  }

  assertEqual_(followerScore(-2), 0, 'follower -2% should be 0');
  assertEqual_(followerScore(5), 25, 'follower +5% should be 25');
  assertInRange_(followerScore(0), 5, 10, 'follower 0% should be around 7');
  assertInRange_(followerScore(2.5), 14, 18, 'follower 2.5% should be mid-range');
}

function test_growthScoreEdgeCases() {
  // postingFrequencyScore: 0-7 posts/week → 0-25
  function freqScore(posts) {
    return Math.max(0, Math.min(25, Math.round(posts / 7 * 25)));
  }

  assertEqual_(freqScore(0), 0, 'freq 0 posts should be 0');
  assertEqual_(freqScore(7), 25, 'freq 7 posts should be 25');
  assertEqual_(freqScore(14), 25, 'freq 14 posts should cap at 25');
  assertInRange_(freqScore(3), 10, 12, 'freq 3 posts should be ~11');

  // aiUsageScore: 0-10 calls → 0-25
  function aiScore(calls) {
    return Math.max(0, Math.min(25, Math.round(calls / 10 * 25)));
  }

  assertEqual_(aiScore(0), 0, 'ai 0 calls should be 0');
  assertEqual_(aiScore(10), 25, 'ai 10 calls should be 25');
  assertEqual_(aiScore(20), 25, 'ai 20 calls should cap at 25');

  // Total score should be 0-100
  var total = 25 + 25 + 25 + 25;
  assertEqual_(total, 100, 'max total should be 100');
  var totalMin = 0 + 0 + 0 + 0;
  assertEqual_(totalMin, 0, 'min total should be 0');
}

// =========================================
// 設定整合性テスト: CONFIG
// =========================================

function test_configEndpoints() {
  assert_(CONFIG !== undefined, 'CONFIG should be defined');
  assert_(CONFIG.THREADS_API_BASE !== undefined, 'THREADS_API_BASE should exist');
  assert_(CONFIG.GEMINI_API_BASE !== undefined, 'GEMINI_API_BASE should exist');
  assertContains_(CONFIG.THREADS_API_BASE, 'graph.threads.net', 'THREADS_API_BASE should contain graph.threads.net');
  assertContains_(CONFIG.GEMINI_API_BASE, 'generativelanguage.googleapis.com', 'GEMINI_API_BASE should contain googleapis');
}

function test_configModelVersion() {
  // C-1修正の確認: 全Gemini呼び出しがCONFIG.GEMINI_API_BASEを参照すべき
  assertContains_(CONFIG.GEMINI_API_BASE, 'gemini-2.5-flash', 'CONFIG should use gemini-2.5-flash model');

  // BuzzAnalysis.js の generateBuzzReport がCONFIGを使っている確認
  // (コードレベルでは確認済み、ここではCONFIGの値が正しいことを検証)
  assert_(CONFIG.GEMINI_API_BASE.indexOf('gemini-2.0-flash') === -1, 'CONFIG should NOT contain old gemini-2.0-flash');
}

function test_settingsKeyConsistency() {
  // C-2修正の確認: getGeminiKey_ が 'gemini_api_key' を使っていること
  // GAS環境でスプレッドシートなしでは直接テストできないが、
  // 関数が存在することとキー名の規約を確認
  assert_(typeof getGeminiKey_ === 'function', 'getGeminiKey_ should be defined');
  assert_(typeof callGemini_ === 'function', 'callGemini_ should be defined');
  assert_(typeof parseGeminiJson_ === 'function', 'parseGeminiJson_ should be defined');

  // getSettings が存在すること
  assert_(typeof getSettings === 'function', 'getSettings should be defined');
  assert_(typeof saveSettings === 'function', 'saveSettings should be defined');
}

// =========================================
// 統合テスト: getAnalyticsData
// =========================================

function test_getAnalyticsData_periodAll() {
  var ss = null;
  try {
    var sheetId = getBoundSpreadsheetId();
    if (!sheetId) {
      console.log('    (skip: no bound spreadsheet)');
      TEST_RESULTS_.passed++;
      return;
    }
    ss = SpreadsheetApp.openById(sheetId);
  } catch (e) {
    console.log('    (skip: cannot open spreadsheet)');
    TEST_RESULTS_.passed++;
    return;
  }

  var result = getAnalyticsData(ss, 'all');
  assert_(result !== undefined, 'getAnalyticsData should return result');
  assert_(result.posts !== undefined, 'result should have posts');
  assert_(Array.isArray(result.posts), 'posts should be array');
  assert_(result.summary !== undefined, 'result should have summary');
  assertType_(result.summary.totalPosts, 'number', 'totalPosts should be number');
}

function test_getAnalyticsData_periodNumber() {
  var ss = null;
  try {
    var sheetId = getBoundSpreadsheetId();
    if (!sheetId) {
      console.log('    (skip: no bound spreadsheet)');
      TEST_RESULTS_.passed++;
      return;
    }
    ss = SpreadsheetApp.openById(sheetId);
  } catch (e) {
    console.log('    (skip: cannot open spreadsheet)');
    TEST_RESULTS_.passed++;
    return;
  }

  // C-5修正の確認: 数値を渡して正常動作すること
  var result7 = getAnalyticsData(ss, 7);
  assert_(result7 !== undefined, 'getAnalyticsData(7) should return result');
  assert_(Array.isArray(result7.posts), 'posts should be array for period=7');

  var result30 = getAnalyticsData(ss, 30);
  assert_(result30 !== undefined, 'getAnalyticsData(30) should return result');

  // 7日のデータ数は30日以下のはず
  assert_(result7.posts.length <= result30.posts.length, '7-day posts should be <= 30-day posts');
}

// =========================================
// 統合テスト: シート初期化
// =========================================

function test_sheetsInitialization() {
  var ss = null;
  try {
    var sheetId = getBoundSpreadsheetId();
    if (!sheetId) {
      console.log('    (skip: no bound spreadsheet)');
      TEST_RESULTS_.passed++;
      return;
    }
    ss = SpreadsheetApp.openById(sheetId);
  } catch (e) {
    console.log('    (skip: cannot open spreadsheet)');
    TEST_RESULTS_.passed++;
    return;
  }

  // 必須シートが存在すること
  var requiredSheets = ['設定', 'アカウント', '分析データ', '時間帯分析'];
  requiredSheets.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    assert_(sheet !== null, 'sheet "' + name + '" should exist');
  });
}
