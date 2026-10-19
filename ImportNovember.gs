// 可從 GAS 編輯器直接執行，不需把 Auth 金鑰寫在程式或版控內。
function importNovemberTrip() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const result = importNovemberTrip_(SpreadsheetApp.getActiveSpreadsheet());
    console.log(JSON.stringify(result));
    return result;
  } finally {
    try { SpreadsheetApp.flush(); bumpDataGen(getNovemberTripSeed().tripId); }
    finally { lock.releaseLock(); }
  }
}

function importNovemberTrip_(ss) {
  const seed = getNovemberTripSeed();
  const specs = [
    [SHEETS.ITINERARY, Object.keys(IT_COL), seed.itinerary],
    [SHEETS.FLIGHT, Object.keys(FL_COL), seed.flights],
    [SHEETS.CHECKLIST, Object.keys(CK_COL), seed.checklist]
  ];
  // 所有表先檢查完才寫入；重跑只補缺少的 ID，不覆寫人工編輯與勾選。
  const plans = specs.map(([name, headers, records]) => {
    const sheet = ss.getSheetByName(name);
    const data = sheet ? sheet.getDataRange().getDisplayValues() : [];
    const hasHeader = data.length > 0 && data[0].some(v => v !== '');
    if (hasHeader && headers.some((h, i) => data[0][i] !== h)) throw new Error(name + ' 欄位順序不符，請先核對表頭，尚未匯入');
    const tripCol = headers.indexOf('TripID');
    const ids = new Map(data.slice(1).map(r => [r[0], r[tripCol]]));
    records.forEach(r => {
      if (ids.has(r.ID) && ids.get(r.ID) !== seed.tripId) throw new Error('ID 與其他旅程衝突：' + r.ID);
    });
    const rows = records.filter(r => !ids.has(r.ID)).map(r => headers.map(h => r[h] == null ? '' : r[h]));
    return {name, headers, sheet, hasHeader, rows};
  });
  const result = {};
  plans.forEach(plan => {
    const sheet = plan.sheet || ss.insertSheet(plan.name);
    const rows = plan.hasHeader ? plan.rows : [plan.headers].concat(plan.rows);
    if (rows.length) {
      const start = plan.hasHeader ? sheet.getLastRow() + 1 : 1;
      const needed = start + rows.length - 1;
      if (needed > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
      if (plan.headers.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), plan.headers.length - sheet.getMaxColumns());
      // 純文字防止 09:00／2026-11-01 被自動改成日期數字；僅格式化新增區域。
      sheet.getRange(start, 1, rows.length, plan.headers.length).setNumberFormat('@').setValues(rows);
    }
    result[plan.name] = plan.rows.length;
  });
  return result;
}

// 2026/10/19：精簡既有註解並補齊確認航班；不重建資料或重設勾選／訂位代號。
function refreshNovemberTripDetails() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const result = refreshNovemberTripDetails_(SpreadsheetApp.getActiveSpreadsheet());
    console.log(JSON.stringify(result));
    return result;
  } finally {
    try { SpreadsheetApp.flush(); bumpDataGen(getNovemberTripSeed().tripId); }
    finally { lock.releaseLock(); }
  }
}

function refreshNovemberTripDetails_(ss) {
  const seed = getNovemberTripSeed();
  const specs = [
    {name:SHEETS.ITINERARY, columns:IT_COL, records:seed.itinerary, fields:r => {
      const fields = {Note:r.Note};
      if (r.Type === 'plane') Object.assign(fields, {Activity:r.Activity, Time:r.Time, ActualEndTime:r.ActualEndTime});
      if (r.ID === 'nov26-d1-02') fields.Time = r.Time;
      return fields;
    }},
    {name:SHEETS.FLIGHT, columns:FL_COL, records:seed.flights, fields:r => ({
      FlightNo:r.FlightNo, Airline:r.Airline, DepartAirport:r.DepartAirport, ArriveAirport:r.ArriveAirport,
      DepartDate:r.DepartDate, DepartTime:r.DepartTime, ArriveDate:r.ArriveDate, ArriveTime:r.ArriveTime, Note:r.Note
    })},
    {name:SHEETS.CHECKLIST, columns:CK_COL,
      records:seed.checklist.filter(r => ['nov26-check-01','nov26-check-11','nov26-check-24'].includes(r.ID)),
      fields:r => ({Item:r.Item})}
  ];
  // 所有 ID 與表頭驗證通過才開始寫入，避免套用到其他旅程或錯誤欄位。
  const plans = specs.map(spec => {
    const sheet = ss.getSheetByName(spec.name);
    if (!sheet) throw new Error('缺少工作表：' + spec.name);
    const data = sheet.getDataRange().getDisplayValues();
    if (Object.keys(spec.columns).some((h,i) => !data[0] || data[0][i] !== h)) throw new Error(spec.name + ' 欄位順序不符');
    const rows = spec.records.map(record => {
      const matches = data.map((row,i) => ({row,i})).filter(v => v.i > 0 && v.row[0] === record.ID);
      if (matches.length !== 1 || matches[0].row[spec.columns.TripID-1] !== seed.tripId) throw new Error('找不到唯一的旅程記錄：' + record.ID);
      const current = matches[0], fields = spec.fields(record);
      Object.keys(fields).forEach(key => { if (current.row[spec.columns[key]-1] === fields[key]) delete fields[key]; });
      return {row:current.i+1, fields};
    }).filter(r => Object.keys(r.fields).length);
    return {sheet, rows, spec};
  });
  const result = {};
  plans.forEach(plan => {
    plan.rows.forEach(r => setFields_(plan.sheet, r.row, plan.spec.columns, r.fields));
    result[plan.spec.name] = plan.rows.length;
  });
  return result;
}
