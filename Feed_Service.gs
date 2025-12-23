/* * Feed_Service.gs
 * ปรับปรุง: รองรับ Script Properties (Secure) และป้องกันตัวแปรซ้ำ
 */

// ==========================================
// 🔑 1. CONFIGURATION (ดึงค่าจากตู้เซฟ)
// ==========================================
const FEED_CONFIG = {
  // ดึง ID กลาง (Spreadsheet)
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),

  // ดึง ID เฉพาะของระบบอาหาร (ตั้งชื่อว่า FEED_IMAGE_FOLDER_ID)
  IMAGE_FOLDER_ID: PropertiesService.getScriptProperties().getProperty("FEED_IMAGE_FOLDER_ID"),

  // ดึงค่า LINE จากส่วนกลาง (ถ้าใช้ Token ตัวเดียวกันกับระบบอื่น)
  LINE_ACCESS_TOKEN: PropertiesService.getScriptProperties().getProperty("LINE_TOKEN"),
  LINE_PUSH_TARGET: PropertiesService.getScriptProperties().getProperty("LINE_USER_ID"),

  // รหัสผ่าน (เก็บไว้ตรงนี้ได้ หรือจะย้ายไป Property ก็ได้)
  SETTINGS_PASSWORD: "3826",

  // 📄 MAPPING ชื่อชีต (คงเดิม 100%)
  SHEET_NAMES: {
   MATERIALS: 'อาหาร_สต็อกวัตถุดิบ',
   VITAMINS: 'อาหาร_สต็อกยา',
   FORMULAS: 'อาหาร_สูตรผสม',
   FORMULA_SUPPLEMENTS: 'อาหาร_สูตรวิตามิน',
   LOG_MIXING: 'อาหาร_ประวัติผสม',
   LOG_STOCK_IN: 'อาหาร_รับเข้า',
   LOG_ADJUST: 'อาหาร_ปรับสต็อก',
   PRICES: 'อาหาร_ราคา',
   LOG_EVENTS: 'อาหาร_บันทึกเหตุการณ์'
  }
};

// ตรวจสอบความปลอดภัย
if (!FEED_CONFIG.SPREADSHEET_ID) console.warn("⚠️ FEED: ยังไม่ได้ตั้งค่า SPREADSHEET_ID");
if (!FEED_CONFIG.IMAGE_FOLDER_ID) console.warn("⚠️ FEED: ยังไม่ได้ตั้งค่า FEED_IMAGE_FOLDER_ID");

const FEED_SS = SpreadsheetApp.openById(FEED_CONFIG.SPREADSHEET_ID);

function feed_getInitialData() {
  // 1. ดึงข้อมูลราคาจากชีต "อาหาร_ราคา" (สำหรับวัตถุดิบ)
  var priceMap = feed_getPriceMap(); 
  
  // 2. ดึงข้อมูลยา (ซึ่งมีราคาในตัวมันเองอยู่แล้ว)
  var supplements = feed_getSupplementMap(true);
  
  // 3. รวมราคาเป็นก้อนเดียวเพื่อส่งให้หน้าบ้านใช้ง่ายๆ
  var allPrices = {};
  
  // ใส่ราคาวัตถุดิบ
  priceMap.forEach((price, name) => {
    allPrices[name] = price;
  });
  
  // ใส่ราคายา (ดึงจากชีตอาหาร_สต็อกยา คอลัมน์ D)
  supplements.forEach(sup => {
    if(sup.pricePerUnit) allPrices[sup.name] = sup.pricePerUnit;
  });

  return {
    stock: feed_getMaterialStockMap(true),
    supplements: supplements,
    prices: allPrices // ✨ ส่งก้อนราคานี้ไปให้หน้าบ้านใช้
  };
}

// ฟังก์ชันเสริมสำหรับ Main Dashboard (เรียกจากหน้าหลัก)
function feed_getDashboardData() {
  try {
    const stock = feed_getMaterialStockMap(true);
    const lowStock = stock.filter(x => x.min > 0 && x.current <= x.min);
    return { stock: stock, lowStock: lowStock };
  } catch(e) { return null; }
}

function feed_getMixingPrepData(formulaName) {
  try {
    var priceMap = feed_getPriceMap();
    var allMaterials = feed_getMaterialStockMap(true);
    var formulaMainRatios = feed_getFormulaRatios(FEED_CONFIG.SHEET_NAMES.FORMULAS, formulaName);
    
    var mainItems = allMaterials.map(function(item) {
      var formulaItem = formulaMainRatios.find(r => r.name === item.name);
      return {
        name: item.name, currentStock: item.current, unit: item.unit, weightPerUnit: item.weightPerUnit,
        pricePerUnit: priceMap.get(item.name) || 0, amount: formulaItem ? formulaItem.amount : 0
      };
    });

    var allSupplements = feed_getSupplementMap(true);
    var formulaSupRatios = feed_getFormulaRatios(FEED_CONFIG.SHEET_NAMES.FORMULA_SUPPLEMENTS, formulaName);
    var supplementItems = allSupplements.map(function(item) {
      var formulaItem = formulaSupRatios.find(r => r.name === item.name);
      return {
        name: item.name, currentStock: item.current, unit: item.unit,
        pricePerUnit: item.pricePerUnit, amount: formulaItem ? formulaItem.amount : 0
      };
    });

    return { formulaName: formulaName, mainItems: mainItems, supplementItems: supplementItems };
  } catch (e) { return { error: e.message }; }
}

