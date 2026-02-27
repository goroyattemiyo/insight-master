// ===========================================
// Drafts.gs - 下書きストック管理（ツリー対応版）
// ===========================================

/**
 * 下書きを保存（ツリー投稿は親+各返信を関連付けて複数行保存）
 */
function saveDraft(ss, params) {
  var sheet = ss.getSheetByName('下書き');
  if (!sheet) throw new Error('下書きシートが見つかりません');

  // ヘッダー確認・拡張（thread_id, thread_order 列がなければ追加）
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var needsExpansion = headers.indexOf('thread_id') === -1;
  
  if (needsExpansion) {
    // 既存: draft_id, account_id, text, type, created_at, status, source
    // 追加: thread_id, thread_order
    var nextCol = headers.length + 1;
    sheet.getRange(1, nextCol).setValue('thread_id');
    sheet.getRange(1, nextCol + 1).setValue('thread_order');
  }

  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : 'default';
  var now = new Date().toISOString();
  var source = params.source || 'manual';

  // ツリー投稿の場合：親+返信を分割して保存
  if (params.type === 'thread' && params.text) {
    var threadId = 'thread-' + Date.now();
    var parts = parseThreadParts_(params.text);
    
    var rows = [];
    for (var i = 0; i < parts.length; i++) {
      var draftId = 'draft-' + Date.now() + '-' + i;
      var label = i === 0 ? 'thread_parent' : 'thread_reply';
      rows.push([
        draftId,
        accountId,
        parts[i],
        label,
        now,
        'unused',
        source,
        threadId,
        i  // thread_order: 0=親, 1=返信1, 2=返信2...
      ]);
    }
    
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
    }
    
    return { success: true, threadId: threadId, count: rows.length };
  }

  // 通常投稿
  var draftId = 'draft-' + Date.now();
  var row = [draftId, accountId, params.text, params.type || 'single', now, 'unused', source, '', ''];
  sheet.appendRow(row);

  return { success: true, draftId: draftId };
}

/**
 * ツリーテキストを親+返信に分割
 */
function parseThreadParts_(text) {
  if (!text) return [text];
  
  var MAX_PARTS = 5; // 親1 + 返信最大4
  
  // パターン1: 【親】...【返信1】...【返信2】... 形式
  if (text.indexOf('【親】') !== -1 || text.indexOf('【返信') !== -1) {
    var parts = [];
    var segments = text.split(/【(?:親投稿?|返信\d*)】/);
    for (var i = 0; i < segments.length; i++) {
      var s = segments[i].trim();
      if (s) parts.push(s);
    }
    if (parts.length > 1) return parts.slice(0, MAX_PARTS);
  }
  
  // パターン2: 二重改行で区切られている
  var blocks = text.split(/\n\n+/);
  if (blocks.length >= 2) {
    var filtered = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i].trim();
      if (b) filtered.push(b);
    }
    if (filtered.length >= 2) return filtered.slice(0, MAX_PARTS);
  }
  
  // 分割できない場合はそのまま1件で返す
  return [text];
}

/**
 * 下書き一覧を取得（ツリーをグループ化して返す）
 */
function getDrafts(ss, statusFilter) {
  var sheet = ss.getSheetByName('下書き');
  if (!sheet) return [];

  var activeAccount = getActiveAccount(ss);
  var accountId = activeAccount ? activeAccount.accountId : 'default';

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var numCols = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  var threadIdCol = headers.indexOf('thread_id');
  var threadOrderCol = headers.indexOf('thread_order');

  var singles = [];
  var threadMap = {};

  data.forEach(function(row) {
    if (!row[0]) return;
    if ((row[1] || '') !== accountId) return;
    if (statusFilter && row[5] !== statusFilter) return;

    var threadId = threadIdCol >= 0 ? (row[threadIdCol] || '') : '';
    var threadOrder = threadOrderCol >= 0 ? (row[threadOrderCol] || 0) : 0;

    var draft = {
      draftId: row[0],
      accountId: row[1],
      text: row[2],
      type: row[3],
      createdAt: row[4],
      status: row[5],
      source: row[6],
      threadId: threadId,
      threadOrder: Number(threadOrder)
    };

    if (threadId) {
      if (!threadMap[threadId]) {
        threadMap[threadId] = {
          threadId: threadId,
          type: 'thread',
          parts: [],
          createdAt: draft.createdAt,
          status: draft.status,
          source: draft.source
        };
      }
      threadMap[threadId].parts.push(draft);
    } else {
      singles.push(draft);
    }
  });

  // ツリーをまとめてリストに追加
  var results = singles.slice();
  for (var tid in threadMap) {
    var thread = threadMap[tid];
    thread.parts.sort(function(a, b) { return a.threadOrder - b.threadOrder; });
    results.push(thread);
  }

  results.sort(function(a, b) {
    var aDate = a.createdAt || (a.parts && a.parts[0] ? a.parts[0].createdAt : '');
    var bDate = b.createdAt || (b.parts && b.parts[0] ? b.parts[0].createdAt : '');
    return new Date(bDate) - new Date(aDate);
  });

  return results;
}

/**
 * 下書きのステータスを切替（ツリーは全パーツ一括）
 */
function toggleDraftStatus(ss, draftId) {
  var sheet = ss.getSheetByName('下書き');
  if (!sheet) throw new Error('下書きシートが見つかりません');

  var numCols = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  var threadIdCol = headers.indexOf('thread_id');
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  // thread_id で一致する場合は全パーツを切替
  var targetThreadId = '';
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === draftId) {
      targetThreadId = threadIdCol >= 0 ? (data[i][threadIdCol] || '') : '';
      break;
    }
  }

  var toggled = false;
  for (var i = 0; i < data.length; i++) {
    var match = data[i][0] === draftId;
    if (!match && targetThreadId && threadIdCol >= 0) {
      match = data[i][threadIdCol] === targetThreadId;
    }
    if (match) {
      var newStatus = data[i][5] === 'unused' ? 'used' : 'unused';
      sheet.getRange(i + 2, 6).setValue(newStatus);
      toggled = true;
    }
  }

  if (!toggled) throw new Error('下書きが見つかりません');
  return { success: true };
}

/**
 * 下書きを削除（ツリーは全パーツ一括削除）
 */
function deleteDraft(ss, draftId) {
  var sheet = ss.getSheetByName('下書き');
  if (!sheet) throw new Error('下書きシートが見つかりません');

  var numCols = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  var threadIdCol = headers.indexOf('thread_id');
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  // thread_id を特定
  var targetThreadId = '';
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === draftId) {
      targetThreadId = threadIdCol >= 0 ? (data[i][threadIdCol] || '') : '';
      break;
    }
  }

  // 削除対象行を下から削除（行番号がずれないように）
  var deleted = false;
  for (var i = data.length - 1; i >= 0; i--) {
    var match = data[i][0] === draftId;
    if (!match && targetThreadId && threadIdCol >= 0) {
      match = data[i][threadIdCol] === targetThreadId;
    }
    if (match) {
      sheet.deleteRow(i + 2);
      deleted = true;
    }
  }

  if (!deleted) throw new Error('下書きが見つかりません');
  return { success: true };
}
