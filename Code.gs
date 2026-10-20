const SHEETS = { ITINERARY: "Itinerary", FLIGHT: "FlightInfo", CHECKLIST: "Checklist", AUTH: "Auth", PARTICIPANTS: "Participants", EXPENSE: "Expense", CONFIG: "Config" };
// Google Places API Key - 填入後即可自動搜尋地點和圖片（留空則使用自動產生的 Maps 搜尋連結）
const PLACES_API_KEY = '';
const IT_COL = { ID:1, Day:2, Time:3, Duration:4, ActualEndTime:5, Type:6, Activity:7, Note:8, Expense:9, Currency:10, MapURL:11, ImageURL:12, TripID:13, Participants:14, FlightID:15, ExpenseID:16, Date:17 };
const FL_COL = { ID:1, FlightNo:2, Airline:3, DepartAirport:4, ArriveAirport:5, DepartDate:6, DepartTime:7, ArriveDate:8, ArriveTime:9, BookingRef:10, Note:11, TripID:12 };
const CK_COL = { ID:1, Item:2, Checked:3, TripID:4 };
const PT_COL = { ID:1, Name:2, TripID:3 };
const EX_COL = { ID:1, Day:2, Time:3, Category:4, Description:5, Amount:6, Currency:7, Payer:8, PayMethod:9, Participants:10, TripID:11, LinkedItineraryID:12 };

// 全域／各旅程版本號與 5 分鐘時間桶，共同控制快取失效。
function getDataGen(tripId) {
  const p = PropertiesService.getScriptProperties();
  let g = p.getProperty('dataGen');
  if (!g) { g = '1'; p.setProperty('dataGen', g); }
  // 時間桶也會換版，未安裝 onEdit 觸發器時仍會在 5 分鐘內讀到人工改表。
  return 'secure-v2.' + g + '.' + (p.getProperty('tripGen_' + (tripId || '')) || '0') + '.' + Math.floor(Date.now() / 300000);
}
function bumpDataGen(tripId) {
  const p = PropertiesService.getScriptProperties();
  const key = tripId ? 'tripGen_' + tripId : 'dataGen';
  const g = (parseInt(p.getProperty(key) || '0', 10) + 1).toString();
  p.setProperty(key, g);
  return getDataGen(tripId);
}

// 綁定試算表的簡易觸發條件；人工編輯立即使快取失效，不新增授權範圍。
function onEdit(e) {
  if (e && e.range) invalidateSheetCache();
}
function invalidateSheetCache() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { bumpDataGen(); } finally { lock.releaseLock(); }
}

// 只合併相鄰且有提供的欄位，不覆寫其他儲存格或公式。
function setFields_(sheet, row, columns, fields) {
  const cells = Object.keys(fields).filter(k => fields[k] !== undefined)
    .map(k => [columns[k], fields[k]]).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < cells.length;) {
    const start = cells[i][0], values = [cells[i++][1]];
    while (i < cells.length && cells[i][0] === start + values.length) values.push(cells[i++][1]);
    sheet.getRange(row, start, 1, values.length).setValues([values]);
  }
}

const ACTION_TABLES = {
  update: 'Itinerary', delete: 'Itinerary', updateFlight: 'FlightInfo', deleteFlight: 'FlightInfo',
  toggleCheck: 'Checklist', deleteCheck: 'Checklist', updateExpense: 'Expense', deleteExpense: 'Expense'
};
const MUTATIONS = ['update','create','delete','createFlight','updateFlight','deleteFlight','toggleCheck','createCheck','deleteCheck','createExpense','updateExpense','deleteExpense','importNovemberTrip','setDefaultTrip'];

function resolveRequestTrip_(req) {
  const table = ACTION_TABLES[req.action] || (req.afterId ? 'Itinerary' : '');
  if (!table) return req.tripId || '';
  const row = getSheetData(SpreadsheetApp.getActiveSpreadsheet(), table).find(r => r.ID === String(req.id || req.afterId));
  if (!row) throw new Error('找不到指定的 ID');
  if (req.tripId && req.tripId !== row.TripID) throw new Error('資料不屬於這趟旅程');
  return row.TripID || '';
}