function feed_recordCustomMixing(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var formulaName = data.formulaName;
    var mainItems = data.mainItems;
    var supplementItems = data.supplementItems;
    
    var matMap = feed_getMaterialStockMap(); 
    var supMap = feed_getSupplementMap();
    var sheetMat = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.MATERIALS); 
    var sheetVit = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.VITAMINS);
    var sheetLog = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.LOG_MIXING);
    
    var timestamp = new Date();
    // สร้างรหัสการผสม (Mix ID)
    var mixId = timestamp.getTime().toString(); 
    
    var logRows = [];
    
    // --- คำนวณยอดรวมเพื่อส่ง Flex ---
    var totalCost = 0;
    var totalWeight = 0;
    var usedMain = []; // เก็บรายการวัตถุดิบที่ใช้จริง
    var usedSup = [];  // เก็บรายการยาที่ใช้จริง

    // 1. ตัดสต็อกวัตถุดิบหลัก
    mainItems.forEach(item => {
      if(item.amount > 0) {
        if(matMap.has(item.name)) {
           var info = matMap.get(item.name);
           var newStock = info.current - item.amount;
           sheetMat.getRange(info.rowIndex, 2).setValue(newStock);
           
           var cost = item.amount * item.pricePerUnit;
           var weight = item.amount * item.weightPerUnit; // แปลงกระสอบเป็น กก.
           
           totalCost += cost;
           totalWeight += weight;
           
           logRows.push([mixId, timestamp, formulaName, item.name, item.amount, item.pricePerUnit, cost]);
           
           // เก็บไว้โชว์ในการ์ด 2
           usedMain.push({ name: item.name, qty: item.amount, unit: 'กระสอบ', cost: cost });
        }
      }
    });

    // 2. ตัดสต็อกยา/วิตามิน
    supplementItems.forEach(item => {
      if(item.amount > 0) {
        if(supMap.has(item.name)) {
           var info = supMap.get(item.name);
           var newStock = info.current - item.amount;
           sheetVit.getRange(info.rowIndex, 2).setValue(newStock);
           
           var cost = item.amount * item.pricePerUnit;
           var weight = (item.unit === 'กก.') ? item.amount : 0; // เฉพาะหน่วย กก. ถึงนับน้ำหนัก
           
           totalCost += cost;
           totalWeight += weight;

           logRows.push([mixId, timestamp, formulaName, "[เสริม] "+item.name, item.amount, item.pricePerUnit, cost]);
           
           // เก็บไว้โชว์ในการ์ด 3
           usedSup.push({ name: item.name, qty: item.amount, unit: item.unit, cost: cost });
        }
      }
    });
    
    // บันทึกลง Sheet
    if(logRows.length > 0) {
      sheetLog.getRange(sheetLog.getLastRow()+1, 1, logRows.length, logRows[0].length).setValues(logRows);
    }
    
    // ✨ เรียกฟังก์ชันส่ง Flex Message แบบ Carousel 3 การ์ด
    feed_sendMixingFlexCarousel({
      formula: formulaName,
      totalWeight: totalWeight,
      totalCost: totalCost,
      mainList: usedMain,
      supList: usedSup,
      timestamp: timestamp
    });

    return feed_getInitialData();

  } catch (e) { return { error: e.message }; } finally { lock.releaseLock(); }
}

