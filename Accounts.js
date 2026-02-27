// ===========================================
// Accounts.gs - 複数アカウント管理
// ===========================================
/**
 * アカウント切替を1回のAPI呼び出しで完了
 * setActiveAccount + getAccounts + getUserProfile を統合
 */
function switchAccountFull(ss, accountId) {
  // 1. アクティブアカウントを切替
  var setResult = setActiveAccount(ss, accountId);
  
  // 2. アカウント一覧を取得
  var accountsResult = getAccounts(ss);
  
  // 3. ユーザープロフィールを取得
  var profileResult = getUserProfile(ss);
  
  return {
    activeAccount: setResult,
    accounts: accountsResult.accounts || accountsResult,
    user: profileResult.user || profileResult
  };
}

/**
 * アカウント一覧を取得
 */
function getAccounts(ss) {
  var sheet = ss.getSheetByName('アカウント');
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var accounts = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) {
      accounts.push({
        accountId: data[i][0],
        accessToken: data[i][1],
        userId: data[i][2],
        username: data[i][3],
        profilePicUrl: data[i][4],
        tokenExpires: data[i][5],
        createdAt: data[i][6]
      });
    }
  }
  return accounts;
}

/**
 * アクティブアカウントを取得
 */
function getActiveAccount(ss) {
  var settings = getSettings(ss);
  var activeAccountId = settings.active_account;

  if (!activeAccountId) {
    var accounts = getAccounts(ss);
    if (accounts.length > 0) {
      setActiveAccount(ss, accounts[0].accountId);
      return accounts[0];
    }
    // 後方互換性：設定シートから取得
    if (settings.access_token && settings.user_id) {
      return {
        accountId: 'default',
        accessToken: settings.access_token,
        userId: settings.user_id,
        username: settings.username || '',
        profilePicUrl: settings.profile_pic_url || '',
        tokenExpires: settings.token_expires || ''
      };
    }
    return null;
  }

  var accounts = getAccounts(ss);
  for (var i = 0; i < accounts.length; i++) {
    if (accounts[i].accountId === activeAccountId) return accounts[i];
  }

  // 見つからない場合、最初のアカウント
  if (accounts.length > 0) {
    setActiveAccount(ss, accounts[0].accountId);
    return accounts[0];
  }
  return null;
}

/**
 * アクティブアカウントの認証情報を取得（内部用ヘルパー）
 */
function getActiveAccountAuth(ss) {
  var account = getActiveAccount(ss);
  if (!account) {
    var settings = getSettings(ss);
    if (settings.access_token) {
      return { accessToken: settings.access_token, userId: settings.user_id };
    }
    return null;
  }
  return { accessToken: account.accessToken, userId: account.userId };
}

/**
 * アクティブアカウントを切り替え
 */
function setActiveAccount(ss, accountId) {
  saveSettings(ss, { active_account: accountId });
  return { success: true, accountId: accountId };
}

/**
 * アカウントを追加（同一user_idなら更新）
 */
function addAccount(ss, accountData) {
  var sheet = ss.getSheetByName('アカウント');
  if (!sheet) throw new Error('アカウントシートが見つかりません');

  var accounts = getAccounts(ss);
  var existingIndex = -1;
  for (var i = 0; i < accounts.length; i++) {
    if (accounts[i].userId === accountData.userId) {
      existingIndex = i;
      break;
    }
  }

  var accountId = accountData.accountId || 'acc-' + accountData.userId;
  var now = new Date().toISOString();
  var rowData = [
    accountId,
    accountData.accessToken,
    accountData.userId,
    accountData.username || '',
    accountData.profilePicUrl || '',
    accountData.tokenExpires || '',
    now
  ];

  if (existingIndex >= 0) {
    sheet.getRange(existingIndex + 2, 1, 1, 7).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  setActiveAccount(ss, accountId);
  return { success: true, accountId: accountId, isNew: existingIndex < 0 };
}

/**
 * アカウントを削除
 */
function removeAccount(ss, accountId) {
  var sheet = ss.getSheetByName('アカウント');
  if (!sheet) throw new Error('アカウントシートが見つかりません');

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) throw new Error('削除するアカウントがありません');

  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === accountId) {
      sheet.deleteRow(i + 2);
      var remaining = getAccounts(ss);
      if (remaining.length > 0) {
        setActiveAccount(ss, remaining[0].accountId);
      } else {
        saveSettings(ss, { active_account: '' });
      }
      return { success: true };
    }
  }
  throw new Error('アカウントが見つかりません');
}

/**
 * 別スプレッドシートからアカウントをインポート
 */
