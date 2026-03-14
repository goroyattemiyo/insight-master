// ===========================================
// TestRunner.js - GAS内テストフレームワーク
// ===========================================

/**
 * テスト結果を蓄積するグローバル変数
 */
var TEST_RESULTS_ = { passed: 0, failed: 0, errors: [] };

/**
 * テスト実行のリセット
 */
function resetTestResults_() {
  TEST_RESULTS_ = { passed: 0, failed: 0, errors: [] };
}

/**
 * アサーション: 値が truthy であること
 */
function assert_(condition, message) {
  if (condition) {
    TEST_RESULTS_.passed++;
  } else {
    TEST_RESULTS_.failed++;
    TEST_RESULTS_.errors.push('FAIL: ' + (message || 'assertion failed'));
  }
}

/**
 * アサーション: 2値が等しいこと
 */
function assertEqual_(actual, expected, message) {
  var pass = (actual === expected);
  if (!pass && typeof actual === 'object' && typeof expected === 'object') {
    pass = JSON.stringify(actual) === JSON.stringify(expected);
  }
  if (pass) {
    TEST_RESULTS_.passed++;
  } else {
    TEST_RESULTS_.failed++;
    TEST_RESULTS_.errors.push('FAIL: ' + (message || '') + ' — expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual));
  }
}

/**
 * アサーション: 値が指定型であること
 */
function assertType_(value, expectedType, message) {
  if (typeof value === expectedType) {
    TEST_RESULTS_.passed++;
  } else {
    TEST_RESULTS_.failed++;
    TEST_RESULTS_.errors.push('FAIL: ' + (message || '') + ' — expected type: ' + expectedType + ', got: ' + typeof value);
  }
}

/**
 * アサーション: 文字列に部分文字列が含まれること
 */
function assertContains_(str, substring, message) {
  if (typeof str === 'string' && str.indexOf(substring) >= 0) {
    TEST_RESULTS_.passed++;
  } else {
    TEST_RESULTS_.failed++;
    TEST_RESULTS_.errors.push('FAIL: ' + (message || '') + ' — "' + substring + '" not found in "' + String(str).substring(0, 100) + '"');
  }
}

/**
 * アサーション: 関数が例外をスローすること
 */
function assertThrows_(fn, message) {
  try {
    fn();
    TEST_RESULTS_.failed++;
    TEST_RESULTS_.errors.push('FAIL: ' + (message || 'expected exception') + ' — no exception thrown');
  } catch (e) {
    TEST_RESULTS_.passed++;
  }
}

/**
 * アサーション: 数値が範囲内であること
 */
function assertInRange_(value, min, max, message) {
  if (typeof value === 'number' && value >= min && value <= max) {
    TEST_RESULTS_.passed++;
  } else {
    TEST_RESULTS_.failed++;
    TEST_RESULTS_.errors.push('FAIL: ' + (message || '') + ' — ' + value + ' not in range [' + min + ', ' + max + ']');
  }
}

/**
 * 単一テスト関数を安全に実行
 */
function runTest_(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
  } catch (e) {
    TEST_RESULTS_.failed++;
    TEST_RESULTS_.errors.push('ERROR: ' + name + ' — ' + e.message);
    console.error('  ✗ ' + name + ': ' + e.message);
  }
}

/**
 * 全テストを実行（GASエディタから直接実行）
 */
function runAllTests() {
  resetTestResults_();
  console.log('========================================');
  console.log('Insight Master テスト実行');
  console.log('日時: ' + new Date().toLocaleString('ja-JP'));
  console.log('========================================');

  // --- 純ロジックテスト ---
  console.log('\n[純ロジックテスト]');
  runTest_('test_parseGeminiJson_normal', test_parseGeminiJson_normal);
  runTest_('test_parseGeminiJson_codeBlock', test_parseGeminiJson_codeBlock);
  runTest_('test_parseGeminiJson_invalid', test_parseGeminiJson_invalid);
  runTest_('test_erCalculation', test_erCalculation);
  runTest_('test_growthScoreRange', test_growthScoreRange);
  runTest_('test_growthScoreEdgeCases', test_growthScoreEdgeCases);

  // --- 設定整合性テスト ---
  console.log('\n[設定整合性テスト]');
  runTest_('test_configEndpoints', test_configEndpoints);
  runTest_('test_configModelVersion', test_configModelVersion);
  runTest_('test_settingsKeyConsistency', test_settingsKeyConsistency);

  // --- API統合テスト (スプレッドシート依存) ---
  console.log('\n[統合テスト]');
  runTest_('test_getAnalyticsData_periodAll', test_getAnalyticsData_periodAll);
  runTest_('test_getAnalyticsData_periodNumber', test_getAnalyticsData_periodNumber);
  runTest_('test_sheetsInitialization', test_sheetsInitialization);

  // --- セキュリティテスト ---
  console.log('\n[セキュリティテスト]');
  runTest_('test_secureKeysDefinition', test_secureKeysDefinition);
  runTest_('test_securePropertyReadWrite', test_securePropertyReadWrite);
  runTest_('test_getSettingsMergesSecureKeys', test_getSettingsMergesSecureKeys);
  runTest_('test_saveSettingsSecureKeysNotInSheet', test_saveSettingsSecureKeysNotInSheet);

  // --- 結果サマリー ---
  console.log('\n========================================');
  console.log('結果: ' + TEST_RESULTS_.passed + ' passed, ' + TEST_RESULTS_.failed + ' failed, ' + (TEST_RESULTS_.passed + TEST_RESULTS_.failed) + ' total');
  if (TEST_RESULTS_.errors.length > 0) {
    console.log('\n失敗詳細:');
    TEST_RESULTS_.errors.forEach(function(e) { console.log('  ' + e); });
  }
  console.log('========================================');

  return {
    passed: TEST_RESULTS_.passed,
    failed: TEST_RESULTS_.failed,
    total: TEST_RESULTS_.passed + TEST_RESULTS_.failed,
    errors: TEST_RESULTS_.errors
  };
}
