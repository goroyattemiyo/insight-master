// ===========================================
// Sheets.gs - スプレッドシート初期化・設定管理
// ===========================================

/**
 * セキュアキー: PropertiesServiceに保存し、シートには残さない
 */
var SECURE_KEYS_ = ['access_token', 'app_secret', 'gemini_api_key'];

/**
 * スプレッドシートID検証
 */
function validateSheetId(sheetId) {
  try {
    if (!sheetId) return { valid: false, error: 'シートIDが空です' };
    var ss = SpreadsheetApp.openById(sheetId);
    initializeSheets(ss);
    return { valid: true, name: ss.getName() };
  } catch (e) {
    return { valid: false, error: 'スプレッドシートにアクセスできません。URLを確認してください。' };
  }
}

/**
 * 必要なシートをすべて初期化
 */
function initializeSheets(ss) {
  if (!ss) { console.error('initializeSheets: ss is undefined'); return; }

  var requiredSheets = [
    {
      name: '設定',
      headers: null,
      initialData: [
        ['app_id', ''],
        ['app_secret', ''],
        ['access_token', ''],
        ['user_id', ''],
        ['token_expires', ''],
        ['username', ''],
        ['profile_pic_url', ''],
        ['setup_completed', 'FALSE'],
        ['spreadsheet_url', ''],
        ['app_url', ''],
        ['active_account', ''],
        ['gemini_api_key', ''],
      ]
    },
    {
      name: 'アカウント',
      headers: ['account_id', 'access_token', 'user_id', 'username', 'profile_pic_url', 'token_expires', 'created_at']
    },
    {
      name: '分析データ',
      headers: ['post_id', 'account_id', 'text', 'media_type', 'timestamp', 'views', 'likes', 'replies', 'reposts', 'quotes', 'shares', 'engagement_rate', 'permalink', 'is_quote_post', 'topic_tag', 'fetched_at']
    },
    {
      name: '時間帯分析',
      headers: ['account_id', '曜日', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23']
    },
    {
      name: 'ユーザーインサイト',
      headers: ['account_id', 'date', 'views', 'likes', 'replies', 'reposts', 'quotes', 'clicks', 'followers_count', 'fetched_at']
    },
    {
      name: '下書き',
      headers: ['draft_id', 'account_id', 'text', 'type', 'created_at', 'status', 'source']
    },
    {
      name: '競合アカウント',
      headers: ['competitor_id', 'account_id', 'username', 'display_name', 'category', 'followers_count', 'followers_updated', 'memo', 'created_at']
    },
    {
      name: '競合ウォッチ',
      headers: ['watch_id', 'account_id', 'competitor_username', 'post_url', 'post_text', 'media_type', 'likes', 'replies', 'reposts', 'post_date', 'tags', 'memo', 'created_at']
    },
    {
      name: 'キーワード検索',
      headers: ['account_id', 'keyword', 'search_mode', 'search_type', 'post_id', 'username', 'text', 'media_type', 'permalink', 'timestamp', 'has_replies', 'is_quote_post', 'is_reply', 'fetched_at']
    },
    {
      name: '検索履歴',
      headers: ['account_id', 'keyword', 'search_mode', 'result_count', 'searched_at']
    }
  ];

  requiredSheets.forEach(function(sheetDef) {
    var sheet = ss.getSheetByName(sheetDef.name);
    if (!sheet) {
      sheet = ss.insertSheet(sheetDef.name);
      if (sheetDef.initialData) {
        sheet.getRange(1, 1, sheetDef.initialData.length, sheetDef.initialData[0].length)
          .setValues(sheetDef.initialData);
      } else if (sheetDef.headers) {
        sheet.getRange(1, 1, 1, sheetDef.headers.length)
          .setValues([sheetDef.headers]);
        sheet.getRange(1, 1, 1, sheetDef.headers.length)
          .setFontWeight('bold');
      }
    } else {
      if (sheetDef.name === '設定') {
        ensureSettingsKeys_(sheet, sheetDef.initialData);
      } else if (sheetDef.headers) {
        ensureSheetHeaders_(sheet, sheetDef.headers);
      }
    }
  });

  // 初回マイグレーション: シートに残っているセキュアキーをPropertiesServiceに移行
  migrateSecureKeys_(ss);
}

/**
 * シートヘッダーの不足列を追加（内部用）
 */
function ensureSheetHeaders_(sheet, requiredHeaders) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold');
    return;
  }
  var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header) {
    if (currentHeaders.indexOf(header) === -1) {
      var newCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newCol).setValue(header).setFontWeight('bold');
    }
  });
}

/**
 * 設定キーの不足行を追加（内部用）
 */
