/**
 * FableGear survey collector — Google Apps Script web app.
 *
 * Paste this into Extensions > Apps Script on the collector spreadsheet, then
 * Deploy > New deployment > Web app, "Execute as: Me", "Who has access: Anyone".
 * Copy the resulting /exec URL.
 *
 * WHY THIS DIFFERS FROM A FIXED-COLUMN appendRow SCRIPT
 * -----------------------------------------------------
 * The survey payload does not have a fixed shape. Per-tool Likert questions are
 * generated at runtime from the boxes a respondent checks, and their keys are
 * built as `<tool-id>__<statement-key>` — for example `lib-rekordbox__organize`
 * or `meta-mik__accurate`. Across the library, metadata, backup, hardware and
 * FableGear sections that is 44 possible Likert keys on top of ~20 fixed ones,
 * and any given response carries an unpredictable subset.
 *
 * A hardcoded appendRow([...]) of 15 columns therefore drops every satisfaction
 * rating on the floor — which is the actual research payload. This script
 * instead treats the header row as the schema: it reads the existing headers,
 * appends columns for keys it has never seen before, and writes each value under
 * its own header. New questions added to the form show up as new columns without
 * anyone touching this file.
 */

var SHEET_NAME = 'Responses';

/** Columns pinned to the left, in this order, when they first appear. */
var PREFERRED_ORDER = [
  'submitted_at',
  'email',
  'tools_library',
  'tools_metadata',
  'tools_backup',
  'tools_acquisition',
  'multi_tool_friction',
  'hw_used',
  'hardware',
  'hardware_other',
  'hw_open',
  'fg_tried',
  'fg_open_different',
  'fg_open_missing',
  'pain_point',
  'blind_spot',
];

function doPost(e) {
  // One writer at a time. appendRow is not atomic across concurrent executions,
  // and two submissions landing together can otherwise interleave or clobber.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return jsonOut({ status: 'error', message: 'Busy, please retry.' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ status: 'error', message: 'Empty request body.' });
    }

    var data = JSON.parse(e.postData.contents);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return jsonOut({ status: 'error', message: 'Payload must be a JSON object.' });
    }

    if (!data.submitted_at) data.submitted_at = new Date().toISOString();

    var sheet = getOrCreateSheet();
    var headers = readHeaders(sheet);

    // Flatten the payload to primitives, then make sure every key has a column.
    var flat = flatten(data);
    var incoming = Object.keys(flat);
    var added = [];
    for (var i = 0; i < incoming.length; i++) {
      if (headers.indexOf(incoming[i]) === -1) added.push(incoming[i]);
    }
    if (added.length) headers = addColumns(sheet, headers, added);

    var row = [];
    for (var c = 0; c < headers.length; c++) {
      var key = headers[c];
      if (key === '_raw_json') {
        row.push(JSON.stringify(data));
      } else {
        row.push(Object.prototype.hasOwnProperty.call(flat, key) ? flat[key] : '');
      }
    }

    sheet.appendRow(row);
    return jsonOut({ status: 'success', columns_added: added });
  } catch (error) {
    return jsonOut({ status: 'error', message: String(error) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Health check. Visiting the /exec URL in a browser should say "ok" — a fast way
 * to confirm the deployment is live and set to "Anyone" before wiring the page.
 */
function doGet() {
  var sheet = getOrCreateSheet();
  return jsonOut({
    status: 'ok',
    sheet: SHEET_NAME,
    responses: Math.max(0, sheet.getLastRow() - 1),
  });
}

/** Values arrive as arrays, nulls and nested objects; the sheet wants scalars. */
function flatten(data) {
  var out = {};
  Object.keys(data).forEach(function (key) {
    var value = data[key];
    if (value === null || value === undefined) {
      out[key] = '';
    } else if (Array.isArray(value)) {
      out[key] = value.join(', ');
    } else if (typeof value === 'object') {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = value;
    }
  });
  return out;
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function readHeaders(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) return [];
  var values = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  // Trim trailing blanks so a stray formatted cell doesn't create phantom columns.
  while (values.length && values[values.length - 1] === '') values.pop();
  return values.map(String);
}

/**
 * Appends new columns and rewrites the header row. `_raw_json` is always kept
 * last so the readable columns stay on the left as the schema grows.
 */
function addColumns(sheet, headers, added) {
  var hasRaw = headers.indexOf('_raw_json') !== -1;
  var working = headers.filter(function (h) { return h !== '_raw_json'; });

  added.forEach(function (key) {
    var preferred = PREFERRED_ORDER.indexOf(key);
    if (preferred === -1) {
      working.push(key);
      return;
    }
    // Keep the pinned columns in PREFERRED_ORDER relative to each other.
    var insertAt = working.length;
    for (var i = 0; i < working.length; i++) {
      var other = PREFERRED_ORDER.indexOf(working[i]);
      if (other === -1 || other > preferred) { insertAt = i; break; }
    }
    working.splice(insertAt, 0, key);
  });

  working.push('_raw_json');

  // Reordering headers would orphan existing data, so only ever grow to the
  // right once rows exist. On an empty sheet the ordering above applies freely.
  if (sheet.getLastRow() > 1 && hasRaw) {
    working = headers.filter(function (h) { return h !== '_raw_json'; })
      .concat(added)
      .concat(['_raw_json']);
  }

  sheet.getRange(1, 1, 1, working.length).setValues([working]);
  formatHeader(sheet, working.length);
  return working;
}

/** Cosmetic only, but it makes a 60-column sheet usable. */
function formatHeader(sheet, width) {
  var header = sheet.getRange(1, 1, 1, width);
  header.setFontWeight('bold');
  header.setBackground('#130e1c');
  header.setFontColor('#f4eff9');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
