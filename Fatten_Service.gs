/* * Fatten_Service.gs
 * ระบบจัดการหมูขุน (Backend)
 * Version: 4.5 (Final - Fixed Reference Error & Logic)
 */

// ✅ 1. สร้างตัวแปร FATTEN_CONFIG (ป้องกัน ReferenceError)
var FATTEN_CONFIG = FATTEN_CONFIG || {};

// กำหนดชื่อชีต (Default Config)
if (!FATTEN_CONFIG.SHEET_NAME) {
    FATTEN_CONFIG.SHEET_NAME = {
        STATUS: "ขุน_สถานะคอก",
        EVENTS: "ขุน_เหตุการณ์",
        SALES: "ขุน_การขาย",
        BATCH: "ขุน_ประวัติรุ่น"
    };
}

// ==========================================
// ⚙️ 2. Secure Config (ดึงค่าจาก Script Properties)
// ==========================================
const SCRIPT_PROP = PropertiesService.getScriptProperties();

// ดึงค่า ID ต่างๆ ลงใน FATTEN_CONFIG
FATTEN_CONFIG.SPREADSHEET_ID  = SCRIPT_PROP.getProperty('SPREADSHEET_ID');
FATTEN_CONFIG.IMAGE_FOLDER_ID = SCRIPT_PROP.getProperty('FATTEN_IMAGE_FOLDER_ID');
FATTEN_CONFIG.PDF_FOLDER_ID   = SCRIPT_PROP.getProperty('FATTEN_PDF_FOLDER_ID');
FATTEN_CONFIG.TEMPLATE_ID     = SCRIPT_PROP.getProperty('FATTEN_TEMPLATE_ID');

// ตั้งค่า Line
FATTEN_CONFIG.LINE = {
    TOKEN: SCRIPT_PROP.getProperty('LINE_TOKEN'),
    USER_ID: SCRIPT_PROP.getProperty('LINE_USER_ID')
};

// ตรวจสอบความปลอดภัย (แจ้งเตือนใน Log ถ้าลืมตั้งค่า)
if (!FATTEN_CONFIG.SPREADSHEET_ID) console.warn("⚠️ FATTEN: ยังไม่ได้ตั้งค่า SPREADSHEET_ID");

// Map ชื่อชีตให้เรียกใช่ง่ายๆ
const SHEET_NAMES = {
  PENS: FATTEN_CONFIG.SHEET_NAME.STATUS,
  EVENTS: FATTEN_CONFIG.SHEET_NAME.EVENTS,
  SALES: FATTEN_CONFIG.SHEET_NAME.SALES,
  HISTORY: FATTEN_CONFIG.SHEET_NAME.BATCH,
  SETTINGS: "ขุน_ตั้งค่า"
};

/* =========================================
  📥 1. READ DATA (Dashboard)
  ========================================= */

function fatten_getDashboardData() {
   try {
       return JSON.stringify({ success: true, data: fatten_getDashboardDataObj() });
   } catch (e) {
       return JSON.stringify({ success: false, message: e.message });
   }
}

