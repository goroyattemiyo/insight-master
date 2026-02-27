// ===========================================
// Utils.gs - 共通ヘルパー
// ===========================================

function fetchJson_(url, options) {
  options = options || {};
  options.muteHttpExceptions = true;
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('HTTP ' + code + ': ' + text.substring(0, 200));
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON response: ' + text.substring(0, 200));
  }
}

function fetchJsonWithRetry_(url, options, retryDelayMs) {
  try {
    return fetchJson_(url, options);
  } catch (e) {
    if (/^HTTP 429/.test(e.message)) {
      Utilities.sleep(retryDelayMs || 45000);
      return fetchJson_(url, options);
    }
    throw e;
  }
}

function normalizeUrl_(url) {
  if (!url) return '';
  return url.replace(/\/+$/, '');
}