function getChangedTables_(req) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const names = /^(create|update|delete)$/.test(req.action) || req.action === 'importNovemberTrip'
    ? { itinerary:SHEETS.ITINERARY, flights:SHEETS.FLIGHT, expenses:SHEETS.EXPENSE }
    : /Flight$/.test(req.action) ? { flights:SHEETS.FLIGHT, itinerary:SHEETS.ITINERARY }
    : /Expense$/.test(req.action) ? { expenses:SHEETS.EXPENSE } : { checklist:SHEETS.CHECKLIST };
  if (req.action === 'importNovemberTrip') names.checklist = SHEETS.CHECKLIST;
  const changes = {};
  Object.keys(names).forEach(k => { changes[k] = getSheetData(ss, names[k]).filter(r => r.TripID === req.tripId); });
  return changes;
}

// 讀 Config 工作表（Key / Value 兩欄）成物件。defaultTrip 控制前端未指定 trip 時的預設旅行。
function getConfig(ss) {
  const sheet = ss.getSheetByName(SHEETS.CONFIG);
  if (!sheet) return {};
  const data = sheet.getDataRange().getDisplayValues();
  const cfg = {};
  for (let i = 1; i < data.length; i++) {
    const k = (data[i][0] || '').toString().trim();
    if (k) cfg[k] = (data[i][1] || '').toString().trim();
  }
  return cfg;
}

function latestTrip_(ss) {
  const dates = {};
  getSheetData(ss, SHEETS.ITINERARY).concat(getNovemberTripSeed().itinerary).forEach(r => {
    if (r.TripID && /^\d{4}-\d{2}-\d{2}$/.test(r.Date) && (!dates[r.TripID] || r.Date < dates[r.TripID])) dates[r.TripID] = r.Date;
  });
  return Object.keys(dates).sort((a,b) => dates[b].localeCompare(dates[a]) || a.localeCompare(b))[0];
}

function setDefaultTrip_(ss, tripId) {
  if (!tripId || !getSheetData(ss, SHEETS.ITINERARY).some(r => r.TripID === tripId)) throw new Error('請選擇已匯入的旅程');
  let sheet = ss.getSheetByName(SHEETS.CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.CONFIG);
    sheet.appendRow(['Key', 'Value']);
  }
  const rows = sheet.getDataRange().getDisplayValues();
  if (!rows[0] || rows[0][0] !== 'Key' || rows[0][1] !== 'Value') throw new Error('Config 欄位順序不符');
  const matches = rows.map((r,i) => ({r,i})).filter(v => v.i > 0 && v.r[0].trim() === 'defaultTrip');
  if (matches.length > 1) throw new Error('Config 的 defaultTrip 重複，請先修正');
  if (matches.length) {
    if (matches[0].r[1] !== tripId) sheet.getRange(matches[0].i + 1, 2).setNumberFormat('@').setValue(tripId);
  } else sheet.appendRow(['defaultTrip', tripId]);
}

