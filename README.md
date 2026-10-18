# PersonalTravel

沿用單一 `index.html`、Google Apps Script 與 Google Sheets 的旅行管理工具。新增 2026/11/01～11/10 大阪・滋賀・熊本棒球測試行程，旅程 ID 為 `osaka-shiga-kumamoto202611`。

## 本次更新狀態（2026/10/18）

- 已使用指定帳號，向現有 Google 試算表匯入 74 筆行程、2 筆航班與 24 項準備清單。
- 線上 GAS 已同步 `Code.gs`、`ImportNovember.gs`、`data/november2026.gs`，並將既有 Web App 更新為第 17 版，維持原 API URL 與存取設定。
- 本機網頁已實際連線，確認顯示「已與 Google 試算表同步」；20 項自動測試全數通過。這些結果不代表已量測真實操作延遲或保證無延遲。
- 前端與 GAS 原始碼統一保存在本儲存庫；GitHub Pages 發布前端，GAS 則需另外同步及部署。此次前端包含 11 月旅程選單、雲端同步狀態與效能改善。
- 本次以 GAS 編輯器同步；已備妥本機 `.clasp.json` 綁定，但尚未安裝／登入 clasp，後續 CLI 同步仍需依下方流程完成授權並保留線上 manifest。

## 預覽 11 月行程

開啟 `index.html?trip=osaka-shiga-kumamoto202611`，或從頁面左上選取「大阪・滋賀・熊本 2026/11」。尚未匯入雲端時會顯示「文件行程預覽」，解鎖後可匯入；預覽內容不接受一般編輯，避免誤以為已儲存。

可在專案目錄啟動本機伺服器：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

接著開啟 `http://127.0.0.1:8765/index.html?trip=osaka-shiga-kumamoto202611`。

## 資料與待確認事項

- `data/november2026.js` 是網頁預覽與 GAS 匯入共用的唯一初始資料；對應現有 Itinerary、FlightInfo、Checklist 欄位，沒有新增或搬動欄位。
- 原始依據為專案內使用者提供的 `2026_%E5%A4%A7%E9%98%AA%E6%BB%8B%E8%B3%80%E7%86%8A%E6%9C%AC_%E5%AE%8C%E6%95%B4%E8%A1%8C%E7%A8%8B%E8%88%87%E4%BA%A4%E9%80%9A.txt`。原檔保留不修改。未指定的出門、移動與休息時間是規劃估算，備註有標示。
- 11/03 皇子山 09:00 報到、10:00 開始；11/09 藤崎台 08:00 開門，目標 08:10～08:20 抵達、08:30 報到、09:30 開始。以主辦最新通知優先。
- 11/01 住宿已確認；大津安排 11/02 入住～11/04 退房共 2 晚，SOVA 並木坂安排 11/04 入住～11/10 退房共 6 晚，其餘訂單待核對。
- 新幹線 さくら 757、回程 IT795、機場巴士時刻、G-DOME 時段與餐廳訂位皆未視為已確認。未知去程起飛時間與回程抵達時間留白。
- 兩人姓名未提供，Participants 不建立虛構人物；Expense 不寫入預估支出，避免影響實際分帳。
- 匯入只新增缺少的固定 ID，不覆寫既有內容、勾選、其他旅行、Auth 或 Config。若匯入中斷可重跑；Google Sheets 多表寫入不具交易回滾，先完成的表可能已寫入。

2026/10/18 查核與補充：