function importAccountFromSheet(ss, sourceSheetId) {
  try {
    var sourceSs = SpreadsheetApp.openById(sourceSheetId);
    var sourceSettings = getSettings(sourceSs);

    if (!sourceSettings.access_token || !sourceSettings.user_id) {
      return { success: false, error: 'インポート元で認証が完了していません。' };
    }

    var existingAccounts = getAccounts(ss);
    for (var i = 0; i < existingAccounts.length; i++) {
      if (existingAccounts[i].userId === String(sourceSettings.user_id)) {
        return { success: false, error: 'このアカウントは既に追加されています。' };
      }
    }

    var result = addAccount(ss, {
      userId: String(sourceSettings.user_id),
      accessToken: sourceSettings.access_token,
      username: sourceSettings.username || '',
      profilePicUrl: sourceSettings.profile_pic_url || '',
      tokenExpires: sourceSettings.token_expires || ''
    });

    return {
      success: true,
      data: {
        accountId: result.accountId,
        username: sourceSettings.username || sourceSettings.user_id,
        message: '@' + (sourceSettings.username || sourceSettings.user_id) + ' をインポートしました'
      }
    };
  } catch (e) {
    return { success: false, error: 'インポートエラー: ' + e.message };
  }
}

/**
 * 別スプレッドシートから設定値をスキャンして取得
 */
function importFromExternalSheet(ss, params) {
  var sourceSheetId = params.sourceSheetId;
  if (!sourceSheetId) throw new Error('スプレッドシートIDが必要です');
  var raw = String(sourceSheetId).trim();
  var m = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m && m[1]) raw = m[1];
  if (!/^[a-zA-Z0-9_-]{20,60}$/.test(raw)) {
    throw new Error('スプレッドシートIDの形式が正しくありません');
  }
  sourceSheetId = raw;
  
  var sourceSS;
  try {
    sourceSS = SpreadsheetApp.openById(sourceSheetId);
  } catch (e) {
    throw new Error('スプレッドシートにアクセスできません。共有設定を確認してください。');
  }
  
  var result = { found: {}, imported: {} };
  
  // 全シートをスキャンして既知のキーを探す
  var targetKeys = {
    'app_id': ['app_id', 'APP_ID', 'appId', 'アプリID', 'client_id', 'CLIENT_ID'],
    'app_secret': ['app_secret', 'APP_SECRET', 'appSecret', 'アプリシークレット', 'client_secret', 'CLIENT_SECRET'],
    'access_token': ['access_token', 'ACCESS_TOKEN', 'accessToken', 'アクセストークン', 'token'],
    'user_id': ['user_id', 'USER_ID', 'userId', 'ユーザーID', 'threads_user_id'],
    'gemini_api_key': ['gemini_api_key', 'GEMINI_API_KEY', 'geminiApiKey', 'gemini_key', 'GEMINI_KEY']
  };
  
  var sheets = sourceSS.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow === 0 || lastCol === 0) continue;
    var data = sheet.getRange(1, 1, Math.min(lastRow, 100), Math.min(lastCol, 10)).getValues();
    
    for (var i = 0; i < data.length; i++) {
      for (var j = 0; j < data[i].length; j++) {
        var cellKey = String(data[i][j]).trim();
        for (var targetKey in targetKeys) {
          if (result.found[targetKey]) continue;
          var aliases = targetKeys[targetKey];
          for (var a = 0; a < aliases.length; a++) {
            if (cellKey.toLowerCase() === aliases[a].toLowerCase()) {
              // キーの右隣または下のセルを値として取得
              var value = '';
              if (j + 1 < data[i].length && data[i][j + 1]) {
                value = String(data[i][j + 1]).trim();
              } else if (i + 1 < data.length && data[i + 1][j]) {
                value = String(data[i + 1][j]).trim();
              }
              if (value) {
                result.found[targetKey] = { value: value, sheet: sheet.getName(), cell: cellKey };
              }
              break;
            }
          }
        }
      }
    }
  }
  
  return result;
}

/**
 * トークン期限チェック（5日以内に期限切れのアカウントを警告）
 */
function checkTokenExpiry(ss) {
  var accounts = getAccounts(ss);
  var warnings = [];
  var now = new Date();

  accounts.forEach(function(account) {
    if (account.tokenExpires) {
      var expiryDate = new Date(account.tokenExpires);
      var daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 5) {
        warnings.push({
          accountId: account.accountId,
          username: account.username,
          daysLeft: Math.max(daysLeft, 0),
          expired: daysLeft <= 0
        });
      }
    }
  });
  return warnings;
}