function doGet(e) {
  let tripId = (e && e.parameter && e.parameter.trip) || '';
  const cache = CacheService.getScriptCache();

  // 前端未指定 trip → 用 Config 的 defaultTrip 解析（短 TTL，直接改試算表能較快生效）
  let resolvedTrip = '';
  if (!tripId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dt = getConfig(ss).defaultTrip || latestTrip_(ss);
    if (dt) { tripId = dt; resolvedTrip = dt; }
  }

  const gen = getDataGen(tripId);
  if (e && e.parameter && e.parameter.version === gen) {
    return ContentService.createTextOutput(JSON.stringify({status:'success', notModified:true, version:gen, resolvedTrip:tripId})).setMimeType(ContentService.MimeType.JSON);
  }
  const cacheKey = 'data_' + tripId + '_' + gen + (resolvedTrip ? '_d' : '');

  // 命中快取：直接回傳，免讀 5 張表
  const cached = cache.get(cacheKey);
  if (cached) {
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  const payload = Object.assign({status:'success', version:gen}, publicData_(getTripData_(tripId)));
  if (resolvedTrip) payload.resolvedTrip = resolvedTrip;
  const json = JSON.stringify(payload);
  // 快取最長 5 分鐘；人工修改未設定觸發器時也會定期更新。
  // 若 JSON 超過 CacheService 100KB 上限會丟例外，略過即可（仍正常回傳）。
  try { cache.put(cacheKey, json, 300); } catch (err) {}
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// 私人資料只透過驗證後的 POST 回傳；公開快取不含帳務或訂位資料。
function getTripData_(tripId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), result = {};
  const tables = {itinerary:SHEETS.ITINERARY, flights:SHEETS.FLIGHT, checklist:SHEETS.CHECKLIST, participants:SHEETS.PARTICIPANTS, expenses:SHEETS.EXPENSE};
  Object.keys(tables).forEach(k => { result[k] = tripId ? getSheetData(ss, tables[k]).filter(r => r.TripID === tripId) : []; });
  result.itinerary = result.itinerary.map(item => {
    const flight = item.Type === 'plane' && result.flights.find(f => f.ID === item.FlightID);
    return flight ? Object.assign({}, item, {Time:flight.DepartTime, ActualEndTime:flight.ArriveTime, Date:flight.DepartDate}) : item;
  });
  return result;
}
function publicData_(data) {
  return Object.assign({}, data, {
    expenses:[], participants:[],
    itinerary:data.itinerary.map(r => Object.assign({}, r, {Expense:r.ExpenseID ? '' : r.Expense, Participants:''})),
    flights:data.flights.map(r => Object.assign({}, r, {BookingRef:'', Note:''}))
  });
}
function validateRequest_(req) {
  const textFields = ['id','afterId','tripId','activity','note','item','description','flightNo','airline','departAirport','arriveAirport','bookingRef','participants','payer','category','expenseCategory','payMethod','day','query','mapUrl','imageUrl','url','time','departTime','arriveTime','actualEndTime','date','departDate','arriveDate','currency','type'];
  textFields.forEach(k => {
    if (req[k] === undefined) return;
    if (typeof req[k] !== 'string' || req[k].length > 10000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(req[k])) throw new Error('欄位格式錯誤：' + k);
    if (/^\s*=/.test(req[k])) throw new Error('文字欄位不可使用試算表公式：' + k);
  });
  ['time','departTime','arriveTime','actualEndTime'].forEach(k => {
    if (req[k] && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(req[k])) throw new Error('時間格式須為 HH:MM：' + k);
  });
  ['date','departDate','arriveDate'].forEach(k => {
    if (!req[k]) return;
    const d = new Date(req[k] + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req[k]) || isNaN(d.getTime()) || d.toISOString().slice(0,10) !== req[k]) throw new Error('日期格式錯誤：' + k);
  });
  ['expense','amount','duration'].forEach(k => {
    if (req[k] === undefined || req[k] === '') return;
    if (!['string','number'].includes(typeof req[k]) || !/^\d+(?:\.\d+)?$/.test(String(req[k])) || !Number.isFinite(Number(req[k]))) throw new Error('金額或時長須為非負數字：' + k);
  });
  ['mapUrl','imageUrl','url'].forEach(k => {
    if (req[k] && !/^https?:\/\/[^\s<>"']+$/i.test(req[k])) throw new Error('網址只接受 http 或 https：' + k);
  });
  if (req.type && !['activity','plane','subway','bus','train','taxi','bicycle','walking','transport'].includes(req.type)) throw new Error('交通類型錯誤');
  if (req.currency && !['JPY','TWD'].includes(req.currency)) throw new Error('幣別錯誤');
  ['checked','recordExpense'].forEach(k => { if (req[k] !== undefined && typeof req[k] !== 'boolean') throw new Error('勾選值格式錯誤'); });
}

function getSheetData(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function doPost(e) {
  const output = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
  let lock, req, writing = false;
  try {
    req = JSON.parse(e.postData.contents);
    if (MUTATIONS.indexOf(req.action) !== -1) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) return output.setContent(JSON.stringify({status:'error', message:'目前有人正在儲存，請稍後再試'}));
      req.tripId = resolveRequestTrip_(req);
    }
    const user = authenticateUser(req.apiKey, req.tripId);
    if (!user) return output.setContent(JSON.stringify({ status: "error", message: "金鑰錯誤或無權限" }));
    validateRequest_(req);
    writing = MUTATIONS.indexOf(req.action) !== -1;
    let result;
    switch (req.action) {
      case 'verify':
      case 'readPrivate':
        if (!req.tripId) throw new Error('請指定旅程');
        result = output.setContent(JSON.stringify({status:'success', message:'驗證成功，歡迎 ' + user, tripId:req.tripId, data:getTripData_(req.tripId), version:getDataGen(req.tripId)})); break;
      case 'update':        result = handleUpdate(req, user, output); break;
      case 'create':        result = handleCreate(req, user, output); break;
      case 'delete':        result = handleDeleteItinerary(req, user, output); break;
      case 'createFlight':  result = handleCreateFlight(req, user, output); break;
      case 'updateFlight':  result = handleUpdateFlight(req, user, output); break;
      case 'deleteFlight':  result = handleDeleteRow(req, user, output, SHEETS.FLIGHT); break;
      case 'toggleCheck':   result = handleToggleCheck(req, user, output); break;
      case 'createCheck':   result = handleCreateCheck(req, user, output); break;
      case 'deleteCheck':   result = handleDeleteRow(req, user, output, SHEETS.CHECKLIST); break;
      case 'createExpense': result = handleCreateExpense(req, user, output); break;
      case 'updateExpense': result = handleUpdateExpense(req, user, output); break;
      case 'deleteExpense': result = handleDeleteRow(req, user, output, SHEETS.EXPENSE); break;
      case 'searchPlace':   result = handleSearchPlace(req, user, output); break;
      case 'fetchMapImage': result = handleFetchMapImage(req, user, output); break;
      case 'setDefaultTrip':
        setDefaultTrip_(SpreadsheetApp.getActiveSpreadsheet(), req.tripId);
        result = output.setContent(JSON.stringify({status:'success', message:'已設定首頁預設行程', defaultTrip:req.tripId}));
        break;
      case 'importNovemberTrip':
        if (req.tripId !== getNovemberTripSeed().tripId) throw new Error('匯入旅程不符');
        result = output.setContent(JSON.stringify({status:'success', message:'11 月行程已匯入', imported:importNovemberTrip_(SpreadsheetApp.getActiveSpreadsheet())}));
        break;
      default:              result = output.setContent(JSON.stringify({ status: "error", message: "未知操作" })); break;
    }
    // 任何寫入操作後遞增版本號，使快取失效、並通知前端資料已變動
    if (writing) {
      SpreadsheetApp.flush();
      const payload = JSON.parse(result.getContent());
      payload.version = bumpDataGen(req.tripId);
      writing = false;
      if (payload.status === 'success') {
        payload.tripId = req.tripId;
        if (req.action !== 'setDefaultTrip') payload.changes = getChangedTables_(req);
      }
      result.setContent(JSON.stringify(payload));
    }
    return result;
  } catch (error) {
    return output.setContent(JSON.stringify({ status: "error", message: "系統錯誤: " + error.message }));
  } finally {
    try {
      if (writing) { SpreadsheetApp.flush(); bumpDataGen(req.tripId); }
    } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
  }
}

function handleUpdate(req, user, output) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.ITINERARY);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === req.id.toString()) {
      const linkedFlightId = String(data[i][IT_COL.FlightID-1] || '');
      if (linkedFlightId) {
        const linkedFlight = getSheetData(ss, SHEETS.FLIGHT).find(f => f.ID === linkedFlightId);
        if (!linkedFlight || linkedFlight.TripID !== req.tripId) throw new Error('關聯航班遺失或旅程不符，請先修復關聯');
        if (getSheetData(ss, SHEETS.ITINERARY).some(r => r.FlightID === linkedFlightId && r.TripID !== req.tripId)) throw new Error('航班關聯跨旅程，請先修復資料');
      }
      const linkedExpense = !!data[i][IT_COL.ExpenseID-1];
      setFields_(sheet, i+1, IT_COL, {
        Type: req.type,
        Activity: req.activity,
        Time: req.time,
        Duration: req.duration,
        ActualEndTime: req.actualEndTime,
        Note: req.note,
        Expense: linkedExpense ? (req.recordExpense === false ? '' : undefined) : req.expense,
        Currency: linkedExpense ? undefined : req.currency,
        Participants: req.participants,
        MapURL: req.mapUrl,
        ImageURL: req.imageUrl,
        Date: req.date
      });
      // Sync Expense record
      var existingExpenseId = data[i][IT_COL.ExpenseID-1] ? data[i][IT_COL.ExpenseID-1].toString() : '';
      if (req.recordExpense) {
        var exSheet = ss.getSheetByName(SHEETS.EXPENSE);
        if (exSheet) {
          // 已記帳資料只由費用表單更新，行程儲存不得覆寫。
          if (!existingExpenseId) {
            var newExpId = Utilities.getUuid().substring(0, 8);
            var tripId = data[i][IT_COL.TripID-1] ? data[i][IT_COL.TripID-1].toString() : '';
            exSheet.appendRow([newExpId, req.day||data[i][IT_COL.Day-1]||'', req.time||data[i][IT_COL.Time-1]||'', req.expenseCategory||'其他', req.activity||data[i][IT_COL.Activity-1]||'', req.expense||data[i][IT_COL.Expense-1]||'', req.currency||data[i][IT_COL.Currency-1]||'JPY', req.payer||'', req.payMethod||'', req.participants||data[i][IT_COL.Participants-1]||'', tripId, req.id]);
            sheet.getRange(i+1, IT_COL.ExpenseID).setValue(newExpId);
          }
        }
      } else if (req.recordExpense === false && existingExpenseId) {
        // Unlink: delete expense record and clear ExpenseID
        var exSheet2 = ss.getSheetByName(SHEETS.EXPENSE);
        if (exSheet2) {
          var exData2 = exSheet2.getDataRange().getValues();
          for (var ej = 1; ej < exData2.length; ej++) {
            if (exData2[ej][0].toString() === existingExpenseId) { exSheet2.deleteRow(ej+1); break; }
          }
        }
        sheet.getRange(i+1, IT_COL.ExpenseID).setValue('');
      }
      if (linkedFlightId && req.type !== undefined && req.type !== 'plane') {
        const flights = ss.getSheetByName(SHEETS.FLIGHT), rows = flights.getDataRange().getValues();
        const otherLinks = getSheetData(ss, SHEETS.ITINERARY).filter(r => r.FlightID === linkedFlightId && r.ID !== req.id);
        if (!otherLinks.length) {
          const index = rows.findIndex((r,n) => n > 0 && String(r[0]) === linkedFlightId);
          if (index > 0) flights.deleteRow(index + 1);
        }
        sheet.getRange(i+1, IT_COL.FlightID).setValue('');
      }
      // Sync FlightInfo when type=plane
      if (req.type === 'plane') {
        if (req.arriveTime) sheet.getRange(i+1, IT_COL.ActualEndTime).setValue(req.arriveTime);
        var flightId = data[i][IT_COL.FlightID-1] ? data[i][IT_COL.FlightID-1].toString() : '';
        var flSheet = ss.getSheetByName(SHEETS.FLIGHT);
        if (flSheet) {
          if (flightId) {
            var flData = flSheet.getDataRange().getValues();
            for (var j = 1; j < flData.length; j++) {
              if (flData[j][0].toString() === flightId) {
                handleUpdateFlight(Object.assign({}, req, {id:flightId, departTime:req.time, note:undefined}), user, output);
                break;
              }
            }
          } else {
            flightId = Utilities.getUuid().substring(0, 8);
            var tripId2 = data[i][IT_COL.TripID-1] ? data[i][IT_COL.TripID-1].toString() : '';
            flSheet.appendRow([flightId, req.flightNo||'', req.airline||'', req.departAirport||'', req.arriveAirport||'',
                               req.departDate||'', req.time||data[i][IT_COL.Time-1]||'', req.arriveDate||'', req.arriveTime||'',
                               req.bookingRef||'', req.note||data[i][IT_COL.Note-1]||'', tripId2]);
            sheet.getRange(i+1, IT_COL.FlightID).setValue(flightId);
          }
        }
      }
      return output.setContent(JSON.stringify({ status: "success", message: "更新成功 (操作者: " + user + ")" }));
    }
  }
  return output.setContent(JSON.stringify({ status: "error", message: "找不到指定的 ID" }));
}

