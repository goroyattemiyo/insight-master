// ===========================================
// Code.gs - エントリーポイント・ルーター・グローバル設定
// ===========================================

var CONFIG = {
  THREADS_API_BASE: 'https://graph.threads.net/v1.0',
  THREADS_AUTH_URL: 'https://threads.net/oauth/authorize',
  THREADS_TOKEN_URL: 'https://graph.threads.net/oauth/access_token',
  SCOPES: 'threads_basic,threads_manage_insights,threads_profile_discovery,threads_keyword_search',
  GEMINI_API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
};

function getDeploymentUrl() {
  try { return ScriptApp.getService().getUrl(); }
  catch (e) { return ''; }
}

function getBoundSpreadsheetId() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getId(); }
  catch (e) { return null; }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function buildClientSettings_(settings) {
  settings = settings || {};
  var safe = {};
  for (var k in settings) {
    if (k === 'app_secret' || k === 'access_token' || k === 'gemini_api_key') continue;
    safe[k] = settings[k];
  }
  safe.hasAppSecret = !!settings.app_secret;
  safe.hasAccessToken = !!settings.access_token;
  safe.hasGeminiKey = !!settings.gemini_api_key;
  return safe;
}

// ===========================================
// doGet - Webアプリ エントリーポイント
// ===========================================