function fatten_getDashboardDataObj() {
   const ss = SpreadsheetApp.openById(FATTEN_CONFIG.SPREADSHEET_ID);
   const penSheet = ss.getSheetByName(SHEET_NAMES.PENS);
   if (!penSheet) throw new Error("ไม่พบชีต: " + SHEET_NAMES.PENS);

   // ✅ ดึง Map หัวตาราง (Dynamic Column Mapping)
   const headers = fatten_getHeaderMap(penSheet);
   
   // ตรวจสอบคอลัมน์จำเป็น (ถ้าไม่เจอ ให้แจ้ง Error)
   if (!headers['หมายเลขคอก'] || !headers['จำนวนคงเหลือ']) {
       throw new Error("❌ หัวตารางไม่ถูกต้อง! (ต้องมี: หมายเลขคอก, จำนวนคงเหลือ, สถานะ, สูตรอาหารปัจจุบัน, วันที่ลงหมู, รหัสรุ่น, จำนวนเริ่มต้น)");
   }

   const penDataRaw = penSheet.getDataRange().getValues();
   const today = new Date();

   // ดึง Settings (ถ้ามีชีตตั้งค่า)
   let settings = { feedJuniorAge: 46, feedFattenAge: 91, targetSaleAge: 150, alertDaysBefore: 5 };
   const settingSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
   if (settingSheet && settingSheet.getLastRow() > 1) {
       const sData = settingSheet.getRange(2, 1, settingSheet.getLastRow() - 1, 2).getValues();
       sData.forEach(r => { if (r[0]) settings[r[0]] = r[1]; });
   }

   let pens = [], stats = { totalPigs: 0, smallPigs: 0, juniorPigs: 0, fattenPigs: 0 }, alerts = {};

   // เริ่ม Loop แถวที่ 2 (ข้าม Header)
   for (let i = 1; i < penDataRaw.length; i++) {
       const row = penDataRaw[i];
       
       // อ่านข้อมูลโดยใช้ headers map (ป้องกันผิดช่อง)
       const penId = row[headers['หมายเลขคอก'] - 1];
       const status = row[headers['สถานะ'] - 1];
       const count = parseInt(row[headers['จำนวนคงเหลือ'] - 1]) || 0;
       const currentFeed = row[headers['สูตรอาหารปัจจุบัน'] - 1];
       
       const startDateVal = row[headers['วันที่ลงหมู'] - 1];
       const batchId = row[headers['รหัสรุ่น'] - 1];
       const startCount = row[headers['จำนวนเริ่มต้น'] - 1];

       let days = 0;
       if (status === 'ใช้งาน' && startDateVal) {
           const startDate = new Date(startDateVal);
           if (!isNaN(startDate)) days = Math.ceil(Math.abs(today - startDate) / (86400000));

           stats.totalPigs += count;
           if (currentFeed === 'เล็ก') stats.smallPigs += count;
           else if (currentFeed === 'รุ่น') stats.juniorPigs += count;
           else if (currentFeed === 'ขุน') stats.fattenPigs += count;

           // Alerts (แจ้งเตือนใกล้ขาย)
           const target = settings.targetSaleAge || 150;
           const warnDays = settings.alertDaysBefore || 5;
           if (days >= target - warnDays) {
               if (!alerts[penId]) alerts[penId] = [];
               alerts[penId].push({ type: 'urgent', message: `อายุ ${days} วัน (ใกล้เป้าหมาย)` });
           }
       }

       pens.push({
           penNumber: penId,
           status: status,
           batchId: batchId,
           startDate: startDateVal,
           startCount: startCount,
           currentCount: count,
           feedFormula: currentFeed,
           days: days
       });
   }
   return { penData: pens, pigCounts: stats, alerts: alerts, settings: settings };
}

/* =========================================
  📝 2. WRITE FUNCTIONS (New Batch / Event / Sale)
  ========================================= */

function fatten_createNewBatch(data) {
   const lock = LockService.getScriptLock();
   if (!lock.tryLock(10000)) return JSON.stringify({ success: false, message: "ระบบไม่ว่าง กรุณาลองใหม่" });

   try {
       const ss = SpreadsheetApp.openById(FATTEN_CONFIG.SPREADSHEET_ID);
       const penSheet = ss.getSheetByName(SHEET_NAMES.PENS);
       const headers = fatten_getHeaderMap(penSheet);

       const finder = penSheet.getRange("A:A").createTextFinder(data.penNumber).matchEntireCell(true).findNext();

       if (finder) {
           const row = finder.getRow();
           const currentStatus = penSheet.getRange(row, headers['สถานะ']).getValue();
           if (currentStatus !== 'ว่าง' && currentStatus !== '') {
               return JSON.stringify({ success: false, message: `❌ คอก ${data.penNumber} ไม่ว่าง! (สถานะ: ${currentStatus})` });
           }

           // บันทึกข้อมูล
           penSheet.getRange(row, headers['สถานะ']).setValue('ใช้งาน');
           penSheet.getRange(row, headers['รหัสรุ่น']).setValue(data.batchId);
           penSheet.getRange(row, headers['วันที่ลงหมู']).setValue(new Date(data.entryDate));
           penSheet.getRange(row, headers['จำนวนเริ่มต้น']).setValue(data.startCount);
           penSheet.getRange(row, headers['จำนวนคงเหลือ']).setValue(data.startCount);
           penSheet.getRange(row, headers['สูตรอาหารปัจจุบัน']).setValue(data.currentFeed);

           // Log Events
           ss.getSheetByName(SHEET_NAMES.EVENTS).appendRow([new Date(), data.penNumber, "การจัดการทั่วไป", "ลงหมูใหม่", `รุ่น ${data.batchId}`, data.startCount, "", "", "", "", "", "Admin", ""]);
           // Log History
           ss.getSheetByName(SHEET_NAMES.HISTORY).appendRow([new Date(), data.batchId, data.penNumber, new Date(data.entryDate), "", "", data.startCount, 0, 0, 0, 0, "กำลังเลี้ยง"]);

           fatten_pushLineMessage([{ type: 'text', text: `🆕 ลงหมูใหม่: คอก ${data.penNumber} (${data.startCount} ตัว)` }]);
           return JSON.stringify({ success: true, message: "ลงทะเบียนหมูใหม่สำเร็จ" });
       }
       return JSON.stringify({ success: false, message: "ไม่พบเลขคอกนี้ในระบบ" });

   } catch (e) {
       return JSON.stringify({ success: false, message: e.message });
   } finally {
       lock.releaseLock();
   }
}