function ensureSettingsKeys_(sheet, requiredKeys) {
  var data = sheet.getDataRange().getValues();
  var existingKeys = data.map(function(row) { return row[0]; });
  requiredKeys.forEach(function(keyValue) {
    if (existingKeys.indexOf(keyValue[0]) === -1) {
      sheet.appendRow(keyValue);
    }
  });
}

// ===========================================
// セキュアキーの PropertiesService 管理
// ===========================================

/**
 * セキュアキーを PropertiesService から取得
 */
function getSecureProperty_(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (e) {
    console.error('getSecureProperty_ error for ' + key + ':', e.message);
    return '';
  }
}

/**
 * セキュアキーを PropertiesService に保存
 */
function setSecureProperty_(key, value) {
  try {
    if (value === '' || value === null || value === undefined) {
      PropertiesService.getScriptProperties().deleteProperty(key);
    } else {
      PropertiesService.getScriptProperties().setProperty(key, String(value));
    }
  } catch (e) {
    console.error('setSecureProperty_ error for ' + key + ':', e.message);
  }
}

/**
 * シートに残っているセキュアキーを PropertiesService に移行し、シートからは削除
 */
function migrateSecureKeys_(ss) {
  var sheet = ss.getSheetByName('設定');
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return;

  var data = sheet.getRange(1, 1, lastRow, 2).getValues();
  var migrated = false;

  for (var i = 0; i < data.length; i++) {
    var key = data[i][0];
    var value = data[i][1];

    if (SECURE_KEYS_.indexOf(key) >= 0 && value && String(value).trim() !== '') {
      // PropertiesService に既存値がなければ移行
      var existing = getSecureProperty_(key);
      if (!existing) {
        setSecureProperty_(key, String(value).trim());
        console.log('migrateSecureKeys_: migrated ' + key + ' to PropertiesService');
      }
      // シートからは値を削除（キー行は残す）
      sheet.getRange(i + 1, 2).setValue('');
      migrated = true;
    }
  }

  if (migrated) {
    SpreadsheetApp.flush();
    console.log('migrateSecureKeys_: migration completed');
  }
}

// ===========================================
// 設定の読み書き
// ===========================================

/**
 * 設定を取得（通常キーはシート、セキュアキーはPropertiesService）
 */
function getSettings(ss) {
  var sheet = ss.getSheetByName('設定');
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return {};
  var data = sheet.getRange(1, 1, lastRow, 2).getValues();
  var settings = {};
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0] !== '') {
      settings[data[i][0]] = data[i][1];
    }
  }

  // セキュアキーを PropertiesService からマージ（シートの値より優先）
  SECURE_KEYS_.forEach(function(key) {
    var secureValue = getSecureProperty_(key);
    if (secureValue) {
      settings[key] = secureValue;
    }
  });

  return settings;
}

/**
 * 設定を保存（セキュアキーはPropertiesService、通常キーはシート）
 */
function saveSettings(ss, params) {
  var sheet = ss.getSheetByName('設定');
  if (!sheet) sheet = ss.insertSheet('設定');

  // バリデーション
  if (Object.prototype.hasOwnProperty.call(params, 'app_id')) {
    var appId = String(params.app_id || '').trim();
    if (appId && !/^\d{10,20}$/.test(appId)) {
      return { success: false, error: '入力形式が正しくありません' };
    }
  }
  if (Object.prototype.hasOwnProperty.call(params, 'app_secret')) {
    var appSecret = String(params.app_secret || '').trim();
    if (appSecret && !/^[a-f0-9]{20,40}$/.test(appSecret)) {
      return { success: false, error: '入力形式が正しくありません' };
    }
  }

  var lastRow = sheet.getLastRow();
  var data = lastRow > 0 ? sheet.getRange(1, 1, lastRow, 2).getValues() : [];

  for (var key in params) {
    if (params[key] === undefined || params[key] === null) continue;

    // セキュアキーは PropertiesService に保存
    if (SECURE_KEYS_.indexOf(key) >= 0) {
      setSecureProperty_(key, params[key]);
      // シートに行があれば値をクリア（キー行は残す）
      for (var j = 0; j < data.length; j++) {
        if (data[j][0] === key) {
          sheet.getRange(j + 1, 2).setValue('');
          break;
        }
      }
      continue;
    }

    // 通常キーはシートに保存
    var found = false;
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(params[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      var newRow = sheet.getLastRow() + 1;
      sheet.getRange(newRow, 1).setValue(key);
      sheet.getRange(newRow, 2).setValue(params[key]);
    }
  }
  SpreadsheetApp.flush();
  return { success: true };
}