function doGet(e) {
  var DEPLOYMENT_URL = getDeploymentUrl();
  var NORMALIZED_DEPLOYMENT_URL = normalizeUrl_(DEPLOYMENT_URL);
  var BOUND_SHEET_ID = getBoundSpreadsheetId();

  var cache = CacheService.getUserCache();
  var sessionToken = Utilities.getUuid();
  cache.put('sessionToken', sessionToken, 3600);

  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : '';
  var code = (e && e.parameter && e.parameter.code) ? e.parameter.code : '';
  var state = (e && e.parameter && e.parameter.state) ? e.parameter.state : '';

  // --- sheetId 決定 ---
  var sheetId = '';
  if (BOUND_SHEET_ID) {
    sheetId = BOUND_SHEET_ID;
  } else if (e && e.parameter && e.parameter.sheetId) {
    sheetId = e.parameter.sheetId;
  } else if (state) {
    var sp = state.split(':::');
    if (sp.length > 0 && sp[0]) sheetId = sp[0];
  }

  // --- app_url 保存 ---
  if (sheetId && DEPLOYMENT_URL) {
    try {
      var ssUrl = SpreadsheetApp.openById(sheetId);
      var sUrl = getSettings(ssUrl);
      if (sUrl.app_id && (!sUrl.app_url || normalizeUrl_(sUrl.app_url) !== NORMALIZED_DEPLOYMENT_URL)) {
        saveSettings(ssUrl, { app_url: NORMALIZED_DEPLOYMENT_URL });
      }
    } catch (e2) { /* ignore */ }
  }

  // --- OAuthコールバック ---
  var stateSheetId = '';
  if (state) {
    var sp2 = state.split(':::');
    if (sp2.length > 0) stateSheetId = sp2[0];
  }

  if (code && (stateSheetId || sheetId) && !page) {
    var targetSheetId = stateSheetId || sheetId;
    var tokenResult = { success: false, error: '' };
    try {
      var ssToken = SpreadsheetApp.openById(targetSheetId);
      tokenResult = exchangeToken(ssToken, code);
    } catch (tokenErr) {
      tokenResult = { success: false, error: tokenErr.message };
    }

    var icon = tokenResult.success ? '✅' : '❌';
    var title = tokenResult.success ? '認証成功！' : '認証失敗';
    var desc = tokenResult.success ? 'Threadsアカウントとの連携が完了しました。' : 'エラー: ' + (tokenResult.error || '不明');

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>認証結果</title>' +
      '<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;}' +
      '.c{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:400px;}' +
      '.i{font-size:64px;margin-bottom:16px;}.t{font-size:24px;font-weight:bold;margin-bottom:8px;}.d{color:#666;margin-bottom:24px;}' +
      '.b{display:inline-block;padding:12px 32px;background:#000;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;border:none;cursor:pointer;}' +
      '.l{display:block;margin-top:12px;color:#666;font-size:13px;text-decoration:underline;}</style></head>' +
      '<body><div class="c"><div class="i">' + icon + '</div><div class="t">' + title + '</div><div class="d">' + desc + '</div>' +
      '<button class="b" onclick="window.close()">閉じる</button>' +
      '<a href="' + DEPLOYMENT_URL + '" class="l">閉じられない場合はこちら</a></div>' +
      '<script>localStorage.setItem("threads_tool_sheet_id","' + targetSheetId + '");<\/script></body></html>';

    return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // --- 認証開始ページ ---
  if (page === 'auth' && sheetId) {
    try {
      var ssAuth = SpreadsheetApp.openById(sheetId);
      var sAuth = getSettings(ssAuth);
      if (sAuth.app_id && sAuth.app_secret) {
        var stateParam = sheetId + ':::' + Utilities.getUuid();
        saveSettings(ssAuth, { oauth_state: stateParam });
        var authUrl = CONFIG.THREADS_AUTH_URL +
          '?client_id=' + sAuth.app_id +
          '&redirect_uri=' + encodeURIComponent(NORMALIZED_DEPLOYMENT_URL) +
          '&scope=' + encodeURIComponent(CONFIG.SCOPES) +
          '&response_type=code&force_authentication=1' +
          '&state=' + encodeURIComponent(stateParam);

        return HtmlService.createHtmlOutput(
          '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<style>body{font-family:sans-serif;text-align:center;padding:40px 20px;background:#f5f5f5;}' +
          '.c{background:#fff;border-radius:16px;padding:32px 24px;max-width:400px;margin:0 auto;box-shadow:0 4px 12px rgba(0,0,0,.1);}' +
          '.b{display:block;width:100%;padding:14px;background:#000;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;box-sizing:border-box;}</style></head>' +
          '<body><div class="c"><div style="font-size:48px;margin-bottom:16px;">🔐</div><h2>Threads認証</h2><p>アカウントと連携します。</p>' +
          '<a href="' + authUrl + '" class="b">認証ページを開く</a></div></body></html>'
        ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }
    } catch (authErr) { console.error('Auth error:', authErr); }
  }

  // --- 初期データ一括取得 ---
  var initialData = {
    sheetId: sheetId, settings: {}, user: null, accounts: [], activeAccount: null,
    tokenWarnings: [], initialScreen: 'welcome'
  };
  initialData.sessionToken = sessionToken;

  if (sheetId) {
    try {
      var ss = SpreadsheetApp.openById(sheetId);
      var rawSettings = getSettings(ss);
      initialData.settings = buildClientSettings_(rawSettings);

      if (rawSettings && rawSettings.access_token) {
        initialData.accounts = getAccounts(ss) || [];
        initialData.activeAccount = getActiveAccount(ss) || null;
        if (initialData.activeAccount) {
          initialData.user = {
            username: initialData.activeAccount.username,
            profilePicUrl: initialData.activeAccount.profilePicUrl
          };
        }
        var tw = checkTokenExpiry(ss);
        initialData.tokenWarnings = Array.isArray(tw) ? tw : [];
        initialData.initialScreen = 'dashboard';
        try {
          initialData.prefetchInsights = fetchUserInsights(ss, 7);
        } catch (e3) { initialData.prefetchInsights = null; }
      } else if (rawSettings && rawSettings.app_id) {
        initialData.initialScreen = 'setup-auth';
      } else {
        initialData.initialScreen = 'setup';
      }
    } catch (dataErr) { console.error('Initial data error:', dataErr); }
  }

  var template = HtmlService.createTemplateFromFile('index');
  template.serverData = JSON.stringify(initialData);
  template.deploymentUrl = DEPLOYMENT_URL;

  return template.evaluate()
    .setTitle('Threads インサイトマスター')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===========================================
// doPost
// ===========================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    return ContentService.createTextOutput(JSON.stringify(processApiRequest(data)))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    console.error('doPost error:', error && error.message, error && error.stack);
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: '処理中にエラーが発生しました。しばらく後にお試しください。' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===========================================
// APIリクエストルーター
// ===========================================

function processApiRequest(params) {
  var action = params.action;
  var sheetId = params.sheetId;
  var cache = CacheService.getUserCache();
  var validToken = cache.get('sessionToken');
  if (!params.sessionToken || params.sessionToken !== validToken) {
    return { success: false, error: '不正なリクエストです。ページを再読み込みしてください。' };
  }
  var boundSheetId = getBoundSpreadsheetId();
  if (!boundSheetId) return { success: false, error: 'シートIDが指定されていません' };
  params.sheetId = boundSheetId;
  sheetId = boundSheetId;
  try {
    var ss;
    try { ss = SpreadsheetApp.openById(sheetId); }
    catch (e) { return { success: false, error: 'スプレッドシートを開けません: ' + e.message }; }
    var result;
    switch (action) {
      // Sheets
      case 'getSettings':            result = buildClientSettings_(getSettings(ss)); break;
      case 'saveSettings':           result = saveSettings(ss, params); break;
      case 'validateSheetId':        result = validateSheetId(sheetId); break;
      // Auth
      case 'getAuthUrl':             result = getAuthUrl(ss); break;
      case 'exchangeToken':          result = exchangeToken(ss, params.code); break;
      case 'getUserProfile':         result = getUserProfile(ss); break;
      // Accounts
      case 'getAccounts':            result = getAccounts(ss); break;
      case 'getActiveAccount':       result = getActiveAccount(ss); break;
      case 'setActiveAccount':       result = setActiveAccount(ss, params.accountId); break;
      case 'removeAccount':          result = removeAccount(ss, params.accountId); break;
      case 'importAccountFromSheet': result = importAccountFromSheet(ss, params.sourceSheetId); break;
      case 'importFromExternalSheet': result = importFromExternalSheet(ss, params); break;
      case 'checkTokenExpiry':       result = checkTokenExpiry(ss); break;
      case 'switchAccount':          result = switchAccountFull(ss, params.accountId); break;
      // Analytics
      case 'fetchAndStorePostAnalytics': result = fetchAndStorePostAnalytics(ss); break;
      case 'getAnalyticsData':           result = getAnalyticsData(ss, params.periodDays); break;
      case 'generateTimeAnalysis':       result = generateTimeAnalysis(ss); break;
      case 'getTimeAnalysisData':        result = getTimeAnalysisData(ss); break;
      // Insights
      case 'fetchUserInsights':      result = fetchUserInsights(ss, params.sinceDays); break;
      
      // Competitor Watch
      case 'addCompetitor':               result = addCompetitor(ss, params); break;
      case 'getCompetitors':              result = getCompetitors(ss); break;
      case 'updateCompetitor':            result = updateCompetitor(ss, params); break;
      case 'deleteCompetitor':            result = deleteCompetitor(ss, params); break;
      case 'saveWatchPost':               result = saveWatchPost(ss, params); break;
      case 'getWatchPosts':               result = getWatchPosts(ss, params); break;
      case 'deleteWatchPost':             result = deleteWatchPost(ss, params); break;
      case 'searchCompetitorByGrounding': result = searchCompetitorByGrounding(ss, params); break;
      case 'analyzeCompetitorStyle':      result = analyzeCompetitorStyle(ss, params); break;
      case 'analyzeVsSelf':               result = analyzeVsSelf(ss, params); break;
      case 'analyzeBuzzPatterns':         result = analyzeBuzzPatterns(ss, params); break;
      case 'analyzeBuzzPattern':          result = analyzeBuzzPattern(ss, params.days); break;
      case 'generateBuzzReport':          result = generateBuzzReport(ss, params.days); break;

      // Followers
      case 'getFollowerHistory':      result = getFollowerHistory(params.days); break;
      case 'setupFollowerTrigger':    result = setupFollowerTrigger(); break;
      case 'recordDailyFollowers':    result = recordDailyFollowers(); break;
      // Weekly Report
      case 'generateWeeklyReport':   result = generateWeeklyReport(ss); break;
      case 'getWeeklyReport':        result = getWeeklyReport(params.weekOffset); break;
      case 'getWeeklyReportList':    result = getWeeklyReportList(); break;
      case 'setupWeeklyTrigger':     result = setupWeeklyTrigger(); break;
      // Keyword Search
      case 'searchKeyword':           result = searchKeyword(ss, params); break;
      case 'getSearchHistory':        result = getSearchHistory(ss); break;
      case 'getSavedSearchResults':   result = getSavedSearchResults(ss, params); break;
      case 'analyzeKeywordTrend':     result = analyzeKeywordTrend(ss, params); break;
      case 'clearSearchHistory':      result = clearSearchHistory(ss); break;
      case 'clearSavedSearchResults': result = clearSavedSearchResults(ss, params); break;
      // Gemini / AI
      case 'generatePostWithAI':     result = generatePostWithAI(ss, params); break;
      case 'generatePostWithAnalysis': result = generatePostWithAnalysis(ss, params); break;
      case 'generateAnalysisReport':        result = generateAnalysisReport(ss, params); break;
      case 'generateImprovementSuggestions': result = generateImprovementSuggestions(ss, params); break;
      case 'refinePostWithAI':              result = refinePostWithAI(ss, params); break;
      // Drafts
      case 'saveDraft':              result = saveDraft(ss, params); break;
      case 'getDrafts':              result = getDrafts(ss, params.statusFilter); break;
      case 'toggleDraftStatus':      result = toggleDraftStatus(ss, params.draftId); break;
      case 'deleteDraft':            result = deleteDraft(ss, params.draftId); break;
      default:
        return { success: false, error: 'Unknown action: ' + action };
    }
    if (action === 'saveSettings' && result && result.success === false) {
      return { success: false, error: result.error || '入力形式が正しくありません' };
    }
    return { success: true, data: result };
  } catch (error) {
    console.error('API Error [' + action + ']:', error && error.message, error && error.stack);
    return { success: false, error: '処理中にエラーが発生しました。しばらく後にお試しください。' };
  }
}