// ==========================================
// 💬 NEW: SEND MIXING FLEX (Carousel 3 Cards)
// ==========================================
function feed_sendMixingFlexCarousel(data) {
  if (!FEED_CONFIG.LINE_ACCESS_TOKEN || !FEED_CONFIG.LINE_PUSH_TARGET) return;

  var bubbles = [];
  var costPerKg = (data.totalWeight > 0) ? (data.totalCost / data.totalWeight) : 0;

  // --- การ์ดใบที่ 1: สรุปภาพรวม (Summary) ---
  bubbles.push({
    "type": "bubble",
    "header": {
      "type": "box", "layout": "vertical", "backgroundColor": "#10B981", // สีเขียวโรงเรือน
      "contents": [
        { "type": "text", "text": "🏭 โรงเรือนผสมอาหาร", "weight": "bold", "color": "#FFFFFF", "size": "lg" },
        { "type": "text", "text": "รายงานการผลิตเสร็จสิ้น", "color": "#D1FAE5", "size": "xs" }
      ],
      "paddingAll": "lg"
    },
    "body": {
      "type": "box", "layout": "vertical",
      "contents": [
        { "type": "text", "text": "สูตร: " + data.formula, "weight": "bold", "size": "xl", "color": "#064E3B", "align": "center" },
        { "type": "text", "text": Utilities.formatDate(data.timestamp, "Asia/Bangkok", "dd MMM HH:mm"), "size": "xs", "color": "#9CA3AF", "align": "center", "margin": "xs" },
        { "type": "separator", "margin": "md" },
        {
          "type": "box", "layout": "horizontal", "margin": "lg",
          "contents": [
            { "type": "text", "text": "น้ำหนักรวม", "size": "sm", "color": "#555555" },
            { "type": "text", "text": data.totalWeight.toLocaleString() + " กก.", "size": "sm", "color": "#111111", "align": "end", "weight": "bold" }
          ]
        },
        {
          "type": "box", "layout": "horizontal", "margin": "sm",
          "contents": [
            { "type": "text", "text": "ต้นทุนรวม", "size": "sm", "color": "#555555" },
            { "type": "text", "text": data.totalCost.toLocaleString() + " บ.", "size": "sm", "color": "#111111", "align": "end", "weight": "bold" }
          ]
        },
        { "type": "separator", "margin": "lg" },
        { "type": "text", "text": "ต้นทุนเฉลี่ย / กก.", "size": "xs", "color": "#6B7280", "align": "center", "margin": "lg" },
        { "type": "text", "text": "฿" + costPerKg.toFixed(2), "size": "4xl", "color": "#F59E0B", "weight": "bold", "align": "center", "margin": "sm" } // สีทองตัวใหญ่
      ]
    },
    "footer": {
      "type": "box", "layout": "vertical",
      "contents": [
         { "type": "button", "action": { "type": "uri", "label": "📊 เช็คสต็อกคงเหลือ", "uri": getAppUrl() }, "style": "secondary", "height": "sm" }
      ]
    }
  });

  // --- การ์ดใบที่ 2: วัตถุดิบหลัก (Main Materials) ---
  if (data.mainList.length > 0) {
    var mainRows = data.mainList.map(item => ({
      "type": "box", "layout": "horizontal", "margin": "sm",
      "contents": [
        { "type": "text", "text": item.name, "size": "sm", "color": "#555555", "flex": 7 },
        { "type": "text", "text": item.qty + " " + item.unit, "size": "sm", "color": "#92400E", "weight": "bold", "align": "end", "flex": 3 }
      ]
    }));

    bubbles.push({
      "type": "bubble",
      "header": {
        "type": "box", "layout": "vertical", "backgroundColor": "#F59E0B", // สีส้มวัตถุดิบ
        "contents": [{ "type": "text", "text": "🌽 วัตถุดิบหลักที่ใช้", "weight": "bold", "color": "#FFFFFF" }],
        "paddingAll": "md"
      },
      "body": {
        "type": "box", "layout": "vertical",
        "contents": mainRows
      }
    });
  }

  // --- การ์ดใบที่ 3: ยาและวิตามิน (Supplements) ---
  if (data.supList.length > 0) {
    // สร้างหัวตารางเล็กๆ
    var supRows = [
      {
        "type": "box", "layout": "horizontal", "margin": "sm",
        "contents": [
          { "type": "text", "text": "รายการ", "size": "xs", "color": "#9CA3AF", "flex": 5 },
          { "type": "text", "text": "จำนวน", "size": "xs", "color": "#9CA3AF", "align": "end", "flex": 2 },
          { "type": "text", "text": "ยอดเงิน", "size": "xs", "color": "#9CA3AF", "align": "end", "flex": 3 }
        ]
      },
      { "type": "separator", "margin": "xs" }
    ];

    // วนลูปรายการยา
    data.supList.forEach(item => {
      supRows.push({
        "type": "box", "layout": "horizontal", "margin": "sm",
        "contents": [
          { "type": "text", "text": item.name, "size": "xs", "color": "#555555", "flex": 5, "wrap": true },
          { "type": "text", "text": item.qty + "", "size": "xs", "color": "#111111", "align": "end", "flex": 2 },
          { "type": "text", "text": item.cost.toLocaleString(), "size": "xs", "color": "#059669", "weight": "bold", "align": "end", "flex": 3 } // สีเขียวแสดงเงิน
        ]
      });
    });

    bubbles.push({
      "type": "bubble",
      "header": {
        "type": "box", "layout": "vertical", "backgroundColor": "#6366F1", // สีม่วงยา
        "contents": [{ "type": "text", "text": "💊 ยาและวัคซีน", "weight": "bold", "color": "#FFFFFF" }],
        "paddingAll": "md"
      },
      "body": {
        "type": "box", "layout": "vertical",
        "contents": supRows
      }
    });
  }

  // ส่ง Flex Message (Carousel)
  var flexMessage = {
    "type": "flex",
    "altText": "✅ รายงานการผลิต: " + data.formula,
    "contents": {
      "type": "carousel",
      "contents": bubbles
    }
  };

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + FEED_CONFIG.LINE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ to: FEED_CONFIG.LINE_PUSH_TARGET, messages: [flexMessage] }),
    muteHttpExceptions: true
  });
}
// ==========================================
// 📥 STOCK IN WITH PDF & EXPENSE TRACKING
// ==========================================

