# PersonalTravel - 旅行行程管理系統

## 專案概述

這是一個基於 **Google Sheets + Google Apps Script (GAS)** 的旅行行程管理 Web App。  
前端為單一 HTML 檔案（`index.html`），後端邏輯寫在 `Code.gs`（需複製到 GAS 編輯器使用）。  
資料存儲在 Google Sheets 中，透過 GAS Web App API 進行 CRUD 操作。

## 技術架構

| 層級 | 技術 |
|------|------|
| 前端 | 單一 HTML + Tailwind CSS (CDN) + Vanilla JS |
| 後端 | Google Apps Script (GAS) — `Code.gs` |
| 資料庫 | Google Sheets (6 張工作表) |
| 部署 | GAS Web App（doGet / doPost） |

## Google Sheets 資料表結構

### 1. Itinerary（行程表）

| 欄位 (Column) | 名稱 | 型別 | 說明 |
|---|---|---|---|
| A | ID | string | 唯一識別碼（UUID 前 8 碼，或自訂如 D1-01） |
| B | Day | string | 天數標籤，例如 `第1天`、`第2天` |
| C | Time | string | 開始時間，格式 `HH:MM` |
| D | Duration | number | 預計花費時間（分鐘） |
| E | ActualEndTime | string | 實際結束時間，格式 `HH:MM` |
| F | Type | string | 類型：`activity`（行程）或交通類型（`plane` / `subway` / `bus` / `train` / `taxi` / `bicycle` / `walking`） |
| G | Activity | string | 行程名稱或交通描述 |
| H | Note | string | 備註 |
| I | Expense | number | 費用 |
| J | Currency | string | 幣別：`JPY`（日幣）或 `TWD`（台幣），預設 `JPY` |
| K | MapURL | string | Google Maps 連結 |
| L | ImageURL | string | 地點圖片網址 |
| M | TripID | string | 旅程識別碼，例如 `tokyo2026` |
| N | Participants | string | 參與者名稱（逗號分隔，例如 `Ben,Amy`），空白表示全員參加 |
| O | FlightID | string | 關聯的 FlightInfo ID（當 Type=plane 時自動建立） |
| P | ExpenseID | string | 關聯的 Expense ID（勾選「記錄到費用表」時自動建立） |
| Q | Date | string | 日期，格式 `YYYY-MM-DD`，用於自動判斷當天行程 |

**Code.gs 欄位對應常數：**
```javascript
const IT_COL = { ID:1, Day:2, Time:3, Duration:4, ActualEndTime:5, Type:6, Activity:7, Note:8, Expense:9, Currency:10, MapURL:11, ImageURL:12, TripID:13, Participants:14, FlightID:15, ExpenseID:16, Date:17 };
```

**航班同步機制：**
- 新增/編輯行程時若 Type=`plane`，會自動在 FlightInfo 表建立/更新對應航班記錄
- FlightInfo 為唯一來源；Itinerary.Time ↔ FlightInfo.DepartTime、Itinerary.ActualEndTime ↔ FlightInfo.ArriveTime、Itinerary.Date ↔ FlightInfo.DepartDate 雙向同步；已關聯航班不允許單獨刪除
- 刪除行程時若有 FlightID，會一併刪除關聯的 FlightInfo 記錄

**費用同步機制：**
- 初次勾選「記錄到費用表」會在 Expense 表建立記錄；既有關聯費用只由帳務表單更新，儲存行程不覆寫
- 未記帳時 Itinerary.Expense/Currency 為預估顯示值；已關聯時卡片、編輯與複製都以 Expense.Amount/Currency 為準
- 取消勾選時會刪除關聯的 Expense 記錄，並清空 ExpenseID 與舊顯示金額
- 刪除行程時若有 ExpenseID，會一併刪除關聯的 Expense 記錄

### 5. Participants（參與者）

| 欄位 (Column) | 名稱 | 型別 | 說明 |
|---|---|---|---|
| A | ID | string | 唯一識別碼 |
| B | Name | string | 參與者名稱 |
| C | TripID | string | 旅程識別碼 |

**Code.gs 欄位對應常數：**
```javascript
const PT_COL = { ID:1, Name:2, TripID:3 };
```

### 6. Expense（費用表）

帳務報表的唯一資料來源（Single Source of Truth）。行程的 Expense/Currency 欄位為卡片顯示用，只有勾選「記錄到費用表」才會建立此表的記錄。非行程消費（如加值西瓜卡、便利商店）可直接在帳務頁新增。

| 欄位 (Column) | 名稱 | 型別 | 說明 |
|---|---|---|---|
| A | ID | string | 唯一識別碼 |
| B | Day | string | 天數標籤，例如 `第1天` |
| C | Time | string | 時間 `HH:MM`（選填） |
| D | Category | string | 分類：交通/餐飲/住宿/購物/票券/儲值/娛樂/其他 |
| E | Description | string | 費用描述 |
| F | Amount | number | 金額 |
| G | Currency | string | 幣別：`JPY` 或 `TWD` |
| H | Payer | string | 支付人 |
| I | PayMethod | string | 支付方式：`信用卡` 或 `現金` |
| J | Participants | string | 分攤者（逗號分隔，空白=全員） |
| K | TripID | string | 旅程識別碼 |
| L | LinkedItineraryID | string | 關聯行程 ID（從行程同步時填入，獨立費用為空） |

**Code.gs 欄位對應常數：**
```javascript
const EX_COL = { ID:1, Day:2, Time:3, Category:4, Description:5, Amount:6, Currency:7, Payer:8, PayMethod:9, Participants:10, TripID:11, LinkedItineraryID:12 };
```

### 2. FlightInfo（航班資訊）