function handleCreate(req, user, output) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.ITINERARY);
  const id = Utilities.getUuid().substring(0, 8);
  var flightId = '';
  if (req.type === 'plane') {
    var flSheet = ss.getSheetByName(SHEETS.FLIGHT);
    if (flSheet) {
      flightId = Utilities.getUuid().substring(0, 8);
      flSheet.appendRow([flightId, req.flightNo||'', req.airline||'', req.departAirport||'', req.arriveAirport||'',
                         req.departDate||'', req.time||'', req.arriveDate||'', req.arriveTime||'',
                         req.bookingRef||'', req.note||'', req.tripId||'']);
    }
  }
  var expenseId = '';
  if (req.recordExpense && parseFloat(req.expense) > 0) {
    var exSheet = ss.getSheetByName(SHEETS.EXPENSE);
    if (exSheet) {
      expenseId = Utilities.getUuid().substring(0, 8);
      exSheet.appendRow([expenseId, req.day||'', req.time||'', req.expenseCategory||'其他', req.activity||'', req.expense||'', req.currency||'JPY', req.payer||'', req.payMethod||'', req.participants||'', req.tripId||'', id]);
    }
  }
  const endTime = req.type === 'plane' ? (req.arriveTime||'') : '';
  const row = [id, req.day||'', req.time||'', req.duration||'', endTime, req.type||'activity', req.activity||'', req.note||'', req.expense||'', req.currency||'JPY', req.mapUrl||'', req.imageUrl||'', req.tripId||'', req.participants||'', flightId, expenseId, req.date||''];
  if (req.afterId) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === req.afterId.toString()) {
        sheet.insertRowAfter(i + 1);
        sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
        return output.setContent(JSON.stringify({ status: "success", message: "新增成功", id: id }));
      }
    }
  }
  sheet.appendRow(row);
  return output.setContent(JSON.stringify({ status: "success", message: "新增成功", id: id }));
}