function fatten_logEvent(data) {
   const lock = LockService.getScriptLock();
   if (!lock.tryLock(10000)) return JSON.stringify({ success: false, message: "ระบบไม่ว่าง" });

   try {
       const ss = SpreadsheetApp.openById(FATTEN_CONFIG.SPREADSHEET_ID);
       const penSheet = ss.getSheetByName(SHEET_NAMES.PENS);
       const eventSheet = ss.getSheetByName(SHEET_NAMES.EVENTS);
       const headers = fatten_getHeaderMap(penSheet);

       const finder = penSheet.getRange("A:A").createTextFinder(data.penNumber).matchEntireCell(true).findNext();
      
       if (finder) {
           const row = finder.getRow();
           const colQty = headers['จำนวนคงเหลือ'];
           const colStatus = headers['สถานะ'];
           const colFeed = headers['สูตรอาหารปัจจุบัน'];

           const currentQty = parseInt(penSheet.getRange(row, colQty).getValue()) || 0;
           const qty = parseInt(data.quantity) || 0;

           if (['พบหมูตาย', 'คัดทิ้ง', 'ย้ายออก'].includes(data.eventType)) {
               const newQty = Math.max(0, currentQty - qty);
               penSheet.getRange(row, colQty).setValue(newQty);
              
               if (newQty === 0) {
                    penSheet.getRange(row, colStatus).setValue('ว่าง');
                    penSheet.getRange(row, headers['รหัสรุ่น']).setValue('');
                    penSheet.getRange(row, headers['วันที่ลงหมู']).setValue('');
                    penSheet.getRange(row, headers['จำนวนเริ่มต้น']).setValue('');
                    penSheet.getRange(row, colFeed).setValue('');
               }

           } else if (data.eventType === 'เปลี่ยนสูตรอาหาร') {
               penSheet.getRange(row, colFeed).setValue(data.newFeed || data.details);
           }
       }

       // Upload Image
       let fileUrl = "";
       if (data.fileUpload) {
           try {
               const folder = DriveApp.getFolderById(FATTEN_CONFIG.IMAGE_FOLDER_ID);
               const blob = Utilities.newBlob(Utilities.base64Decode(data.fileUpload.base64), data.fileUpload.mimeType, data.fileUpload.name);
               fileUrl = folder.createFile(blob).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW).getUrl();
           } catch (e) { Logger.log("Image Upload Error: " + e.message); }
       }

       eventSheet.appendRow([new Date(), data.penNumber, data.eventCategory, data.eventType, data.details || "", data.quantity || 0, data.avgWeight || "", data.symptoms || "", data.medicineName || "", data.medicineDose || "", data.destinationPen || "", "Admin", fileUrl]);

       let msg = `📝 บันทึก: ${data.eventType} คอก ${data.penNumber}`;
       if (data.quantity) msg += ` (${data.quantity} ตัว)`;
       fatten_pushLineMessage([{ type: 'text', text: msg }]);

       return JSON.stringify({ success: true, message: "บันทึกสำเร็จ" });

   } catch (e) {
       return JSON.stringify({ success: false, message: e.message });
   } finally {
       lock.releaseLock();
   }
}

