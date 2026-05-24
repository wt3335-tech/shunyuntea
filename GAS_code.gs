// ════════════════════════════════════════════════════════════════
// 福壽山順韻茶葉 品評系統 — Google Apps Script 後端
// 貼到 Google Apps Script 後點「部署」→「新增部署」
// ════════════════════════════════════════════════════════════════

const SHEET_NAME = '品評資料';

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange('A1').setValue('更新時間');
    sheet.getRange('B1').setValue('資料JSON');
  }
  return sheet;
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'load') {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return ContentService
        .createTextOutput(JSON.stringify({ data: null }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const data = sheet.getRange(lastRow, 2).getValue();
    return ContentService
      .createTextOutput(JSON.stringify({ data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'save') {
      const sheet = getSheet();
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      sheet.appendRow([now, body.data]);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