function handleDeleteItinerary(req, user, output) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.ITINERARY);
  if (!sheet) return output.setContent(JSON.stringify({ status: "error", message: "工作表不存在" }));
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === req.id.toString()) {
      var flightId = data[i][IT_COL.FlightID-1] ? data[i][IT_COL.FlightID-1].toString() : '';
      if (flightId) {
        var flSheet = ss.getSheetByName(SHEETS.FLIGHT);
        if (flSheet) {
          var flData = flSheet.getDataRange().getValues();
          for (var j = 1; j < flData.length; j++) {
            if (flData[j][0].toString() === flightId) { flSheet.deleteRow(j+1); break; }
          }
        }
      }
      var expenseId = data[i][IT_COL.ExpenseID-1] ? data[i][IT_COL.ExpenseID-1].toString() : '';
      if (expenseId) {
        var exSheet = ss.getSheetByName(SHEETS.EXPENSE);
        if (exSheet) {
          var exData = exSheet.getDataRange().getValues();
          for (var ej = 1; ej < exData.length; ej++) {
            if (exData[ej][0].toString() === expenseId) { exSheet.deleteRow(ej+1); break; }
          }
        }
      }
      sheet.deleteRow(i + 1);
      return output.setContent(JSON.stringify({ status: "success", message: "已刪除 (操作者: " + user + ")" }));
    }
  }
  return output.setContent(JSON.stringify({ status: "error", message: "找不到指定的 ID" }));
}

