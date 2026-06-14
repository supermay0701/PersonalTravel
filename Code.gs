const SHEETS = { ITINERARY: "Itinerary", FLIGHT: "FlightInfo", CHECKLIST: "Checklist", AUTH: "Auth", PARTICIPANTS: "Participants", EXPENSE: "Expense", CONFIG: "Config" };
// Google Places API Key - 填入後即可自動搜尋地點和圖片（留空則使用自動產生的 Maps 搜尋連結）
const PLACES_API_KEY = '';
const IT_COL = { ID:1, Day:2, Time:3, Duration:4, ActualEndTime:5, Type:6, Activity:7, Note:8, Expense:9, Currency:10, MapURL:11, ImageURL:12, TripID:13, Participants:14, FlightID:15, ExpenseID:16, Date:17 };
const FL_COL = { ID:1, FlightNo:2, Airline:3, DepartAirport:4, ArriveAirport:5, DepartDate:6, DepartTime:7, ArriveDate:8, ArriveTime:9, BookingRef:10, Note:11, TripID:12 };
const CK_COL = { ID:1, Item:2, Checked:3, TripID:4 };
const PT_COL = { ID:1, Name:2, TripID:3 };
const EX_COL = { ID:1, Day:2, Time:3, Category:4, Description:5, Amount:6, Currency:7, Payer:8, PayMethod:9, Participants:10, TripID:11, LinkedItineraryID:12 };

