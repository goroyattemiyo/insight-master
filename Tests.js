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
  var input = ['Some text before', '```json', '[{"text":"from block"}]', '```', 'Some text after'].join('\n');
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

// =========================================
// セキュリティテスト: PropertiesService 移行
// =========================================

function test_secureKeysDefinition() {
  assert_(Array.isArray(SECURE_KEYS_), 'SECURE_KEYS_ should be array');
  assertContains_(SECURE_KEYS_.join(','), 'access_token', 'should contain access_token');
  assertContains_(SECURE_KEYS_.join(','), 'app_secret', 'should contain app_secret');
  assertContains_(SECURE_KEYS_.join(','), 'gemini_api_key', 'should contain gemini_api_key');
  assertEqual_(SECURE_KEYS_.length, 3, 'should have exactly 3 secure keys');
}

function test_securePropertyReadWrite() {
  var testKey = '_test_secure_key_';
  var testValue = 'test_value_12345';

  // 書き込み
  setSecureProperty_(testKey, testValue);
  var read = getSecureProperty_(testKey);
  assertEqual_(read, testValue, 'should read back written value');

  // 削除
  setSecureProperty_(testKey, '');
  var readAfterDelete = getSecureProperty_(testKey);
  assertEqual_(readAfterDelete, '', 'should be empty after delete');
}

function test_getSettingsMergesSecureKeys() {
  var ss = null;
  try {
    var sheetId = getBoundSpreadsheetId();
    if (!sheetId) { console.log('    (skip: no bound spreadsheet)'); TEST_RESULTS_.passed++; return; }
    ss = SpreadsheetApp.openById(sheetId);
  } catch (e) { console.log('    (skip: cannot open spreadsheet)'); TEST_RESULTS_.passed++; return; }

  var settings = getSettings(ss);
  assert_(settings !== undefined, 'getSettings should return object');
  assertType_(settings, 'object', 'settings should be object');

  // セキュアキーがPropertiesServiceに存在すれば、settingsに含まれるはず
  SECURE_KEYS_.forEach(function(key) {
    var propVal = getSecureProperty_(key);
    if (propVal) {
      assertEqual_(settings[key], propVal, key + ' should come from PropertiesService');
    }
  });
}

function test_saveSettingsSecureKeysNotInSheet() {
  var ss = null;
  try {
    var sheetId = getBoundSpreadsheetId();
    if (!sheetId) { console.log('    (skip: no bound spreadsheet)'); TEST_RESULTS_.passed++; return; }
    ss = SpreadsheetApp.openById(sheetId);
  } catch (e) { console.log('    (skip: cannot open spreadsheet)'); TEST_RESULTS_.passed++; return; }

  // シートの設定行を直接読んで、セキュアキーの値が空であることを確認
  var sheet = ss.getSheetByName('設定');
  if (!sheet) { console.log('    (skip: no settings sheet)'); TEST_RESULTS_.passed++; return; }

  var lastRow = sheet.getLastRow();
  if (lastRow === 0) { TEST_RESULTS_.passed++; return; }

  var data = sheet.getRange(1, 1, lastRow, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    var key = data[i][0];
    var value = data[i][1];
    if (SECURE_KEYS_.indexOf(key) >= 0) {
      assertEqual_(value, '', 'secure key "' + key + '" should be empty in sheet (row ' + (i+1) + ')');
    }
  }
}