function handleDeleteRow(req, user, output, sheetName) {
  if (sheetName === SHEETS.FLIGHT && getSheetData(SpreadsheetApp.getActiveSpreadsheet(), SHEETS.ITINERARY).some(r => r.FlightID === req.id)) {
    throw new Error('此航班已關聯行程，請從行程頁修改或刪除該行程');
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return output.setContent(JSON.stringify({ status: "error", message: "工作表不存在" }));
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === req.id.toString()) {
      sheet.deleteRow(i + 1);
      return output.setContent(JSON.stringify({ status: "success", message: "已刪除 (操作者: " + user + ")" }));
    }
  }
  return output.setContent(JSON.stringify({ status: "error", message: "找不到指定的 ID" }));
}

function handleCreateFlight(req, user, output) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.FLIGHT);
  if (!sheet) return output.setContent(JSON.stringify({ status: "error", message: "FlightInfo 工作表不存在" }));
  const id = Utilities.getUuid().substring(0, 8);
  sheet.appendRow([id, req.flightNo||'', req.airline||'', req.departAirport||'', req.arriveAirport||'',
                   req.departDate||'', req.departTime||'', req.arriveDate||'', req.arriveTime||'',
                   req.bookingRef||'', req.note||'', req.tripId||'']);
  return output.setContent(JSON.stringify({ status: "success", message: "航班新增成功", id: id }));
}

