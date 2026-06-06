const SHEET_NAME = 'Schedules';
const SPREADSHEET_ID_PROPERTY = 'SCHEDULE_SPREADSHEET_ID';
const HEADERS = ['id', 'date', 'time', 'personName', 'completed', 'createdAt', 'updatedAt'];
const REGISTRATION_END_HOUR = 22;
const REPEAT_START_DATE = '2026-06-08';
const REPEAT_END_DATE = '2026-08-06';
const MAX_BULK_CREATE_COUNT = 1200;

function doGet(e) {
  try {
    const action = String((e.parameter && e.parameter.action) || '');
    if (action !== 'list') {
      throw new Error('Unsupported action.');
    }

    const from = normalizeDate_(e.parameter.from);
    const to = normalizeDate_(e.parameter.to);
    return json_({ ok: true, events: listEvents_(from, to) });
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = parseBody_(e);

    if (body.action === 'create') {
      return json_({ ok: true, event: createEvent_(body.event || {}) });
    }

    if (body.action === 'bulkCreate') {
      return json_({ ok: true, events: createEvents_(body.events || []) });
    }

    if (body.action === 'toggle') {
      toggleEvent_(body.id, body.completed);
      return json_({ ok: true });
    }

    if (body.action === 'delete') {
      deleteEvent_(body.id);
      return json_({ ok: true });
    }

    throw new Error('Unsupported action.');
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {
      // Lock release can fail when lock acquisition failed.
    }
  }
}

function initializeSchedulesSheet() {
  ensureSheet_();
}

function listEvents_(from, to) {
  const rows = readRows_();
  return rows
    .filter((event) => event.date >= from && event.date <= to)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.time !== b.time) return a.time.localeCompare(b.time);
      return a.personName.localeCompare(b.personName);
    })
    .map((event) => ({
      id: event.id,
      date: event.date,
      time: event.time,
      personName: event.personName,
      completed: event.completed,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }));
}

function createEvent_(event) {
  const sheet = ensureSheet_();
  const now = new Date().toISOString();
  const created = createEventRecord_(event, now, false);

  sheet.appendRow(toRow_(created));

  return created;
}

function createEvents_(events) {
  if (!Array.isArray(events) || !events.length) throw new Error('Events are required.');
  if (events.length > MAX_BULK_CREATE_COUNT) throw new Error('Too many events.');

  const sheet = ensureSheet_();
  const now = new Date().toISOString();
  const createdEvents = events.map((event) => createEventRecord_(event, now, true));
  const rows = createdEvents.map(toRow_);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
  return createdEvents;
}

function createEventRecord_(event, now, repeatOnly) {
  return {
    id: Utilities.getUuid(),
    date: repeatOnly ? normalizeRepeatDate_(event.date) : normalizeDate_(event.date),
    time: normalizeTime_(event.time),
    personName: normalizePersonName_(event.personName),
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

function toRow_(event) {
  return [
    event.id,
    event.date,
    event.time,
    event.personName,
    event.completed,
    event.createdAt,
    event.updatedAt,
  ];
}

function toggleEvent_(id, completed) {
  const sheet = ensureSheet_();
  const rowNumber = findRowNumberById_(id);
  sheet.getRange(rowNumber, 5).setValue(completed === true || String(completed).toLowerCase() === 'true');
  sheet.getRange(rowNumber, 7).setValue(new Date().toISOString());
}

function deleteEvent_(id) {
  const sheet = ensureSheet_();
  const rowNumber = findRowNumberById_(id);
  sheet.deleteRow(rowNumber);
}

function findRowNumberById_(id) {
  const targetId = String(id || '').trim();
  if (!targetId) throw new Error('Event id is required.');

  const rows = readRows_();
  const row = rows.find((event) => event.id === targetId);
  if (!row) throw new Error('Event not found.');
  return row.rowNumber;
}

function readRows_() {
  const sheet = ensureSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  return values.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    id: String(row[0] || '').trim(),
    date: formatDateValue_(row[1]),
    time: formatTimeValue_(row[2]),
    personName: String(row[3] || '').trim(),
    completed: parseBoolean_(row[4]),
    createdAt: formatTextValue_(row[5]),
    updatedAt: formatTextValue_(row[6]),
  })).filter((event) => event.id && event.date && event.time && event.personName);
}

function ensureSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  const range = sheet.getRange(1, 1, 1, HEADERS.length);
  const currentHeaders = range.getValues()[0].map((value) => String(value || '').trim());
  const matches = HEADERS.every((header, index) => currentHeaders[index] === header);
  if (!matches) {
    range.setValues([HEADERS]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY);
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Set SCHEDULE_SPREADSHEET_ID in Script Properties.');
  }
  return spreadsheet;
}

function parseBody_(e) {
  const contents = e.postData && e.postData.contents;
  if (!contents) throw new Error('Request body is required.');

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error('Request body must be valid JSON.');
  }
}

function normalizeDate_(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be YYYY-MM-DD.');
  }
  return date;
}

function normalizeRepeatDate_(value) {
  const date = normalizeDate_(value);
  if (date < REPEAT_START_DATE || date > REPEAT_END_DATE) {
    throw new Error('Repeat date is out of range.');
  }
  return date;
}

function normalizeTime_(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) throw new Error('Time must be HH:00.');

  const hour = Number(match[1]);
  const minute = match[2] || '00';
  if (hour < 0 || hour > REGISTRATION_END_HOUR) throw new Error('Time hour is out of range.');
  if (minute !== '00') throw new Error('Time must be an hourly slot.');
  return `${String(hour).padStart(2, '0')}:00`;
}

function normalizePersonName_(value) {
  const personName = String(value || '').trim();
  if (!personName) throw new Error('Person name is required.');
  if (personName.length > 80) throw new Error('Person name is too long.');
  return personName;
}

function formatDateValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '').trim();
}

function formatTimeValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return String(value || '').trim();
  return `${String(Number(match[1])).padStart(2, '0')}:00`;
}

function formatTextValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return value.toISOString();
  }
  return String(value || '').trim();
}

function parseBoolean_(value) {
  if (value === true) return true;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === 'y' || normalized === 'yes' || normalized === '완료';
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
