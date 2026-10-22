// 同一份資料供網頁預覽與 GAS 匯入使用；行程採日本時間；航班起降採各機場當地時間。
function getNovemberTripSeed() {
  const tripId = 'osaka-shiga-kumamoto202611';
  const itinerary = [];
  const add = (day, time, duration, type, activity, note, place, extra) => {
    const seq = itinerary.filter(r => r.Day === '第' + day + '天').length + 1;
    itinerary.push(Object.assign({
      ID: 'nov26-d' + day + '-' + String(seq).padStart(2, '0'), Day: '第' + day + '天',
      Time: time, Duration: String(duration || ''), ActualEndTime: '', Type: type,
      Activity: activity, Note: note, Expense: '', Currency: 'JPY',
      MapURL: place ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place) : '',
      ImageURL: '', TripID: tripId, Participants: '', FlightID: '', ExpenseID: '',
      Date: '2026-11-' + String(day).padStart(2, '0')
    }, extra || {}));
  };
  const sova = 'HOTEL SOVA 熊本並木坂 熊本市中央区城東町5-29-1';
  const otsu = 'スーパーホテル大津駅前 滋賀県大津市京町3-2-7';
  const stadium = 'リブワーク藤崎台球場 熊本市中央区宮内4-1';
  const dome = 'G-DOME 熊本市東区御領6-2-32';
  add(1, '14:40', '', 'plane', '桃園 → 關西｜IT212', '桃園 T1 → 關西 T1；14:40 台灣起飛、17:55 日本抵達。', '関西国際空港', { FlightID: 'nov26-flight-out', ActualEndTime: '17:55' });
  add(1, '17:55', 90, 'activity', '關西機場入境、領行李、啟用 eSIM', '預留約 90 分鐘辦理入境與領取行李。', '関西国際空港');
  add(1, '19:30', 50, 'train', '關西機場 → 大阪｜HARUKA（暫估）', '直達大阪地下月台，約 50 分；出關後再選班次。', '大阪駅');
  add(1, '21:40', 20, 'taxi', '吉次 → S.TRAINING CENTER HOTEL', '飯後搭計程車；如仍有飯店接駁，可由櫻橋口搭乘。', 'S.TRAINING CENTER HOTEL OSAKA 福島6-23-8');
  add(1, '22:00', 20, 'activity', '飯店入住、放好球具行李', '住宿已訂。至對面新梅田研修センター 1F；櫃檯至 23:00，晚到先聯絡。', '新梅田研修センター');
  add(1, '20:20', 20, 'walking', '大阪站 → 吉次 バルチカ03', '出站後前往西側 INOGATE 大阪 4F（405），預留上樓時間。', '牛たん炭火焼 吉次 バルチカ03エキウエ店', {MapURL:'https://maps.app.goo.gl/VcHHRcbGdpe6yQJp9'});
  add(1, '20:40', 60, 'activity', '晚餐｜牛たん炭火焼 吉次（未訂位）', '先用餐再入住；INOGATE 大阪 4F，22:00 最後點餐。', '牛たん炭火焼 吉次 バルチカ03エキウエ店', {MapURL:'https://maps.app.goo.gl/VcHHRcbGdpe6yQJp9'});
  add(1, '22:20', 20, 'activity', '飯店休息、整理隔日用品', '補水、準備早餐，早點休息。', 'S.TRAINING CENTER HOTEL OSAKA 福島6-23-8');
  add(2, '09:30', 30, 'activity', '早餐、退房與前往大阪站', '帶球具與行李，優先接駁車或計程車到大阪站。', '大阪駅');
  add(2, '10:00', 50, 'train', '大阪 → 大津｜JR 新快速直達', '東海道線（京都線／琵琶湖線）；往野洲／米原，Suica 可搭普通車。', '大津駅');
  add(2, '11:00', 15, 'activity', 'Super Hotel 大津寄放行李', '先寄放行李，再前往天孫神社。今日除晚餐預約目標外，各段時間皆為暫估，依現場調整。', otsu);
  add(2, '11:20', 30, 'activity', '天孫神社參拜', '寄放行李後先來神社，再前往松本食堂；時間暫估。', '天孫神社 大津', {ID:'nov26-d2-tenson'});
  add(2, '12:00', 50, 'activity', '午餐｜松本食堂', '午餐後前往島ノ関駅；時間暫估，營業時間出發前確認。', '', {ID:'nov26-d2-lunch', MapURL:'https://maps.app.goo.gl/xB9FhGBo948yWWD3A'});
  add(2, '12:50', 20, 'walking', '松本食堂 → 島ノ関駅', '步行到車站，現場確認往大津市役所前方向的班次；時間暫估。', '', {ID:'nov26-d2-shimanoseki', MapURL:'https://maps.app.goo.gl/GuPULBeoAmn1jCoh8'});
  add(2, '13:10', 15, 'train', '島ノ関駅 → 大津市役所前站｜京阪電車', '含候車的規劃時間，非已確認班次；下車後步行到皇子山球場。', '', {ID:'nov26-d2-04', MapURL:'https://maps.app.goo.gl/Hru3nGrdsX52R3dH9'});
  add(2, '13:25', 15, 'walking', '大津市役所前站 → 皇子山球場', '步行到球場，確認隔天報到動線；時間暫估。', '皇子山球場', {ID:'nov26-d2-stadium-walk'});
  add(2, '13:40', 45, 'activity', '確認皇子山入口、輕度伸展', '確認報到入口，輕度伸展即可；時間暫估。', '皇子山球場', {ID:'nov26-d2-05'});
  add(2, '14:25', 35, 'transport', '皇子山 → 琵琶湖疏水（搭車或步行）', '依體力、天候與現場交通決定搭車或走路；時間暫估。', '', {ID:'nov26-d2-canal-transfer', MapURL:'https://maps.app.goo.gl/i4oJziwhuYbLUBJv8'});
  add(2, '15:00', 25, 'activity', '琵琶湖疏水散步', '散步後前往三尾神社；時間暫估。', '', {ID:'nov26-d2-canal', MapURL:'https://maps.app.goo.gl/i4oJziwhuYbLUBJv8'});
  add(2, '15:35', 25, 'activity', '三尾神社參拜', '接著前往大津港，移動方式依體力調整；時間暫估。', '', {ID:'nov26-d2-mio', MapURL:'https://maps.app.goo.gl/sNUJgxmcCWfU9xsk9'});
  add(2, '16:15', 30, 'activity', '大津港散步', '若提早結束，先回飯店入住、休息，再去吃晚餐；時間暫估。', '大津港', {ID:'nov26-d2-port'});
  add(2, '17:00', 45, 'activity', 'Super Hotel 入住、休息（彈性）', '11/02～11/04 共 2 晚住宿已訂。若太早回來就先回飯店等；依晚餐餐廳位置預留移動時間，目標 18:15 到店。', otsu, {ID:'nov26-d2-06'});
  add(2, '18:15', 90, 'activity', '晚餐｜滋賀大津ふぐ料理（待預約）', '預計預約 18:15，尚未訂位；實際用餐時間依訂位結果調整。', '', {ID:'nov26-d2-07', MapURL:'https://maps.app.goo.gl/V4gS8JofAnML2Eax7'});
  add(2, '20:00', 30, 'activity', 'Fresco 超市 大津店｜採買', '晚餐後買宵夜、點心與隔天測試的午餐；時間暫估，營業時間出發前確認。', '', {ID:'nov26-d2-fresco', MapURL:'https://maps.app.goo.gl/ekD67YEQs8cByLm8A'});
  add(2, '20:45', 30, 'activity', '回飯店、整理考試用品、早睡', '備妥證件、球具、飲水與午餐，確認隔天叫車；時間暫估。', otsu, {ID:'nov26-d2-rest'});
  add(3, '07:30', 30, 'activity', '早餐與考前準備', '早餐後確認證件與考試通知。', otsu);
  add(3, '08:00', 30, 'taxi', '大津飯店 → 皇子山球場', '預留候車與入口步行時間。', '皇子山球場');
  add(3, '08:30', 30, 'activity', '抵達皇子山、確認報到入口', '核對主辦指定入口。', '皇子山球場');
  add(3, '09:00', 60, 'activity', '皇子山術科測試｜報到', '09:00 報到、10:00 開始；攜帶證件與考試通知。', '皇子山球場');
  add(3, '10:00', '', 'activity', '皇子山術科測試｜開始', '結束時間未定，後續以用餐、休息為主。', '皇子山球場');
  add(3, '', '', 'taxi', '測試後 → 大津飯店', '結束後搭車回飯店。', otsu);
  add(3, '', '', 'activity', '晚餐｜Tonkatsu Taku（暫定）', '豬排店。依測試結束時間與動線安排；如果不順就吃飯店附近。飯後休息，確認隔天 10:00 前退房及新幹線車票。', '', {MapURL:'https://maps.app.goo.gl/j4EsoGjcWGv9ARDF8'});
  add(4, '09:00', 60, 'activity', '早餐、整理行李、10:00 前退房', '10:00 前退房，之後可在大津站附近吃早午餐。', otsu);
  add(4, '11:34', 34, 'train', '大津 → 新大阪｜JR 新快速直達（規劃）', '11:15 前到大津站；搭往大阪／姬路方向，在「新大阪」下車。', '新大阪駅');
  add(4, '12:08', 75, 'activity', '新大阪轉乘、買便當與確認行李座位', '預留 75 分鐘，找電梯、轉乘閘門與月台；確認球棒袋放置位置。', '新大阪駅');
  add(4, '13:23', 196, 'train', '新大阪 → 熊本｜新幹線（已訂票）', '新大阪 → 熊本車票已訂。原排さくら 757、13:23 → 16:39，實際班次與時間以票券為準；球棒袋放置方式及行李座位仍待確認。', '熊本駅');
  add(4, '16:50', 35, 'taxi', '熊本站 → HOTEL SOVA 熊本並木坂', '優先計程車；備案市電 A 系統往健軍町，通町筋下車步行 7～8 分。', sova);
  add(4, '17:30', 30, 'activity', 'SOVA 入住與休息', '11/04～11/10 共 6 晚住宿已訂；地址與入住規定以訂單為準。', sova);
  add(4, '18:00', 90, 'activity', '上通／下通晚餐', '依體力選餐廳，飯後休息。', '熊本 上通商店街');
  add(5, '08:30', 45, 'taxi', 'SOVA → G-DOME（時間依預約調整）', '車程約 25～40 分，另留候車時間。', dome);
  add(5, '09:15', 105, 'activity', 'G-DOME 練球（待預約）', '練習時段依預約調整。', dome);
  add(5, '11:00', 45, 'taxi', 'G-DOME → 勝烈亭 新市街本店', '練球後搭計程車前往午餐，含候車暫抓 45 分鐘；依 G-DOME 實際預約與路況調整。', '勝烈亭 新市街本店 熊本市中央区新市街8-18');
  add(5, '12:00', 90, 'activity', '午餐｜勝烈亭 新市街本店（豬排店）', '暫排第一次練球後吃平日午餐，預留候位與用餐時間，飯後回飯店休息。公開資料列午餐至 16:00，出發前再確認；約 ¥1,400 套餐品項與現價待確認（官網公告 2026/7/14 調價）。不接受訂位，現場候位；依 G-DOME 實際時段調整。', '勝烈亭 新市街本店 熊本市中央区新市街8-18');
  add(5, '17:45', 25, 'walking', 'SOVA → 鍋や TAMARI', '步行 15～25 分；也可搭市電至花畑町。', '鍋や TAMARI 熊本総本家');
  add(5, '18:15', 105, 'activity', '鍋や TAMARI 晚餐（未訂位）', '花畑町11-20 水田ビル3F；兩人訂位待確認。', '鍋や TAMARI 熊本総本家');
  add(5, '20:00', 25, 'walking', 'TAMARI → SOVA', '步行或市電回飯店，累了改計程車。', sova);
  add(6, '09:00', 15, 'walking', 'SOVA → 熊本城參觀入口', '依開放入口導航，步行約 8～15 分。', '熊本城');
  add(6, '09:15', 135, 'activity', '熊本城參觀', '依體力縮短參觀時間。', '熊本城');
  add(6, '11:30', 15, 'walking', '熊本城 → 城彩苑', '依出口步行約 10～20 分。', '桜の馬場 城彩苑');
  add(6, '11:45', 60, 'activity', '城彩苑午餐與土產', '', '桜の馬場 城彩苑');
  add(6, '12:45', 30, 'walking', '城彩苑 → 藤崎台球場', '步行約 15～30 分，雨天或疲累改搭車。', stadium);
  add(6, '13:15', 25, 'activity', '藤崎台場勘｜11/09 報到準備', '確認報到入口、集合及上下車位置。', stadium);
  add(6, '13:40', 30, 'walking', '藤崎台 → SAKURA MACHI', '步行約 20～30 分，也可搭計程車。', 'SAKURA MACHI Kumamoto');
  add(6, '14:10', 230, 'activity', 'SAKURA MACHI 購物、休憩與晚餐', '逛街、吃飯，依體力提早結束。', 'SAKURA MACHI Kumamoto');
  add(6, '18:00', 25, 'walking', 'SAKURA MACHI → SOVA', '步行回飯店，疲累改搭車。', sova);
  add(7, '08:30', 45, 'taxi', 'SOVA → G-DOME（可取消）', '依恢復狀況決定是否練球。', dome);
  add(7, '09:15', 105, 'activity', '第二次 G-DOME（彈性、待預約）', '時段待預約，可改為自由活動。', dome);
  add(7, '11:00', 45, 'taxi', 'G-DOME → 市區', '返回上通用餐、休息。', sova);
  add(7, '12:00', 60, 'activity', '上通午餐、午休', '', sova);
  add(7, '14:15', 45, 'subway', '通町筋 → 熊本駅前｜市電 A 系統', '通町筋搭 A 系統往田崎橋，於熊本駅前下車。', 'アミュプラザくまもと');
  add(7, '15:00', 180, 'activity', 'AMU PLAZA｜UNIQLO／GU 購物', 'UNIQLO 4F、GU 5F，出發前核對樓層。', 'アミュプラザくまもと');
  add(7, '18:00', 60, 'activity', '商場晚餐或回市區吃飯', '', 'アミュプラザくまもと');
  add(7, '19:00', 45, 'subway', '熊本駅前 → 通町筋 → SOVA', '搭 A 系統往健軍町，通町筋下車步行回飯店。', sova);
  add(8, '10:00', 45, 'subway', '通町筋 → 水前寺公園｜市電', '搭往健軍町方向，水前寺公園下車步行約 5 分。', '水前寺成趣園');
  add(8, '10:45', 75, 'activity', '水前寺成趣園散步', '輕鬆散步，保留體力。', '水前寺成趣園');
  add(8, '12:00', 60, 'activity', '水前寺附近午餐', '選不需久候的餐廳。', '水前寺公園');
  add(8, '13:00', 25, 'walking', '水前寺 → 熊本縣廳', '步行約 15～25 分，也可搭計程車。', '熊本県庁');
  add(8, '13:25', 45, 'activity', '魯夫雕像與銀杏大道', '拍照後提早回飯店；銀杏變色情況依天候。', '熊本県庁 ルフィ像');
  add(8, '14:10', 50, 'subway', '縣廳 → 市立体育館前 → 通町筋', '步行至市立体育館前，搭市電回通町筋。', sova);
  add(8, '17:30', 60, 'activity', '早晚餐、整理考試用品、早睡', '備妥考試用品，請飯店協助叫車。', sova);
  add(9, '07:00', 40, 'activity', '早餐、確認球具與證件', '球場 08:00 開門，目標 08:10～08:20 抵達。', sova);
  add(9, '07:55', 20, 'taxi', 'SOVA → 藤崎台球場入口', '車程約 5～15 分，另留候車與入口步行時間。', stadium);
  add(9, '08:15', 15, 'activity', '抵達藤崎台｜確認入口', '確認入口，準備 08:30 報到。', stadium);
  add(9, '08:30', 60, 'activity', '熊本術科測試｜報到', '攜帶主辦要求的證件與報到資料。', stadium);
  add(9, '09:30', '', 'activity', '熊本術科測試｜開始', '結束時間未定，後續安排可順延。', stadium);
  add(9, '17:00', 30, 'taxi', '測試後 → SOVA（暫估）', '回飯店放裝備、洗澡休息。', sova);
  add(9, '18:15', 15, 'walking', 'SOVA → 焼肉すどう 熊本本店', '上通町4-10 トラヤビル3F。', '焼肉すどう 熊本本店');
  add(9, '18:30', 90, 'activity', '焼肉すどう 慶功宴（待預約）', '兩人，預計每人 ¥11,000 套餐；測試延長時聯絡店家。', '焼肉すどう 熊本本店');
  add(9, '20:00', 60, 'activity', '藥妝補貨、整理行李', '核對託運重量、球棒袋包裝與隔天機場巴士。', sova);
  add(10, '07:40', 20, 'activity', '退房、確認護照與行李', '早餐與整理行李先完成，08:00 前出門。', sova);
  add(10, '08:00', 10, 'walking', 'SOVA → 通町筋機場巴士站', '08:10 前到日航飯店前，確認「阿蘇くまもと空港」方向。', 'ホテル日航熊本');
  add(10, '08:25', 46, 'bus', '通町筋 → 熊本機場｜機場巴士', '11/1 改正平日班：08:25 → 09:11；備案 08:37 → 09:18。', '阿蘇くまもと空港');
  add(10, '09:15', 165, 'activity', '虎航報到、球棒袋託運與安檢', '距起飛約 3.5 小時；確認特殊行李櫃檯與額度，報到依開櫃時間。', '阿蘇くまもと空港');
  add(10, '12:40', '', 'plane', '熊本 → 台南｜IT795', '12:40 日本起飛、14:25 台灣抵達。', '台南航空站', { FlightID: 'nov26-flight-home', ActualEndTime: '14:25' });
  const flights = [
    { ID:'nov26-flight-out', FlightNo:'IT212', Airline:'台灣虎航', DepartAirport:'TPE', ArriveAirport:'KIX', DepartDate:'2026-11-01', DepartTime:'14:40', ArriveDate:'2026-11-01', ArriveTime:'17:55', BookingRef:'', Note:'桃園 T1 → 關西 T1；起降時間皆為當地時間。', TripID:tripId },
    { ID:'nov26-flight-home', FlightNo:'IT795', Airline:'台灣虎航', DepartAirport:'KMJ', ArriveAirport:'TNN', DepartDate:'2026-11-10', DepartTime:'12:40', ArriveDate:'2026-11-10', ArriveTime:'14:25', BookingRef:'', Note:'熊本 → 台南；起降時間皆為當地時間。', TripID:tripId }
  ];
  const checklist = [
    '11/01 IT212 託運額度；HARUKA 大阪票券（QR／換票）與飯店入住櫃檯',
    '11/02 入住～11/04 退房：Super Hotel 大津 2 晚已訂，10:00 前退房',
    '11/04 入住～11/10 退房：SOVA 熊本並木坂 6 晚已訂；核對訂單地址與入住規定',
    '11/04 新大阪 → 熊本新幹線已訂；核對票券班次、時間、球棒袋放置方式及行李座位',
    '11/03 皇子山：09:00 報到、10:00 開始，確認考場入口',
    '11/09 藤崎台：08:00 開門、08:10～08:20 抵達、08:30 報到、09:30 開始',
    '11/05 G-DOME 預約、場地時段、費用、交通與取消規定',
    '11/07 第二次 G-DOME：依狀態決定，預約與取消規定',
    '11/05 鍋や TAMARI 兩人訂位、時間與鍋物品項',
    '11/09 焼肉すどう 熊本本店：建議 18:30 兩人、套餐價格待確認',
    '11/10 IT795：確認球棒袋託運規定與行李額度',
    '11/10 巴士：08:10 前到通町筋，08:25 → 09:11；前晚複查班表及付款方式',
    '證件：護照、機票、住宿訂單、考試通知、Visit Japan Web',
    'Suica 約 ¥5,000／人；兩張信用卡分開放；市電與公車付款規則不同',
    '現金兩人約 ¥30,000；若現金另加值 Suica，再準備約 ¥10,000',
    '海外刷卡通知、備用支付、小額日圓與千圓鈔',
    '球棒 3～4 支、90×32×42cm 球棒袋與固定保護材料',
    '手套、打擊手套、球鞋、襪子、運動服、護具、毛巾、飲水補給',
    '分別確認 JR 運動用品／特大行李空間與航空特殊／超尺寸託運規定',
    '液體藥妝、託運重量與回程購物空間',
    '日本 eSIM／熱點、網卡備援、充電器與行動電源攜帶規則',
    '個人常備藥、外套、雨具；不安排藥球購買、訓練或棄置',
    'Google Maps 離線地圖、住宿地址、交通路線與翻譯 App',
    '11/01 吉次：先晚餐再入住，確認兩人座位及行李放置；22:00 最後點餐'
  ].map((Item, i) => ({ ID:'nov26-check-' + String(i+1).padStart(2,'0'), Item, Checked:'FALSE', TripID:tripId }));
  return { tripId, itinerary, flights, checklist, participants:[], expenses:[] };
}