function handleUpdateFlight(req, user, output) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.FLIGHT);
  if (!sheet) return output.setContent(JSON.stringify({ status: "error", message: "FlightInfo 工作表不存在" }));
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === req.id.toString()) {
      const itSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ITINERARY);
      const itRows = itSheet ? itSheet.getDataRange().getValues() : [];
      const linked = itRows.map((r,n)=>({r,n})).filter(x => x.n > 0 && String(x.r[IT_COL.FlightID-1] || '') === req.id);
      if (linked.some(x => String(x.r[IT_COL.TripID-1] || '') !== req.tripId)) throw new Error('航班關聯跨旅程，請先修復資料');
      setFields_(sheet, i+1, FL_COL, {
        FlightNo: req.flightNo,
        Airline: req.airline,
        DepartAirport: req.departAirport,
        ArriveAirport: req.arriveAirport,
        DepartDate: req.departDate,
        DepartTime: req.departTime,
        ArriveDate: req.arriveDate,
        ArriveTime: req.arriveTime,
        BookingRef: req.bookingRef,
        Note: req.note
      });
      linked.forEach(x => setFields_(itSheet, x.n+1, IT_COL, {Time:req.departTime, ActualEndTime:req.arriveTime, Date:req.departDate}));
      return output.setContent(JSON.stringify({ status: "success", message: "航班更新成功" }));
    }
  }
  return output.setContent(JSON.stringify({ status: "error", message: "找不到航班 ID" }));
}

function handleToggleCheck(req, user, output) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CHECKLIST);
  if (!sheet) return output.setContent(JSON.stringify({ status: "error", message: "Checklist 工作表不存在" }));
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === req.id.toString()) {
      const cur = data[i][CK_COL.Checked - 1].toString().toUpperCase();
      const checked = req.checked === undefined ? cur !== 'TRUE' : req.checked === true;
      sheet.getRange(i+1, CK_COL.Checked).setValue(checked ? 'TRUE' : 'FALSE');
      return output.setContent(JSON.stringify({ status: "success", message: "狀態已切換" }));
    }
  }
  return output.setContent(JSON.stringify({ status: "error", message: "找不到項目 ID" }));
}

function handleCreateCheck(req, user, output) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CHECKLIST);
  if (!sheet) return output.setContent(JSON.stringify({ status: "error", message: "Checklist 工作表不存在" }));
  const id = Utilities.getUuid().substring(0, 8);
  sheet.appendRow([id, req.item||'', 'FALSE', req.tripId||'']);
  return output.setContent(JSON.stringify({ status: "success", message: "項目新增成功", id: id }));
}

