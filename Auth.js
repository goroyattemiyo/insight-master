// ===========================================
// Auth.gs - OAuth認証フロー
// ===========================================

/**
 * 認証URLを生成
 */
function getAuthUrl(ss) {
  var settings = getSettings(ss);
  var appId = settings.app_id;
  var redirectUri = normalizeUrl_(settings.app_url || getDeploymentUrl());

  if (!appId) return { success: false, error: 'App IDを設定してください' };
  if (!redirectUri) return { success: false, error: 'アプリURLが取得できません' };

  var sheetId = ss.getId();
  var state = sheetId + ':::' + Utilities.getUuid();
  saveSettings(ss, { oauth_state: state });

  var authUrl = CONFIG.THREADS_AUTH_URL +
    '?client_id=' + appId +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + CONFIG.SCOPES +
    '&response_type=code' +
    '&force_authentication=1' +
    '&state=' + state;

  return { success: true, url: authUrl, state: state };
}

/**
 * 認証コード → 短期トークン → 長期トークン交換
 */
function exchangeToken(ss, code) {
  var settings = getSettings(ss);
  var appId = settings.app_id;
  var appSecret = settings.app_secret;
  var redirectUri = normalizeUrl_(settings.app_url || getDeploymentUrl());

  // 短期トークン取得
  var tokenData = fetchJson_('https://graph.threads.net/oauth/access_token', {
    method: 'post',
    payload: {
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: code
    },
  });
  if (tokenData.error) {
    throw new Error('Threads API Error: ' + (tokenData.error.message || JSON.stringify(tokenData.error)));
  }

  var shortLivedToken = tokenData.access_token;
  var userId = String(tokenData.user_id);

  // 長期トークンに交換
  var longTokenUrl = 'https://graph.threads.net/access_token' +
    '?grant_type=th_exchange_token' +
    '&client_secret=' + appSecret +
    '&access_token=' + shortLivedToken;

  var longTokenData = fetchJson_(longTokenUrl);

  if (longTokenData.error) {
    throw new Error('Long token error: ' + (longTokenData.error.message || JSON.stringify(longTokenData.error)));
  }

  var accessToken = longTokenData.access_token;
  var expiresAt = new Date(Date.now() + longTokenData.expires_in * 1000).toISOString();

  // ユーザー情報を取得
  var username = '';
  var profilePicUrl = '';
  try {
    var userInfoUrl = CONFIG.THREADS_API_BASE + '/' + userId +
      '?fields=id,username,threads_profile_picture_url&access_token=' + accessToken;
    var userInfo = fetchJson_(userInfoUrl);
    if (userInfo.username) username = userInfo.username;
    if (userInfo.threads_profile_picture_url) profilePicUrl = userInfo.threads_profile_picture_url;
  } catch (e) { /* ignore */ }

  // 設定を保存
  saveSettings(ss, {
    access_token: accessToken,
    user_id: userId,
    token_expires: expiresAt,
    username: username,
    profile_pic_url: profilePicUrl,
    setup_completed: 'TRUE'
  });

  // アカウントシートにも追加
  var accountResult = addAccount(ss, {
    userId: userId,
    accessToken: accessToken,
    username: username,
    profilePicUrl: profilePicUrl,
    tokenExpires: expiresAt
  });

  return {
    success: true,
    user_id: userId,
    username: username,
    expires_at: expiresAt,
    account_id: accountResult.accountId,
    is_new_account: accountResult.isNew
  };
}

/**
 * ユーザープロフィール取得
 */
function getUserProfile(ss) {
  var activeAccount = getActiveAccount(ss);
  if (activeAccount && activeAccount.accessToken) {
    return {
      success: true,
      user: {
        username: activeAccount.username || '',
        profilePicUrl: activeAccount.profilePicUrl || '',
        userId: activeAccount.userId || ''
      }
    };
  }

  var settings = getSettings(ss);
  if (!settings.access_token) throw new Error('認証が必要です');

  return {
    success: true,
    user: {
      username: settings.username || '',
      profilePicUrl: settings.profile_pic_url || '',
      userId: String(settings.user_id)
    }
  };
}