function fatten_logSale(data) {
   const lock = LockService.getScriptLock();
   if (!lock.tryLock(10000)) return JSON.stringify({ success: false, message: "ระบบไม่ว่าง" });

   try {
       const ss = SpreadsheetApp.openById(FATTEN_CONFIG.SPREADSHEET_ID);
       const salesSheet = ss.getSheetByName(SHEET_NAMES.SALES);
       const penSheet = ss.getSheetByName(SHEET_NAMES.PENS);
       const historySheet = ss.getSheetByName(SHEET_NAMES.HISTORY);
       const headers = fatten_getHeaderMap(penSheet);

       const finder = penSheet.getRange("A:A").createTextFinder(data.penNumber).matchEntireCell(true).findNext();
       if(!finder) return JSON.stringify({ success: false, message: "ไม่พบคอก" });

       const row = finder.getRow();
       const colQty = headers['จำนวนคงเหลือ'];
       const colBatch = headers['รหัสรุ่น'];
       const colStatus = headers['สถานะ'];

       const batchId = penSheet.getRange(row, colBatch).getValue();
       const currentQty = parseInt(penSheet.getRange(row, colQty).getValue()) || 0;
       const sellQty = parseInt(data.quantity) || 0;
       const newQty = Math.max(0, currentQty - sellQty);

       // Create Receipt
       const todayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyMMdd");
       const runNum = (salesSheet.getLastRow() + 1).toString().padStart(3, '0');
       const receiptId = `REC-${todayStr}-${runNum}`;
       const pdfUrl = fatten_createReceiptPDF(data, receiptId, batchId);

       // Log Sale
       salesSheet.appendRow([new Date(), data.penNumber, batchId, new Date(data.saleDate), data.saleType, data.buyerName, sellQty, data.totalWeight, data.pricePerKg, data.totalPrice, data.fees, data.netTotal, "รอตรวจสอบ", data.notes, data.weighingDetails, data.feeCatching, data.feeWeighing, data.feeTransport, receiptId, data.buyerAddress, data.buyerPhone, pdfUrl]);

       // Update Pen
       penSheet.getRange(row, colQty).setValue(newQty);

       // Close Batch logic
       if (data.sellAll === 'on' || newQty === 0) {
           const hData = historySheet.getDataRange().getValues();
           for (let i = 1; i < hData.length; i++) {
               if (String(hData[i][1]) == String(batchId)) {
                   historySheet.getRange(i + 1, 5).setValue(new Date()); 
                   historySheet.getRange(i + 1, 12).setValue("ปิดรุ่นแล้ว");
                   break;
               }
           }
           // Clear Pen
           penSheet.getRange(row, colStatus).setValue('ว่าง');
           penSheet.getRange(row, colQty).setValue(0);
           penSheet.getRange(row, headers['รหัสรุ่น']).setValue('');
           penSheet.getRange(row, headers['วันที่ลงหมู']).setValue('');
           penSheet.getRange(row, headers['จำนวนเริ่มต้น']).setValue('');
           penSheet.getRange(row, headers['สูตรอาหารปัจจุบัน']).setValue('');
       }

       fatten_pushLineMessage([{ type: 'text', text: `💰 ขายออก: คอก ${data.penNumber} ยอด ${data.netTotal} บ.` }]);
       return JSON.stringify({ success: true, message: "บันทึกการขายสำเร็จ", url: pdfUrl });

   } catch (e) {
       return JSON.stringify({ success: false, message: e.message });
   } finally {
       lock.releaseLock();
   }
}

/* =========================================
  📄 3. HELPER FUNCTIONS (PDF / Line / Map)
  ========================================= */

// ✅ ฟังก์ชันช่วย: ค้นหาตำแหน่งคอลัมน์จากชื่อหัวตาราง (สำคัญมาก!)
function fatten_getHeaderMap(sheet) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const map = {};
    headers.forEach((h, i) => { map[h.toString().trim()] = i + 1; });
    return map;
}

function fatten_createReceiptPDF(data, receiptId, batchId) {
   try {
       const templateFile = DriveApp.getFileById(FATTEN_CONFIG.TEMPLATE_ID);
       const pdfFolder = DriveApp.getFolderById(FATTEN_CONFIG.PDF_FOLDER_ID);
       const tempFile = templateFile.makeCopy(`Temp_${receiptId}`);
       const tempDoc = DocumentApp.openById(tempFile.getId());
       const body = tempDoc.getBody();

       body.replaceText("{{date}}", Utilities.formatDate(new Date(data.saleDate), "Asia/Bangkok", "d/MM/yyyy"));
       body.replaceText("{{receiptNo}}", receiptId);
       body.replaceText("{{buyer}}", data.buyerName || "-");
       body.replaceText("{{pen}}", data.penNumber);
       body.replaceText("{{batch}}", batchId || "-");
       body.replaceText("{{qty}}", data.quantity);
       body.replaceText("{{totalWeight}}", data.totalWeight);
       body.replaceText("{{price}}", data.pricePerKg);
       body.replaceText("{{netTotal}}", data.netTotal);

       tempDoc.saveAndClose();
       const pdfFile = pdfFolder.createFile(tempFile.getAs(MimeType.PDF)).setName(`ใบเสร็จ_${receiptId}.pdf`);
       pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
       tempFile.setTrashed(true);
       return pdfFile.getUrl();
   } catch (e) {
       Logger.log("PDF Error: " + e.message);
       return "";
   }
}

function fatten_pushLineMessage(messages) {
   if (FATTEN_CONFIG.LINE.TOKEN && !FATTEN_CONFIG.LINE.TOKEN.includes("ใส่_LINE_TOKEN")) {
       try {
           UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
               'headers': {
                   'Content-Type': 'application/json',
                   'Authorization': 'Bearer ' + FATTEN_CONFIG.LINE.TOKEN
               },
               'method': 'post',
               'payload': JSON.stringify({
                   to: FATTEN_CONFIG.LINE.USER_ID,
                   messages: messages
               }),
               'muteHttpExceptions': true
           });
       } catch (e) {
           Logger.log("Line Error: " + e.message);
       }
   }
}