function handleCreateExpense(req, user, output) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EXPENSE);
  if (!sheet) return output.setContent(JSON.stringify({ status: "error", message: "Expense 工作表不存在" }));
  const id = Utilities.getUuid().substring(0, 8);
  sheet.appendRow([id, req.day||'', req.time||'', req.category||'其他', req.description||'', req.amount||'', req.currency||'JPY', req.payer||'', req.payMethod||'', req.participants||'', req.tripId||'', req.linkedItineraryId||'']);
  return output.setContent(JSON.stringify({ status: "success", message: "費用新增成功", id: id }));
}

function handleUpdateExpense(req, user, output) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EXPENSE);
  if (!sheet) return output.setContent(JSON.stringify({ status: "error", message: "Expense 工作表不存在" }));
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === req.id.toString()) {
      setFields_(sheet, i+1, EX_COL, {
        Day: req.day,
        Time: req.time,
        Category: req.category,
        Description: req.description,
        Amount: req.amount,
        Currency: req.currency,
        Payer: req.payer,
        PayMethod: req.payMethod,
        Participants: req.participants
      });
      return output.setContent(JSON.stringify({ status: "success", message: "費用更新成功" }));
    }
  }
  return output.setContent(JSON.stringify({ status: "error", message: "找不到指定的費用 ID" }));
}

function handleSearchPlace(req, user, output) {
  const query = (req.query || '').trim();
  if (!query) return output.setContent(JSON.stringify({ status: "error", message: "請輸入搜尋關鍵字" }));
  const fallbackUrl = 'https://www.google.com/maps/search/' + encodeURIComponent(query);

  if (!PLACES_API_KEY) {
    return output.setContent(JSON.stringify({ status: "success", mapUrl: fallbackUrl, imageUrl: '', source: 'auto' }));
  }

  try {
    // Step 1: Text Search → get placeId, googleMapsUri, photos
    const searchResp = UrlFetchApp.fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'post', contentType: 'application/json',
      headers: { 'X-Goog-Api-Key': PLACES_API_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.googleMapsUri,places.photos' },
      payload: JSON.stringify({ textQuery: query, languageCode: 'zh-TW' })
    });
    const places = JSON.parse(searchResp.getContentText()).places;
    if (!places || places.length === 0) {
      return output.setContent(JSON.stringify({ status: "success", mapUrl: fallbackUrl, imageUrl: '', source: 'fallback' }));
    }

    const place = places[0];
    const mapUrl = place.googleMapsUri || fallbackUrl;
    let imageUrl = '';

    // Step 2: Get photo if available
    if (place.photos && place.photos.length > 0) {
      const photoName = place.photos[0].name;
      const photoResp = UrlFetchApp.fetch('https://places.googleapis.com/v1/' + photoName + '/media?maxHeightPx=400&skipHttpRedirect=true', {
        headers: { 'X-Goog-Api-Key': PLACES_API_KEY }
      });
      const photoData = JSON.parse(photoResp.getContentText());
      imageUrl = photoData.photoUri || '';
    }

    return output.setContent(JSON.stringify({
      status: "success", mapUrl: mapUrl, imageUrl: imageUrl,
      placeName: place.displayName ? place.displayName.text : '', source: 'places_api'
    }));
  } catch (err) {
    return output.setContent(JSON.stringify({ status: "success", mapUrl: fallbackUrl, imageUrl: '', source: 'error', error: err.message }));
  }
}

function handleFetchMapImage(req, user, output) {
  var url = (req.url || '').trim();
  if (!url) return output.setContent(JSON.stringify({ status: 'error', message: '請輸入網址' }));
  try {
    var resp = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true });
    var html = resp.getContentText();
    var m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!m) m = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    var imageUrl = m ? m[1] : '';
    return output.setContent(JSON.stringify({ status: 'success', imageUrl: imageUrl }));
  } catch (err) {
    return output.setContent(JSON.stringify({ status: 'error', message: err.message }));
  }
}

function authenticateUser(key, tripId) {
  if (!key) return null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.AUTH);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowKey = data[i][1].toString();
    const rowTrip = data[i][2] ? data[i][2].toString() : '';
    if (key === rowKey && (!rowTrip || tripId === rowTrip)) return data[i][0];
  }
  return null;
}