- 11/01 依使用者更新，先到 S.TRAINING 入住放行李，再步行至大阪站 INOGATE 4F 的吉次（21:45 暫估）。[館方](https://barchica03.com/shoplist/sendaimeibutsu-gyutansumibiyaki-yoshiji/)公布營業至23:00，[店家經營的訂位頁](https://tabelog.com/osaka/A2701/A270101/27143819/)標示最後點餐22:00；出關延誤時重新評估，不視為已訂位。

- [JR 行李規則](https://railway.jr-central.co.jp/oversized-baggage/)：運動用品不因尺寸直接套用強制預約要求，但使用最後排後方的特大行李空間須預約對應座位。球棒袋仍建議事先向 JR 確認放置方式；航空託運另查航空公司。
- [九州產交機場巴士](https://www.sankobus.jp/bus/ap-limousine/jikoku/)：查得頁面顯示 2026/04/01 改正時刻，不能據此認定 11/10 不再變動；出發前一週與前一晚重新確認。
- [大津 Super Hotel](https://www.superhotel.co.jp/s_hotels/otsu/) 與 [SOVA 並木坂](https://hotelsova.co.jp/namikizaka/) 可核對入住資訊；個人訂單條款優先。

## 將資料寫入現有試算表

先把下列三份程式放進**綁定現有試算表的同一個 GAS 專案**：

1. `Code.gs`：取代原後端。
2. `ImportNovember.gs`：新增匯入功能。
3. `data/november2026.js`：在 GAS 編輯器新增 `data/november2026.gs`，貼上這份檔案內容即可。使用 clasp 時會自動處理副檔名；若線上已有此檔案，直接更新內容，避免重複宣告。

可在 GAS 編輯器執行 `importNovemberTrip()`，使用目前登入者對試算表的權限直接寫入。也可重新部署後，在網頁選取 11 月旅行、以原有 Auth 金鑰解鎖，再按「將 11 月行程匯入 Google 試算表」。金鑰需允許此 TripID 或空白代表全旅行；不要把金鑰寫進 Git。

匯入前會驗證三張表的表頭順序；任一不符則停止。缺少表時會建立，新增範圍使用純文字格式避免日期及時間被自動轉型。原本的 defaultTrip 不會變更；若要讓 11 月成為網站預設，手動將 Config 的 `defaultTrip` 設為上述旅程 ID。

## GAS 版控與線上同步

`Code.gs` 原本已由 Git 追蹤。Git 記錄本機修改，**不會自動更新線上 GAS**；`clasp push` 更新線上程式，而既有 `/exec` Web App 仍需建立新部署版本才會使用新程式。參考 [Google clasp 指南](https://developers.google.com/apps-script/guides/clasp) 與 [clasp 指令文件](https://github.com/google/clasp)。

第一次設定（需 Node.js 與本人 Google 授權）：

```powershell
npm install -g @google/clasp
clasp login
```

在 [Apps Script 使用者設定](https://script.google.com/home/usersettings) 啟用 Apps Script API，從現有專案設定取得**指令碼 ID**，不是 `/macros/s/.../exec` 的部署 ID。

先在獨立資料夾備份線上內容，避免 `pull` 蓋掉本次本機修改：

```powershell
New-Item -ItemType Directory -Force .gas-backup
Set-Location .gas-backup
clasp clone-script <指令碼ID>
Set-Location ..
Copy-Item .clasp.json.example .clasp.json
Copy-Item .gas-backup/appsscript.json appsscript.json
```

將 `.clasp.json` 的 `scriptId` 改為真正 ID。比較備份與本機版本，若線上有額外 `.gs`、HTML 或服務相依，先整合並加入 `.claspignore` 白名單；clasp push 同步整個專案，不能假設未列入的遠端檔案會保留。保留從線上取得的 manifest，避免覆蓋既有 Web App 設定、時區與 OAuth scopes。

```powershell
node --test tests/gas.test.cjs tests/frontend.test.cjs
clasp show-file-status
clasp push
clasp list-deployments
clasp create-version "11 月行程與效能改善"
clasp create-deployment --deploymentId <現有部署ID> --versionNumber <上一步版本號>
```

也可用 GAS 編輯器「部署 → 管理部署 → 編輯 → 新版本」更新原部署，維持既有 API URL。若另建部署，須同步更新 `index.html` 的 `API_BASE`。

`.claspignore` 僅允許後端、匯入器、共用初始資料與 manifest；不會把網頁、測試或原始行程文件推進 GAS。登入憑證、真實專案綁定與線上備份已列入 `.gitignore`。此專案不預設自動部署，也不提交帳號憑證。

## 效能與驗證

- 相鄰且有指定的欄位合併 `setValues`，不覆寫未指定欄位或公式。符合 [Google Apps Script 批次操作建議](https://developers.google.com/apps-script/guides/support/best-practices)。
- 以各旅行版本快取；版本未變時回傳 `notModified`，已指定旅行的快取命中不開啟試算表。
- 寫入回應附受影響資料表，前端不再接著完整 GET；舊版 GAS 回應仍可退回讀取流程。
- 僅建立選取日期的行程卡片，切換其他日期時才建立；日本日期判定使用 `Asia/Tokyo`。
- 中止並忽略過時的讀取，避免快速切旅行或儲存後被舊回應覆蓋。清單即時回饋、防止同項連點，後端接收明確勾選值。
- 寫入使用 ScriptLock，依記錄實際 TripID 驗證權限，避免金鑰或快取版本跨旅程混用。
- 綁定試算表的 `onEdit(e)` 簡易觸發條件使人工改表立即失效快取，不需額外安裝觸發器；若觸發失敗，最長約 5 分鐘後的新 GET 仍會讀到修改。頁面沒有即時推播，仍需重新載入才會發出 GET。
- 前端 PWA 快取也包含初始行程資料，可離線閱讀；資料狀態明確區分文件預覽與雲端同步。

測試使用 Node.js 內建 runner 與模擬的 GAS 服務，不需 npm 套件，不接觸正式試算表。涵蓋匯入重跑、表頭錯誤、跨旅程權限、批次寫入、航班／費用同步、鎖、快取與過時請求。真實 GAS 延遲與線上整合需完成 Google 授權及部署後量測，不能由本機測試推定。