// 全域資料版本號：任何寫入都會 +1，當作快取失效與前端「資料是否變動」的訊號
function getDataGen() {
  const p = PropertiesService.getScriptProperties();
  let g = p.getProperty('dataGen');
  if (!g) { g = '1'; p.setProperty('dataGen', g); }
  return g;
}
function bumpDataGen() {
  const p = PropertiesService.getScriptProperties();
  const g = (parseInt(p.getProperty('dataGen') || '0', 10) + 1).toString();
  p.setProperty('dataGen', g);
  return g;
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

function doGet(e) {
  let tripId = (e && e.parameter && e.parameter.trip) || '';
  const gen = getDataGen();
  const cache = CacheService.getScriptCache();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 前端未指定 trip → 用 Config 的 defaultTrip 解析（短 TTL，直接改試算表能較快生效）
  let resolvedTrip = '';
  if (!tripId) {
    const dt = getConfig(ss).defaultTrip || '';
    if (dt) { tripId = dt; resolvedTrip = dt; }
  }

  const cacheKey = 'data_' + tripId + '_' + gen + (resolvedTrip ? '_d' : '');

  // 命中快取：直接回傳，免讀 5 張表
  const cached = cache.get(cacheKey);
  if (cached) {
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  let itinerary = getSheetData(ss, SHEETS.ITINERARY);
  let flights = getSheetData(ss, SHEETS.FLIGHT);
  let checklist = getSheetData(ss, SHEETS.CHECKLIST);
  let participants = getSheetData(ss, SHEETS.PARTICIPANTS);
  let expenses = getSheetData(ss, SHEETS.EXPENSE);
  if (tripId) {
    itinerary = itinerary.filter(r => r.TripID === tripId);
    flights = flights.filter(r => r.TripID === tripId);
    checklist = checklist.filter(r => r.TripID === tripId);
    participants = participants.filter(r => r.TripID === tripId);
    expenses = expenses.filter(r => r.TripID === tripId);
  }
  const payload = {
    status: "success", version: gen,
    itinerary: itinerary, flights: flights, checklist: checklist, participants: participants, expenses: expenses
  };
  if (resolvedTrip) payload.resolvedTrip = resolvedTrip;
  const json = JSON.stringify(payload);
  // 一般快取 6 小時；預設旅行解析結果用較短 TTL，讓改 Config 能較快生效。
  // 若 JSON 超過 CacheService 100KB 上限會丟例外，略過即可（仍正常回傳）。
  try { cache.put(cacheKey, json, resolvedTrip ? 300 : 21600); } catch (err) {}
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
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
  try {
    const req = JSON.parse(e.postData.contents);
    const user = authenticateUser(req.apiKey, req.tripId);
    if (!user) return output.setContent(JSON.stringify({ status: "error", message: "金鑰錯誤或無權限" }));
    const MUTATING = { update:1, create:1, delete:1, createFlight:1, updateFlight:1, deleteFlight:1, toggleCheck:1, createCheck:1, deleteCheck:1, createExpense:1, updateExpense:1, deleteExpense:1 };
    let result;
    switch (req.action) {
      case 'verify':        result = output.setContent(JSON.stringify({ status: "success", message: "驗證成功，歡迎 " + user })); break;
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
      default:              result = output.setContent(JSON.stringify({ status: "error", message: "未知操作" })); break;
    }
    // 任何寫入操作後遞增版本號，使快取失效、並通知前端資料已變動
    if (MUTATING[req.action]) bumpDataGen();
    return result;
  } catch (error) {
    return output.setContent(JSON.stringify({ status: "error", message: "系統錯誤: " + error.message }));
  }
}

function handleUpdate(req, user, output) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.ITINERARY);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === req.id.toString()) {
      if (req.type !== undefined)          sheet.getRange(i+1, IT_COL.Type).setValue(req.type);
      if (req.activity !== undefined)      sheet.getRange(i+1, IT_COL.Activity).setValue(req.activity);
      if (req.time !== undefined)          sheet.getRange(i+1, IT_COL.Time).setValue(req.time);
      if (req.duration !== undefined)      sheet.getRange(i+1, IT_COL.Duration).setValue(req.duration);
      if (req.actualEndTime !== undefined) sheet.getRange(i+1, IT_COL.ActualEndTime).setValue(req.actualEndTime);
      if (req.note !== undefined)          sheet.getRange(i+1, IT_COL.Note).setValue(req.note);
      if (req.expense !== undefined)       sheet.getRange(i+1, IT_COL.Expense).setValue(req.expense);
      if (req.currency !== undefined)      sheet.getRange(i+1, IT_COL.Currency).setValue(req.currency);
      if (req.participants !== undefined) sheet.getRange(i+1, IT_COL.Participants).setValue(req.participants);
      if (req.mapUrl !== undefined)        sheet.getRange(i+1, IT_COL.MapURL).setValue(req.mapUrl);
      if (req.imageUrl !== undefined)      sheet.getRange(i+1, IT_COL.ImageURL).setValue(req.imageUrl);
      if (req.date !== undefined)          sheet.getRange(i+1, IT_COL.Date).setValue(req.date);
      // Sync Expense record
      var existingExpenseId = data[i][IT_COL.ExpenseID-1] ? data[i][IT_COL.ExpenseID-1].toString() : '';
      if (req.recordExpense) {
        var exSheet = ss.getSheetByName(SHEETS.EXPENSE);
        if (exSheet) {
          if (existingExpenseId) {
            var exData = exSheet.getDataRange().getValues();
            for (var ei = 1; ei < exData.length; ei++) {
              if (exData[ei][0].toString() === existingExpenseId) {
                exSheet.getRange(ei+1, EX_COL.Day).setValue(req.day !== undefined ? req.day : data[i][IT_COL.Day-1]);
                exSheet.getRange(ei+1, EX_COL.Time).setValue(req.time !== undefined ? req.time : data[i][IT_COL.Time-1]);
                if (req.expenseCategory !== undefined) exSheet.getRange(ei+1, EX_COL.Category).setValue(req.expenseCategory);
                exSheet.getRange(ei+1, EX_COL.Description).setValue(req.activity !== undefined ? req.activity : data[i][IT_COL.Activity-1]);
                if (req.expense !== undefined)    exSheet.getRange(ei+1, EX_COL.Amount).setValue(req.expense);
                if (req.currency !== undefined)   exSheet.getRange(ei+1, EX_COL.Currency).setValue(req.currency);
                if (req.payer !== undefined)      exSheet.getRange(ei+1, EX_COL.Payer).setValue(req.payer);
                if (req.payMethod !== undefined)  exSheet.getRange(ei+1, EX_COL.PayMethod).setValue(req.payMethod);
                if (req.participants !== undefined) exSheet.getRange(ei+1, EX_COL.Participants).setValue(req.participants);
                break;
              }
            }
          } else {
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
                if (req.flightNo !== undefined)      flSheet.getRange(j+1, FL_COL.FlightNo).setValue(req.flightNo);
                if (req.airline !== undefined)        flSheet.getRange(j+1, FL_COL.Airline).setValue(req.airline);
                if (req.departAirport !== undefined)  flSheet.getRange(j+1, FL_COL.DepartAirport).setValue(req.departAirport);
                if (req.arriveAirport !== undefined)  flSheet.getRange(j+1, FL_COL.ArriveAirport).setValue(req.arriveAirport);
                if (req.departDate !== undefined)     flSheet.getRange(j+1, FL_COL.DepartDate).setValue(req.departDate);
                if (req.time !== undefined)           flSheet.getRange(j+1, FL_COL.DepartTime).setValue(req.time);
                if (req.arriveDate !== undefined)     flSheet.getRange(j+1, FL_COL.ArriveDate).setValue(req.arriveDate);
                if (req.arriveTime !== undefined)     flSheet.getRange(j+1, FL_COL.ArriveTime).setValue(req.arriveTime);
                if (req.bookingRef !== undefined)     flSheet.getRange(j+1, FL_COL.BookingRef).setValue(req.bookingRef);
                if (req.note !== undefined)           flSheet.getRange(j+1, FL_COL.Note).setValue(req.note);
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
      if (req.flightNo !== undefined)      sheet.getRange(i+1, FL_COL.FlightNo).setValue(req.flightNo);
      if (req.airline !== undefined)        sheet.getRange(i+1, FL_COL.Airline).setValue(req.airline);
      if (req.departAirport !== undefined)  sheet.getRange(i+1, FL_COL.DepartAirport).setValue(req.departAirport);
      if (req.arriveAirport !== undefined)  sheet.getRange(i+1, FL_COL.ArriveAirport).setValue(req.arriveAirport);
      if (req.departDate !== undefined)     sheet.getRange(i+1, FL_COL.DepartDate).setValue(req.departDate);
      if (req.departTime !== undefined)     sheet.getRange(i+1, FL_COL.DepartTime).setValue(req.departTime);
      if (req.arriveDate !== undefined)     sheet.getRange(i+1, FL_COL.ArriveDate).setValue(req.arriveDate);
      if (req.arriveTime !== undefined)     sheet.getRange(i+1, FL_COL.ArriveTime).setValue(req.arriveTime);
      if (req.bookingRef !== undefined)     sheet.getRange(i+1, FL_COL.BookingRef).setValue(req.bookingRef);
      if (req.note !== undefined)           sheet.getRange(i+1, FL_COL.Note).setValue(req.note);
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
      sheet.getRange(i+1, CK_COL.Checked).setValue(cur === 'TRUE' ? 'FALSE' : 'TRUE');
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
      if (req.day !== undefined)         sheet.getRange(i+1, EX_COL.Day).setValue(req.day);
      if (req.time !== undefined)        sheet.getRange(i+1, EX_COL.Time).setValue(req.time);
      if (req.category !== undefined)    sheet.getRange(i+1, EX_COL.Category).setValue(req.category);
      if (req.description !== undefined) sheet.getRange(i+1, EX_COL.Description).setValue(req.description);
      if (req.amount !== undefined)      sheet.getRange(i+1, EX_COL.Amount).setValue(req.amount);
      if (req.currency !== undefined)    sheet.getRange(i+1, EX_COL.Currency).setValue(req.currency);
      if (req.payer !== undefined)       sheet.getRange(i+1, EX_COL.Payer).setValue(req.payer);
      if (req.payMethod !== undefined)   sheet.getRange(i+1, EX_COL.PayMethod).setValue(req.payMethod);
      if (req.participants !== undefined) sheet.getRange(i+1, EX_COL.Participants).setValue(req.participants);
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
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowKey = data[i][1].toString();
    const rowTrip = data[i][2] ? data[i][2].toString() : '';
    if (key === rowKey && (!tripId || !rowTrip || tripId === rowTrip)) return data[i][0];
  }
  return null;
}