| 欄位 (Column) | 名稱 | 型別 | 說明 |
|---|---|---|---|
| A | ID | string | 唯一識別碼 |
| B | FlightNo | string | 航班號碼，例如 `BR198` |
| C | Airline | string | 航空公司 |
| D | DepartAirport | string | 出發機場代碼，例如 `TPE` |
| E | ArriveAirport | string | 抵達機場代碼，例如 `NRT` |
| F | DepartDate | string | 出發日期 |
| G | DepartTime | string | 出發時間 |
| H | ArriveDate | string | 抵達日期 |
| I | ArriveTime | string | 抵達時間 |
| J | BookingRef | string | 訂位代號 |
| K | Note | string | 備註 |
| L | TripID | string | 旅程識別碼 |

**Code.gs 欄位對應常數：**
```javascript
const FL_COL = { ID:1, FlightNo:2, Airline:3, DepartAirport:4, ArriveAirport:5, DepartDate:6, DepartTime:7, ArriveDate:8, ArriveTime:9, BookingRef:10, Note:11, TripID:12 };
```

### 3. Checklist（確認清單）

| 欄位 (Column) | 名稱 | 型別 | 說明 |
|---|---|---|---|
| A | ID | string | 唯一識別碼 |
| B | Item | string | 確認項目名稱 |
| C | Checked | string | 勾選狀態：`TRUE` / `FALSE` |
| D | TripID | string | 旅程識別碼 |

**Code.gs 欄位對應常數：**
```javascript
const CK_COL = { ID:1, Item:2, Checked:3, TripID:4 };
```

### 4. Auth（權限驗證）

| 欄位 (Column) | 名稱 | 型別 | 說明 |
|---|---|---|---|
| A | User | string | 使用者名稱，例如 `Admin`、`FriendA` |
| B | Key | string | 驗證金鑰（密碼） |
| C | TripID | string | 對應的旅程 ID（空白表示可存取所有旅程） |

## 檔案結構

```
PersonalTravel/
├── index.html          # 前端單頁應用（HTML + CSS + JS 全包）
├── Code.gs             # GAS 後端程式碼（需複製到 Google Apps Script 編輯器）
├── index_backup.html   # 備份檔
└── pic/                # 螢幕截圖等參考圖片
```

## API 端點（GAS Web App）

### GET（doGet）
- 取得公開行程、航班、清單；排除帳務、參與者、已記帳金額、航班訂位代號與航班備註
- 可透過 `?trip=tokyo2026` 篩選特定旅程

### POST（doPost）
所有寫入操作都透過 POST，以 `action` 欄位區分：

| action | 說明 | 必要參數 |
|--------|------|----------|
| `readPrivate` | 驗證後讀取完整私人資料 | `apiKey`, `tripId` |
| `verify` | 驗證密碼並回傳完整私人資料 | `apiKey`, `tripId` |
| `update` | 更新行程項目 | `apiKey`, `id`, 以及要更新的欄位 |
| `create` | 新增行程項目 | `apiKey`, `tripId`, `day`, `type`, `activity` 等 |
| `delete` | 刪除行程項目 | `apiKey`, `id` |
| `createExpense` | 新增費用 | `apiKey`, `tripId`, `description`, `amount`, `currency`, `payer`, `payMethod` 等 |
| `updateExpense` | 更新費用 | `apiKey`, `id`, 以及要更新的欄位 |
| `deleteExpense` | 刪除費用 | `apiKey`, `id` |
| `createFlight` | 新增航班 | `apiKey`, `tripId`, `flightNo`, `airline` 等 |
| `updateFlight` | 更新航班 | `apiKey`, `id`, 以及要更新的欄位 |
| `deleteFlight` | 刪除航班 | `apiKey`, `id` |
| `toggleCheck` | 切換清單勾選狀態 | `apiKey`, `id` |
| `createCheck` | 新增清單項目 | `apiKey`, `tripId`, `item` |
| `deleteCheck` | 刪除清單項目 | `apiKey`, `id` |
| `searchPlace` | 搜尋 Google 地點 | `apiKey`, `tripId`, `query` |

## 前端 UI 結構

- **主分頁**：📅 行程 / ✈️ 航班 / ✅ 確認清單 / 💰 帳務
- **帳務報表**：需驗證密碼才能查看。包含費用明細清單（可新增/編輯/刪除獨立費用）、費用總計、各人支付金額、應分攤金額、結算建議、分類統計、支付方式統計、每日花費。資料來源為 Expense 表（非 Itinerary）
- **並排顯示**：非全員參加的連續行程自動偵測並以左右雙欄並排呈現（分開行動一目了然）
- **行程**按天分頁顯示（第1天、第2天...），每個行程項目以卡片呈現
- **交通類型**以虛線框彩色卡片呈現，緊貼行程卡片（不加連接線）
- **編輯模式**需密碼驗證，啟用後可新增/編輯/刪除項目
- 使用 Modal 彈窗進行表單操作（編輯、新增、航班、清單）
- 棒球主題設計（記分板風格標題、紅金配色、LED 文字效果）

## 修改注意事項

1. **Code.gs 修改後**需重新部署 GAS Web App 才會生效（「部署」→「管理部署」→「編輯」→ 新版本）
2. **IT_COL / FL_COL / CK_COL 常數**必須與 Google Sheets 欄位位置一致
3. **index.html 是純前端**，可直接在 GitHub Pages 或本機開啟測試
4. 資料透過 `localStorage` 快取，載入時會先顯示快取再更新
5. 新增/修改 Sheets 欄位時，須同步更新：Code.gs 的欄位常數 → handleCreate / handleUpdate 函式 → index.html 的 Modal 表單和 render 函式