function feed_recordBatchStockIn(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    var items = data.items;
    var supplier = data.supplier;
    var grandTotal = data.grandTotal;
    var invoiceImageBase64 = data.invoiceImage; 
    
    var matMap = feed_getMaterialStockMap(); 
    var supMap = feed_getSupplementMap();
    var sheetMat = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.MATERIALS); 
    var sheetVit = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.VITAMINS);
    var sheetLog = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.LOG_STOCK_IN);
    
    var timestamp = new Date(); 
    var docNo = "RC-" + Utilities.formatDate(timestamp, "Asia/Bangkok", "yyyyMMdd") + "-" + Math.floor(Math.random() * 1000);

    // 1. จัดการรูปบิล (และดึง ID รูปมาใช้ทำ Flex)
    var invoiceUrl = "";
    var invoiceFileId = ""; // ✨ เพิ่มตัวแปรนี้
    if (invoiceImageBase64) {
      var folder = DriveApp.getFolderById(FEED_CONFIG.IMAGE_FOLDER_ID);
      var blob = Utilities.newBlob(Utilities.base64Decode(invoiceImageBase64.split(',')[1]), 'image/jpeg', docNo + "_bill.jpg");
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      invoiceUrl = file.getUrl();
      invoiceFileId = file.getId(); // ✨ ดึง ID ออกมาเพื่อส่งให้ LINE
    }

    var logRows = []; 
    var pdfItems = []; 

    // 2. Loop ตัดสต็อก
    items.forEach(function(item) {
      if (!item.amount || item.amount <= 0) return;
      
      var isMaterial = matMap.has(item.name);
      var stockInfo = isMaterial ? matMap.get(item.name) : supMap.get(item.name);
      if (!stockInfo) return;

      var addAmount = parseFloat(item.amount);
      var unitLabel = item.unit;
      var stockAddAmount = addAmount;
      if (!isMaterial && item.unitType === 'pack') { 
         stockAddAmount = addAmount * stockInfo.packWeight; 
      }
      var newStock = stockInfo.current + stockAddAmount;
      (isMaterial ? sheetMat : sheetVit).getRange(stockInfo.rowIndex, 2).setValue(newStock);
      
      var price = parseFloat(item.price) || 0;
      var total = addAmount * price;

      // บันทึกลง Sheet
      logRows.push([
        timestamp, 
        item.name, 
        addAmount, 
        `Batch: ${unitLabel} (${docNo})`, 
        price,
        total,
        supplier,
        "", 
        invoiceUrl
      ]);
      
      pdfItems.push({
        name: item.name,
        qty: addAmount,
        unit: unitLabel,
        price: price,
        total: total
      });
    });

    // 3. สร้าง PDF & ส่ง Flex Message (เปลี่ยนตรงนี้)
    if (pdfItems.length > 0) {
      var pdfUrl = feed_createStockInPDF(docNo, timestamp, supplier, pdfItems, grandTotal);
      logRows.forEach(row => row[7] = pdfUrl);
      sheetLog.getRange(sheetLog.getLastRow() + 1, 1, logRows.length, logRows[0].length).setValues(logRows);
      
      // ✨ เรียกฟังก์ชันส่ง Flex Message แทนตัวเดิม
      feed_sendStockInFlex({
        docNo: docNo,
        supplier: supplier,
        items: pdfItems,
        total: grandTotal,
        pdfUrl: pdfUrl,
        invoiceFileId: invoiceFileId, // ส่ง ID รูปไปโชว์
        timestamp: timestamp
      });
    }

    return feed_getInitialData();

  } catch (e) { return { error: e.message }; } finally { lock.releaseLock(); }
}
// ฟังก์ชันสร้าง PDF
function feed_createStockInPDF(docNo, date, supplier, items, grandTotal) {
  try {
    // HTML Template สำหรับใบเสร็จ
    var html = `
      <div style="font-family: 'Sarabun', sans-serif; padding: 20px;">
        <div style="border-bottom: 2px solid #d97706; padding-bottom: 10px; margin-bottom: 20px;">
          <h1 style="color: #d97706; margin: 0;">นิพนธ์ฟาร์ม (Niphon Farm)</h1>
          <h3 style="margin: 0; color: #555;">ใบสำคัญจ่าย / ใบรับสินค้า (Goods Receipt)</h3>
        </div>
        
        <table style="width: 100%; margin-bottom: 20px;">
          <tr>
            <td><strong>เลขที่เอกสาร:</strong> ${docNo}</td>
            <td style="text-align: right;"><strong>วันที่:</strong> ${Utilities.formatDate(date, "Asia/Bangkok", "dd/MM/yyyy HH:mm")}</td>
          </tr>
          <tr>
            <td><strong>ผู้ขาย/ร้านค้า:</strong> ${supplier}</td>
            <td style="text-align: right;"><strong>ผู้ทำรายการ:</strong> Admin</td>
          </tr>
        </table>

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">ลำดับ</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">รายการ</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">จำนวน</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">หน่วย</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">ราคา/หน่วย</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">รวมเงิน</th>
          </tr>
    `;
    
    items.forEach((item, index) => {
      html += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${index + 1}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${item.name}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.qty.toLocaleString()}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.unit}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.price.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.total.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        </tr>
      `;
    });

    html += `
          <tr style="background-color: #fffbeb; font-weight: bold;">
            <td colspan="5" style="border: 1px solid #ddd; padding: 8px; text-align: right;">ยอดรวมทั้งสิ้น (Grand Total)</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right; color: #d97706;">${parseFloat(grandTotal).toLocaleString(undefined, {minimumFractionDigits:2})} บาท</td>
          </tr>
        </table>
        
        <div style="margin-top: 50px; display: flex; justify-content: space-between;">
           <div style="text-align: center; width: 40%;">
              <div style="border-bottom: 1px solid #000; height: 30px;"></div>
              <p>ผู้รับสินค้า/ผู้บันทึก</p>
           </div>
           <div style="text-align: center; width: 40%;">
              <div style="border-bottom: 1px solid #000; height: 30px;"></div>
              <p>ผู้อนุมัติจ่าย</p>
           </div>
        </div>
      </div>
    `;

    // แปลง HTML เป็น PDF
    var blob = Utilities.newBlob(html, MimeType.HTML, docNo + ".html");
    var pdf = blob.getAs(MimeType.PDF).setName(docNo + ".pdf");
    
    // บันทึกลง Folder
    var folder = DriveApp.getFolderById(FEED_CONFIG.IMAGE_FOLDER_ID);
    var file = folder.createFile(pdf);
    
    // ตั้งค่าให้ใครก็ได้ที่มีลิงก์ดูได้ (เพื่อให้เปิดใน LINE ได้ง่าย)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
    
  } catch(e) { 
    Logger.log("PDF Error: " + e.message);
    return "Error creating PDF"; 
  }
}

function feed_recordAdjustment(data) {
  return feed_genericUpdate(FEED_CONFIG.SHEET_NAMES.LOG_ADJUST, 'ปรับปรุง', data);
}

function feed_genericUpdate(logSheetName, action, data, multiplier=1) {
  try {
    var matMap = feed_getMaterialStockMap(); var supMap = feed_getSupplementMap();
    var item = matMap.get(data.material) || supMap.get(data.material);
    var sheet = FEED_SS.getSheetByName(matMap.has(data.material) ? FEED_CONFIG.SHEET_NAMES.MATERIALS : FEED_CONFIG.SHEET_NAMES.VITAMINS);

    if (!item) throw new Error("ไม่พบรายการ: " + data.material);

    var newStock = item.current + (parseFloat(data.amount) * multiplier);
    sheet.getRange(item.rowIndex, 2).setValue(newStock);

    let logNote = data.reason || '';
    if (data.category) {
      logNote = `[${data.category}] - ${logNote}`;
    }

    FEED_SS.getSheetByName(logSheetName).appendRow([new Date(), data.material, data.amount, logNote]);
    feed_sendLineNotify(`📝 ${action}: ${data.material} (${data.amount})\nเหตุผล: ${logNote}\nคงเหลือ: ${newStock}`);
    return feed_getInitialData();
  } catch (e) { return { error: e.message }; }
}

function feed_recordEventWithImage(data) {
  try {
    var folder = DriveApp.getFolderById(FEED_CONFIG.IMAGE_FOLDER_ID);
    var blob = Utilities.newBlob(Utilities.base64Decode(data.imageFile.split(',')[1]), 'image/png', 'event.png');
    var file = folder.createFile(blob);

    let logNote = data.note || '';
    if (data.eventType) {
      logNote = `[${data.eventType}] - ${logNote}`;
    }

    FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.LOG_EVENTS).appendRow([new Date(), logNote, file.getUrl()]);
    feed_sendLineNotify("📸 บันทึกภาพ: " + logNote + "\n" + file.getUrl());
    return { success: true };
  } catch(e) { return { error: e.message }; }
}

function feed_addNewMaterial(data, pass) { return feed_addNewItemGeneric(FEED_CONFIG.SHEET_NAMES.MATERIALS, FEED_CONFIG.SHEET_NAMES.FORMULAS, data, pass, true); }
function feed_addNewSupplement(data, pass) { return feed_addNewItemGeneric(FEED_CONFIG.SHEET_NAMES.VITAMINS, FEED_CONFIG.SHEET_NAMES.FORMULA_SUPPLEMENTS, data, pass, false); }

function feed_addNewItemGeneric(sheetName, formulaSheetName, data, pass, isMaterial) {
  // ใช้รหัสผ่านจาก FEED_CONFIG
  if (pass !== FEED_CONFIG.SETTINGS_PASSWORD) return { error: 'รหัสผ่านผิด' };
  
  var sheet = FEED_SS.getSheetByName(sheetName);
  var allNames = feed_getAllNamesGeneric(FEED_CONFIG.SHEET_NAMES.MATERIALS).concat(feed_getAllNamesGeneric(FEED_CONFIG.SHEET_NAMES.VITAMINS));
  if (allNames.includes(data.name)) return { error: 'ชื่อนี้มีแล้ว' };
  var rowData = isMaterial ? [data.name, data.initialStock, data.minStock, data.unit, data.weightPerUnit] : [data.name, data.initialStock, data.unit, data.pricePerUnit, data.minStock, data.type, 1];
  sheet.appendRow(rowData);
  var fSheet = FEED_SS.getSheetByName(formulaSheetName);
  fSheet.insertColumnAfter(fSheet.getLastColumn());
  fSheet.getRange(1, fSheet.getLastColumn()+1).setValue(data.name);
  fSheet.getRange(2, fSheet.getLastColumn()+1, fSheet.getLastRow()-1, 1).setValue(0);
  return { success: true };
}

// --- 4. HELPER FUNCTIONS ---

function feed_getMaterialStockMap(asArray) {
  var sheet = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.MATERIALS);
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  var list = data.map((row, i) => ({
    name: row[0], current: parseFloat(row[1]) || 0, min: parseFloat(row[2]) || 0, unit: row[3], weightPerUnit: parseFloat(row[4]) || 0, rowIndex: i + 2
  })).filter(x => x.name);
  if (asArray) return list;
  var map = new Map(); list.forEach(x => map.set(x.name, x)); return map;
}

function feed_getSupplementMap(asArray) {
  var sheet = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.VITAMINS);
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var list = data.map((row, i) => ({
    name: row[0], current: parseFloat(row[1]) || 0, unit: row[2], pricePerUnit: parseFloat(row[3]) || 0, min: parseFloat(row[4]) || 0,
    type: row[5], packWeight: parseFloat(row[6]) || 1,
    rowIndex: i + 2
  })).filter(x => x.name);
  if (asArray) return list;
  var map = new Map(); list.forEach(x => map.set(x.name, x)); return map;
}

function feed_getPriceMap() {
  var sheet = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.PRICES);
  var data = sheet.getRange(2, 1, sheet.getLastRow()-1, 2).getValues();
  var map = new Map(); data.forEach(r => map.set(r[0], parseFloat(r[1]) || 0)); return map;
}

function feed_getFormulaRatios(sheetName, formulaName) {
  var sheet = FEED_SS.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var formulaRow = data.find(r => r[0] === formulaName);
  if (!formulaRow) return [];
  var ratios = [];
  for (var i = 1; i < headers.length; i++) { ratios.push({ name: headers[i], amount: parseFloat(formulaRow[i]) || 0 }); }
  return ratios;
}

function feed_getAllNamesGeneric(sheetName) { var s = FEED_SS.getSheetByName(sheetName); if(!s) return []; return s.getRange(2, 1, s.getLastRow()-1, 1).getValues().flat(); }

// --- 5. NOTIFICATION & REPORTING ---

function feed_sendLineNotify(msg) { 
  if(FEED_CONFIG.LINE_ACCESS_TOKEN) { 
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', { method: 'post', headers: {'Authorization': 'Bearer '+FEED_CONFIG.LINE_ACCESS_TOKEN, 'Content-Type': 'application/json'}, payload: JSON.stringify({ to: FEED_CONFIG.LINE_PUSH_TARGET, messages: [{type: 'text', text: msg}] }), muteHttpExceptions: true }); 
  } 
}

function feed_getFullReportData() {
  var sheet = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.LOG_MIXING);
  var cost = 0, count = 0;
  var costByMat = {}; var costByFormula = {};
  if (sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow()-1, 7).getValues();
    var now = new Date(); var unique = new Set();
    data.forEach(r => {
      if (new Date(r[1]).getMonth() === now.getMonth()) {
        var amount = parseFloat(r[6]) || 0; cost += amount; unique.add(r[0]);
        costByFormula[r[2]] = (costByFormula[r[2]] || 0) + amount;
        var matName = r[3].replace('[เสริม] ', ''); costByMat[matName] = (costByMat[matName] || 0) + amount;
      }
    });
    count = unique.size;
  }
  var chartMat = Object.keys(costByMat).map(k => ({label: k, value: costByMat[k]})).sort((a,b) => b.value - a.value).slice(0, 6);
  var chartFormula = Object.keys(costByFormula).map(k => ({label: k, value: costByFormula[k]}));
  var getRecent = function(sn) {
    var s = FEED_SS.getSheetByName(sn); if(!s||s.getLastRow()<2) return [];
    return s.getRange(Math.max(2, s.getLastRow()-4), 1, Math.min(5, s.getLastRow()-1), 4).getValues().reverse()
      .map(r => ({ date: new Date(r[0]).toLocaleDateString('th-TH'), name: r[1], amount: r[2], note: r[3] }));
  };

  return {
    costThisMonth: cost, totalMixesThisMonth: count,
    recentStockIn: getRecent(FEED_CONFIG.SHEET_NAMES.LOG_STOCK_IN), recentAdjust: getRecent(FEED_CONFIG.SHEET_NAMES.LOG_ADJUST),
    chartMat: chartMat, chartFormula: chartFormula
  };
}

// --- 6. DAILY REPORT (Flex Message) ---
function feed_getLastMixingSummary() {
  const sheet = FEED_SS.getSheetByName(FEED_CONFIG.SHEET_NAMES.LOG_MIXING);
  if (sheet.getLastRow() < 2) return null;

  const lastRow = sheet.getLastRow();
  const rangeToRead = Math.max(2, lastRow - 100);
  const data = sheet.getRange(rangeToRead, 1, lastRow - rangeToRead + 1, 7).getValues();

  const allMixIds = data.map(row => row[0]).filter(id => id);
  if (allMixIds.length === 0) return null;
  const lastMixId = allMixIds[allMixIds.length - 1];

  const matMap = feed_getMaterialStockMap();
  const supMap = feed_getSupplementMap();

  let summary = {
    mixId: lastMixId, formulaName: '', timestamp: null, totalCost: 0, totalWeight: 0, costPerKg: 0
  };
  let hasData = false;

  data.filter(row => row[0] === lastMixId).forEach(row => {
    hasData = true;
    summary.formulaName = row[2];
    summary.timestamp = row[1];
    summary.totalCost += parseFloat(row[6]) || 0;
    const matName = row[3];
    const amountUsed = parseFloat(row[4]) || 0;
    if (matName.includes('[เสริม]')) {
      summary.totalWeight += amountUsed;
    } else {
      const matInfo = matMap.get(matName);
      if (matInfo && matInfo.weightPerUnit) {
        summary.totalWeight += amountUsed * matInfo.weightPerUnit;
      }
    }
  });

  if (summary.totalWeight > 0) summary.costPerKg = summary.totalCost / summary.totalWeight;
  if (hasData) return summary;
  return null;
}

function feed_buildMixingSummaryBubble(summary) {
  if (!summary) {
    return { "type": "bubble", "header": { "type": "box", "layout": "vertical", "contents": [ {"type": "text", "text": "⚠️ สรุปการผสมล่าสุด", "weight": "bold", "size": "xl", "color": "#FFFFFF"} ], "backgroundColor": "#EF4444", "paddingAll": "lg" }, "body": { "type": "box", "layout": "vertical", "contents": [ {"type": "text", "text": "ไม่พบรายการผสมที่สมบูรณ์ในช่วงนี้", "wrap": true} ] } };
  }
  const dateOptions = { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  const dateStr = new Date(summary.timestamp).toLocaleDateString('th-TH', dateOptions);
  return { "type": "bubble", "header": { "type": "box", "layout": "vertical", "contents": [ {"type": "text", "text": "✅ สรุปรายการผสมล่าสุด", "weight": "bold", "size": "xl", "color": "#FFFFFF"}, {"type": "text", "text": `สูตร: ${summary.formulaName}`, "size": "md", "color": "#DDDDDD", "margin": "sm"}, {"type": "text", "text": `เมื่อ: ${dateStr}`, "size": "xs", "color": "#DDDDDD", "margin": "sm"} ], "backgroundColor": "#10b981", "paddingAll": "lg" }, "body": { "type": "box", "layout": "vertical", "spacing": "md", "contents": [ { "type": "box", "layout": "horizontal", "contents": [ { "type": "box", "layout": "vertical", "flex": 1, "contents": [ {"type": "text", "text": "💰 ต้นทุนรวม", "size": "sm", "color": "#0047AB"}, {"type": "text", "text": `${summary.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} บาท`, "weight": "bold", "size": "xl", "color": "#0047AB"} ] }, { "type": "separator" }, { "type": "box", "layout": "vertical", "flex": 1, "contents": [ {"type": "text", "text": "⚖️ น้ำหนักรวม", "size": "sm", "color": "#546E7A"}, {"type": "text", "text": `${summary.totalWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })} กก.`, "weight": "bold", "size": "xl", "color": "#546E7A"} ] } ] }, {"type": "separator"}, { "type": "box", "layout": "vertical", "contents": [ {"type": "text", "text": "💵 เฉลี่ยต้นทุนต่อ กก.", "size": "sm", "color": "#B8860B"}, {"type": "text", "text": `${summary.costPerKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} บาท/กก.`, "weight": "bold", "size": "xxl", "color": "#B8860B"} ], "alignItems": "center", "paddingAll": "md", "backgroundColor": "#FFEBEE", "cornerRadius": "md" } ] } };
}

function feed_buildInventoryBubble(materials, supplements, appUrl) {
  const isLow = (item) => item.min > 0 && item.current <= item.min;
  const matList = materials.sort((a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name));
  const supList = supplements.sort((a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name));
  const content = [];
  content.push({ "type": "box", "layout": "baseline", "contents": [ {"type": "text", "text": "📦 วัตถุดิบหลัก", "weight": "bold", "size": "md", "color": "#0047AB"} ], "spacing": "xs" });
  matList.forEach(item => { const color = isLow(item) ? "#CC0000" : "#000000"; content.push({ "type": "box", "layout": "baseline", "contents": [ {"type": "text", "text": `${isLow(item)?"🔴":"🟢"} ${item.name}`, "flex": 4, "size": "sm", "color": color}, {"type": "text", "text": `${item.current.toLocaleString(undefined,{maximumFractionDigits:0})} ${item.unit}`, "flex": 2, "size": "sm", "align": "end", "weight": "bold", "color": color} ], "spacing": "none", "margin": "sm" }); });
  content.push({"type": "separator", "margin": "md"});
  content.push({ "type": "box", "layout": "baseline", "contents": [ {"type": "text", "text": "💊 วิตามิน/ยา", "weight": "bold", "size": "md", "color": "#1B5E20"} ], "spacing": "xs", "margin": "md" });
  supList.forEach(item => { const color = isLow(item) ? "#CC0000" : "#000000"; content.push({ "type": "box", "layout": "baseline", "contents": [ {"type": "text", "text": `${isLow(item)?"🔴":"🟢"} ${item.name}`, "flex": 4, "size": "sm", "color": color}, {"type": "text", "text": `${item.current.toLocaleString(undefined,{maximumFractionDigits:1})} ${item.unit}`, "flex": 2, "size": "sm", "align": "end", "weight": "bold", "color": color} ], "spacing": "none", "margin": "sm" }); });
  return { "type": "bubble", "header": { "type": "box", "layout": "vertical", "contents": [ {"type": "text", "text": "สต็อกคงเหลือทั้งหมด", "weight": "bold", "size": "xl", "color": "#FFFFFF"}, {"type": "text", "text": "รายการที่เหลือต่ำกว่าขั้นต่ำ มีสัญลักษณ์ 🔴", "size": "xs", "color": "#DDDDDD", "margin": "sm"} ], "backgroundColor": "#3b82f6", "paddingAll": "lg" }, "body": { "type": "box", "layout": "vertical", "contents": content, "paddingAll": "lg" }, "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [ { "type": "button", "style": "primary", "height": "sm", "action": { "type": "uri", "label": "เปิดแอปนิพนธ์ฟาร์ม 🐷", "uri": appUrl }, "color": "#10b981" } ] } };
}

function feed_sendDailyReportFlexMessage() {
  const initialData = feed_getInitialData();
  const materials = initialData.stock;
  const supplements = initialData.supplements;
  const mixingSummary = feed_getLastMixingSummary();
  const appUrl = ScriptApp.getService().getUrl();

  const bubble1 = feed_buildMixingSummaryBubble(mixingSummary);
  const bubble2 = feed_buildInventoryBubble(materials, supplements, appUrl);

  const payload = { to: FEED_CONFIG.LINE_PUSH_TARGET, messages: [ { type: 'flex', altText: 'รายงานสต็อกและสรุปการผสมประจำวัน', contents: { type: "carousel", contents: [bubble1, bubble2] } } ] };

  if (FEED_CONFIG.LINE_ACCESS_TOKEN && FEED_CONFIG.LINE_PUSH_TARGET) {
    try {
      UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', { method: 'post', headers: { 'Authorization': 'Bearer ' + FEED_CONFIG.LINE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, payload: JSON.stringify(payload), muteHttpExceptions: true });
      Logger.log('Daily Flex Message sent.');
    } catch (e) { Logger.log('Error sending Flex: ' + e.message); }
  }
}

// ==========================================
// 💬 NEW: SEND FLEX MESSAGE (Stock In)
// ==========================================
function feed_sendStockInFlex(data) {
  if (!FEED_CONFIG.LINE_ACCESS_TOKEN || !FEED_CONFIG.LINE_PUSH_TARGET) return;

  // 1. สร้างรายการสินค้า (Dynamic Rows) - โชว์สูงสุด 4 รายการ
  var itemRows = [];
  var maxShow = 4;
  
  data.items.slice(0, maxShow).forEach(item => {
    itemRows.push({
      "type": "box", "layout": "horizontal",
      "contents": [
        { "type": "text", "text": item.name, "size": "sm", "color": "#555555", "flex": 6 },
        { "type": "text", "text": item.qty + " " + item.unit, "size": "sm", "color": "#111111", "align": "end", "flex": 4 }
      ]
    });
  });

  if (data.items.length > maxShow) {
    itemRows.push({
      "type": "text", "text": `...และอีก ${data.items.length - maxShow} รายการ`, "size": "xs", "color": "#aaaaaa", "align": "center", "margin": "sm"
    });
  }

  // 2. ส่วนประกอบรูปภาพ (Hero Image) - ถ้ามีรูปบิล
  var heroComponent = null;
  if (data.invoiceFileId) {
    // แปลง Google Drive ID เป็น Direct Link
    var imgLink = "https://drive.google.com/uc?export=view&id=" + data.invoiceFileId;
    heroComponent = {
      "type": "image",
      "url": imgLink,
      "size": "full",
      "aspectRatio": "20:13",
      "aspectMode": "cover",
      "action": { "type": "uri", "uri": imgLink }
    };
  }

  // 3. สร้าง JSON Bubble
  var flexMessage = {
    "type": "flex",
    "altText": "🧾 มีรายการรับเข้าสินค้าใหม่",
    "contents": {
      "type": "bubble",
      "header": {
        "type": "box", "layout": "vertical", "backgroundColor": "#F59E0B", // สีส้มฟาร์ม
        "contents": [
          { "type": "text", "text": "📥 รับเข้าสินค้าใหม่", "weight": "bold", "color": "#FFFFFF", "size": "lg" },
          { "type": "text", "text": data.docNo, "color": "#FFFBEB", "size": "xs", "margin": "xs" }
        ],
        "paddingAll": "lg"
      },
      // ใส่รูปบิลตรงนี้ (ถ้ามี)
      "hero": heroComponent, 
      "body": {
        "type": "box", "layout": "vertical",
        "contents": [
          { "type": "text", "text": data.supplier, "weight": "bold", "size": "xl", "color": "#1F2937" },
          { "type": "text", "text": Utilities.formatDate(data.timestamp, "Asia/Bangkok", "dd MMM yyyy HH:mm"), "size": "xs", "color": "#9CA3AF", "margin": "xs" },
          { "type": "separator", "margin": "md" },
          { "type": "box", "layout": "vertical", "margin": "md", "spacing": "sm", "contents": itemRows }, // รายการสินค้า
          { "type": "separator", "margin": "md" },
          {
            "type": "box", "layout": "horizontal", "margin": "md",
            "contents": [
              { "type": "text", "text": "ยอดรวมสุทธิ", "size": "sm", "color": "#555555" },
              { "type": "text", "text": "฿" + data.total.toLocaleString(undefined, {minimumFractionDigits: 2}), "size": "lg", "color": "#F59E0B", "weight": "bold", "align": "end" }
            ]
          }
        ]
      },
      "footer": {
        "type": "box", "layout": "vertical", "spacing": "sm",
        "contents": [
          {
            "type": "button", "style": "primary", "height": "sm", "color": "#10B981", // สีเขียว
            "action": { "type": "uri", "label": "📄 เปิดใบสำคัญจ่าย (PDF)", "uri": data.pdfUrl }
          }
        ]
      }
    }
  };

  // 4. ส่งข้อความ
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + FEED_CONFIG.LINE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ to: FEED_CONFIG.LINE_PUSH_TARGET, messages: [flexMessage] }),
    muteHttpExceptions: true
  });
}
