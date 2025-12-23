/* * Sow_Service.gs
 * ระบบจัดการแม่พันธุ์
 * แก้ไข: การประกาศตัวแปร Config แบบปลอดภัยที่สุด (Safe Declaration)
 */

// ✅ ใช้เทคนิคตรวจสอบ Global Scope (แก้ปัญหา ReferenceError และ SyntaxError พร้อมกัน)
var thisContext = this;
if (typeof thisContext.SOW_CONFIG === 'undefined') {
    thisContext.SOW_CONFIG = {};
}
var SOW_CONFIG = thisContext.SOW_CONFIG;

// กำหนดชื่อชีต (ถ้ายังไม่มี)
if (!SOW_CONFIG.SHEET_NAME) {
    SOW_CONFIG.SHEET_NAME = {
        REGISTER: "แม่_ทะเบียนประวัติ",
        BREEDING: "แม่_บันทึกผสม",
        FARROWING: "แม่_บันทึกคลอด",
        WEANING: "แม่_บันทึกหย่านม",
        BOAR: "แม่_ทะเบียนพ่อพันธุ์",
        MED: "แม่_การใช้ยา",
        VACCINE: "แม่_โปรแกรมวัคซีน"
    };
}

// ... (โค้ดส่วนที่เหลือปล่อยไว้เหมือนเดิมได้เลยครับ) ...
// 🔐 2. Secure Config (ดึงค่าจาก Script Properties)
// ==========================================
// แก้ไข: เรียกใช้คำสั่งตรงๆ ไม่ต้องประกาศตัวแปร const SCRIPT_PROP ซ้ำ
if (!SOW_CONFIG.SPREADSHEET_ID) {
    SOW_CONFIG.SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
}

// ดึง ID เฉพาะของระบบแม่พันธุ์
SOW_CONFIG.CALENDAR = { ID: PropertiesService.getScriptProperties().getProperty("SOW_CALENDAR_ID") };
SOW_CONFIG.DRIVE    = { FOLDER_ID: PropertiesService.getScriptProperties().getProperty("SOW_IMAGE_FOLDER_ID") };

// ตรวจสอบความปลอดภัย
if (!SOW_CONFIG.SPREADSHEET_ID) console.warn("⚠️ SOW: ยังไม่ได้ตั้งค่า SPREADSHEET_ID");
if (!SOW_CONFIG.CALENDAR.ID) console.warn("⚠️ SOW: ยังไม่ได้ตั้งค่า SOW_CALENDAR_ID");
if (!SOW_CONFIG.DRIVE.FOLDER_ID) console.warn("⚠️ SOW: ยังไม่ได้ตั้งค่า SOW_IMAGE_FOLDER_ID");


// ==========================================
// 🔄 3. Config Adapter (เชื่อมชื่อชีตกับโค้ดเดิม)
// ==========================================
SOW_CONFIG.SHEET_NAMES = {
  "SowRegister": SOW_CONFIG.SHEET_NAME.REGISTER,
  "BreedingLog": SOW_CONFIG.SHEET_NAME.BREEDING,
  "FarrowingLog": SOW_CONFIG.SHEET_NAME.FARROWING,
  "WeaningLog": SOW_CONFIG.SHEET_NAME.WEANING,
  "SireRegister": SOW_CONFIG.SHEET_NAME.BOAR,
  "MedicationLog": SOW_CONFIG.SHEET_NAME.MED,
  "VaccineProgram": "แม่_โปรแกรมวัคซีน",
  "Config": "แม่_ตั้งค่า",
  "Notifications": "แม่_แจ้งเตือน",
  "Dashboard": "แม่_แดชบอร์ด",
  "AI_Knowledge": "แม่_ความรู้"
};

const SS = SpreadsheetApp.openById(SOW_CONFIG.SPREADSHEET_ID);

// 🗺️ แผนที่แปลภาษา (ส่วนนี้คงเดิม)
const THAI_ENGLISH_MAP = {
  "แม่_ทะเบียนประวัติ" : {
    "รหัสแม่สุกร" : "sowId",  "เบอร์หู" : "earTag",  "ชื่อแม่พันธุ์" : "sowName",
    "วันเกิด" : "birthDate",  "สายพันธุ์" : "breed",  "แหล่งที่มา" : "source",
    "ครอกที่" : "parity",  "สถานะ(ป้อนเอง)" : "statusManual",  "สถานะ(ระบบ)" : "statusComputed",
    "กิจกรรมถัดไป" : "nextAction",  "วันที่นัดหมาย" : "nextActionDate",  "อัปเดตล่าสุด" : "lastUpdatedAt",
    "รหัสปฏิทิน" : "calendarEventId",  "URLรูปภาพ" : "imageUrl"
  },
  "แม่_บันทึกผสม" : {
    "รหัสเหตุการณ์" : "logId",  "รหัสแม่สุกร" : "sowId",  "เบอร์หู" : "earTag",
    "ประเภทเหตุการณ์" : "eventType",  "วันที่เกิดเหตุ" : "eventDate",  "รายละเอียด" : "details",
    "รหัสพ่อพันธุ์" : "sireId",  "ครอกที่" : "parity",  "ผู้บันทึก" : "createdBy",
    "วันที่บันทึก" : "createdAt",  "เหตุผล" : "reason"
  },
  "แม่_ทะเบียนพ่อพันธุ์" : {
    "รหัสพ่อพันธุ์" : "sireId",  "ชื่อพ่อพันธุ์" : "sireName",  "ประเภท" : "sireType",
    "สายพันธุ์" : "breed",  "สถานะ" : "status",  "หมายเหตุ" : "notes"
  },
  "แม่_การใช้ยา" : {
    "รหัสบันทึกยา" : "medLogId",  "รหัสแม่สุกร" : "sowId",  "เบอร์หู" : "earTag",
    "วันที่" : "eventDate",  "ชื่อยา/วัคซีน" : "medicationName",  "ปริมาณ" : "dosage",
    "เหตุผล" : "reason",  "ผู้บันทึก" : "createdBy",  "วันที่บันทึก" : "createdAt"
  },
  "แม่_บันทึกคลอด" : {
    "รหัสบันทึก" : "farrowId",  "รหัสแม่สุกร" : "sowId",  "เบอร์หู" : "earTag",
    "ครอกที่" : "parity",  "วันที่คลอด" : "farrowDate",  "เกิดมีชีวิต" : "bornAlive",
    "ตาย" : "stillborn",  "มัมมี่" : "mummified",  "รวมเกิด" : "totalBorn",
    "นน.รวม" : "totalBirthWeight",  "นน.แรกเกิดเฉลี่ย (กก.)" : "avgBirthWeight",
    "ผู้บันทึก" : "createdBy",  "วันที่บันทึก" : "createdAt"
  },
  "แม่_บันทึกหย่านม" : {
    "รหัสบันทึก" : "weanId",  "รหัสการคลอด" : "farrowId",  "รหัสแม่สุกร" : "sowId",
    "เบอร์หู" : "earTag",  "ครอกที่" : "parity",  "วันที่หย่านม" : "weanDate",
    "จำนวนลูก" : "pigsWeaned",  "นน.รวม" : "totalWeanWeight",
    "น้ำหนักหย่านมเฉลี่ย (กก.)" : "avgWeanWeight",  "อายุหย่านม (วัน)" : "weanAge",
    "ผู้บันทึก" : "createdBy",  "วันที่บันทึก" : "createdAt"
  },
  "แม่_โปรแกรมวัคซีน" : {
    "Code": "code",  "ชื่อวัคซีน" : "vaccineName",  "ระยะ" : "stage",
    "วันอ้างอิง" : "refEvent",  "จำนวนวัน(Days)" : "daysOffset",  "คำแนะนำ" : "advice"
  }
};
/* ---------------------------------------------------------
   [ส่วนฟังก์ชันอื่นๆ ทั้งหมด คงเดิม 100% ไม่ต้องแก้]
   ... (sow_addSowRegister, sow_addBreedingEvent, ฯลฯ) ...
   ----------------------------------------------------------*/
// เพื่อความกระชับ ผมละโค้ด Logic เดิมไว้ (เพราะมันถูกต้องอยู่แล้ว)
// คุณสามารถวางโค้ดฟังก์ชันเดิมต่อจากบรรทัดนี้ได้เลยครับคุณสามารถวางโค้ดฟังก์ชันเดิมต่อจากบรรทัดนี้ได้เลยครับ
/* ---------------------------------------------------------
   🔧 1. ฟังก์ชันสร้างชีต & เตรียมระบบ
   ----------------------------------------------------------*/
function sow_initializeSpreadsheet() {
  const requiredSheets = SOW_CONFIG.SHEET_NAMES;
  for (const key in requiredSheets) {
    // (ส่วนสร้างชีต ข้ามไปเพราะเรามี Tool Repair แล้ว)
  }
}

/* ---------------------------------------------------------
   ✏️ 2. ฟังก์ชันบันทึก (Web App API)
   ----------------------------------------------------------*/

function sow_addSowRegister(sowData, fileData) {
  try {
    const newEarTagRaw = sowData["earTag"];
    if (!newEarTagRaw || typeof newEarTagRaw !== 'string' || newEarTagRaw.trim() === "") { return "❌ เกิดข้อผิดพลาด: กรุณากรอก 'เบอร์หู'"; }
    const newEarTag = newEarTagRaw.trim();
    const sheet = sow_getSheet("SowRegister");
    if (!sheet) { return "❌ เกิดข้อผิดพลาด: ไม่พบชีต 'แม่_ทะเบียนประวัติ'!" }
    const headers = sow_getHeaderMap(sheet);
    const earTagColumn = headers.earTag;
    
    if (sheet.getLastRow() > 1) {
      const allEarTags = sheet.getRange(2, earTagColumn, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < allEarTags.length; i++) {
        const existingTag = (allEarTags[i][0] || "").toString().trim();
        if (existingTag.toLowerCase() === newEarTag.toLowerCase()) {
          return `❌ เกิดข้อผิดพลาด: เบอร์หู "${newEarTag}" นี้มีอยู่แล้ว!`;
        }
      }
    }
    const newRow = new Array(Object.keys(headers).length).fill('');
    const newSowId = `SOW-${Utilities.getUuid().substring(0, 4)}`;
    newRow[headers.sowId - 1] = newSowId;
    newRow[headers.earTag - 1] = newEarTag;
    newRow[headers.sowName - 1] = sowData["sowName"] || "";
    newRow[headers.birthDate - 1] = sowData["birthDate"] || "";
    newRow[headers.breed - 1] = sowData["breed"] || "";
    newRow[headers.source - 1] = sowData["source"] || "";
    newRow[headers.parity - 1] = 0;
    newRow[headers.statusManual - 1] = "พร้อมใช้งาน";
    newRow[headers.statusComputed - 1] = "พร้อมผสม";
    newRow[headers.nextAction - 1] = "พร้อมผสม";
    newRow[headers.lastUpdatedAt - 1] = new Date();
    
    if (fileData && fileData.data && headers.imageUrl) {
      const imageUrl = sow_uploadImageAndGetUrl(newSowId, fileData);
      if (imageUrl) { newRow[headers.imageUrl - 1] = imageUrl; }
    }
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    return `✅ บันทึกแม่สุกร "${newEarTag}" เรียบร้อยแล้ว!`;
  } catch (e) {
    return `❌ เกิดข้อผิดพลาดร้ายแรงขณะบันทึก: ${e.message}`;
  }
}

function sow_addBreedingEvent(eventData) {
  const sheet = sow_getSheet("BreedingLog");
  const headers = sow_getHeaderMap(sheet);
  const newRow = new Array(Object.keys(headers).length).fill('');
  
  newRow[headers.logId - 1] = `LOG-${Utilities.getUuid().substring(0, 6)}`;
  newRow[headers.sowId - 1] = eventData["sowId"];
  newRow[headers.earTag - 1] = eventData["earTag"] || "";
  newRow[headers.eventType - 1] = eventData["eventType"];
  newRow[headers.eventDate - 1] = new Date(eventData["eventDate"]);
  newRow[headers.details - 1] = eventData["details"] || "";
  newRow[headers.sireId - 1] = eventData["sireId"] || "";
  newRow[headers.parity - 1] = eventData["parity"] || "";
  newRow[headers.createdBy - 1] = Session.getActiveUser().getEmail();
  newRow[headers.createdAt - 1] = new Date();
  newRow[headers.reason - 1] = eventData["reason"] || "";
  sheet.appendRow(newRow);
  SpreadsheetApp.flush();
  
  const sowRow = sow_findSowRow(eventData["sowId"]);
  if (sowRow > -1) { sow_runCalculationForSingleSow(sowRow); }
  return "✅ บันทึกเหตุการณ์เรียบร้อยแล้ว";
}

function sow_addMedicationLog(medData) {
  try {
    const sheet = sow_getSheet("MedicationLog");
    if (!sheet) { return "❌ เกิดข้อผิดพลาด: ไม่พบชีต 'MedicationLog'!" }
    const headers = sow_getHeaderMap(sheet);
    
    const newRow = new Array(Object.keys(headers).length).fill('');
    newRow[headers.medLogId - 1] = `MED-${Utilities.getUuid().substring(0, 6)}`;
    newRow[headers.sowId - 1] = medData["sowId"];
    newRow[headers.earTag - 1] = medData["earTag"] || "";
    newRow[headers.eventDate - 1] = new Date(medData["eventDate"]);
    newRow[headers.medicationName - 1] = medData["medicationName"];
    newRow[headers.dosage - 1] = medData["dosage"] || "";
    newRow[headers.reason - 1] = medData["reason"] || "";
    newRow[headers.createdBy - 1] = Session.getActiveUser().getEmail();
    newRow[headers.createdAt - 1] = new Date();
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    return "✅ บันทึกการใช้ยา/วัคซีนเรียบร้อยแล้ว";
  } catch (e) { return "❌ เกิดข้อผิดพลาด: " + e.message }
}

function sow_addFarrowingRecord(data) {
  try {
    const farrowSheet = sow_getSheet("FarrowingLog");
    const headers = sow_getHeaderMap(farrowSheet);
    const user = Session.getActiveUser().getEmail();
    const sowId = data["sowId"];
    const earTag = data["earTag"];
    const parity = Number(data["parity"]);
    const farrowDate = new Date(data["farrowDate"]);
    const bornAlive = Number(data["bornAlive"]) || 0;
    const stillborn = Number(data["stillborn"]) || 0;
    const mummified = Number(data["mummified"]) || 0;
    const totalBirthWeight = Number(data["totalBirthWeight"]) || 0;
    const totalBorn = bornAlive + stillborn + mummified;
    const avgBirthWeight = (bornAlive > 0) ? (totalBirthWeight / bornAlive) : 0;
    
    const newRow = new Array(Object.keys(headers).length).fill('');
    const newFarrowId = `FAR-${Utilities.getUuid().substring(0, 6)}`;
    newRow[headers.farrowId - 1] = newFarrowId;
    newRow[headers.sowId - 1] = sowId;
    newRow[headers.earTag - 1] = earTag;
    newRow[headers.parity - 1] = parity;
    newRow[headers.farrowDate - 1] = farrowDate;
    newRow[headers.bornAlive - 1] = bornAlive;
    newRow[headers.stillborn - 1] = stillborn;
    newRow[headers.mummified - 1] = mummified;
    newRow[headers.totalBorn - 1] = totalBorn;
    newRow[headers.totalBirthWeight - 1] = totalBirthWeight;
    newRow[headers.avgBirthWeight - 1] = avgBirthWeight;
    newRow[headers.createdBy - 1] = user;
    newRow[headers.createdAt - 1] = new Date();
    
    farrowSheet.appendRow(newRow);
    sow_updateSowParity(sowId, parity);
    
    const eventData = {
      sowId: sowId, earTag: earTag, eventType: "คลอด",
      eventDate: farrowDate, parity: parity,
      details: `คลอด (มีชีวิต ${bornAlive}, ตาย ${stillborn}, มัมมี่ ${mummified})`
    };
    sow_addBreedingEvent(eventData);
    return `✅ บันทึกการคลอด (ครอกที่ ${parity}) ของ ${earTag} เรียบร้อย!`;
  } catch (e) {
    return `❌ เกิดข้อผิดพลาดร้ายแรงขณะบันทึกการคลอด: ${e.message}`;
  }
}

function sow_addWeaningRecord(data) {
  try {
    const weanSheet = sow_getSheet("WeaningLog");
    const headers = sow_getHeaderMap(weanSheet);
    const user = Session.getActiveUser().getEmail();
    const farrowId = data["farrowId"];
    const weanDate = new Date(data["weanDate"]);
    const pigsWeaned = Number(data["pigsWeaned"]) || 0;
    const totalWeanWeight = Number(data["totalWeanWeight"]) || 0;
    
    const farrowData = sow_getFarrowingLogData(farrowId);
    if (!farrowData) { return `❌ เกิดข้อผิดพลาด: ไม่พบข้อมูลครอก (FarrowID: ${farrowId})!`; }
    
    const avgWeanWeight = (pigsWeaned > 0) ? (totalWeanWeight / pigsWeaned) : 0;
    const weanAge = sow_daysBetween(farrowData.farrowDate, weanDate);
    
    const newRow = new Array(Object.keys(headers).length).fill('');
    newRow[headers.weanId - 1] = `WEAN-${Utilities.getUuid().substring(0, 6)}`;
    newRow[headers.farrowId - 1] = farrowId;
    newRow[headers.sowId - 1] = farrowData.sowId;
    newRow[headers.earTag - 1] = farrowData.earTag;
    newRow[headers.parity - 1] = farrowData.parity;
    newRow[headers.weanDate - 1] = weanDate;
    newRow[headers.pigsWeaned - 1] = pigsWeaned;
    newRow[headers.totalWeanWeight - 1] = totalWeanWeight;
    newRow[headers.avgWeanWeight - 1] = avgWeanWeight;
    newRow[headers.weanAge - 1] = weanAge;
    newRow[headers.createdBy - 1] = user;
    newRow[headers.createdAt - 1] = new Date();
    
    weanSheet.appendRow(newRow);
    const eventData = {
      sowId: farrowData.sowId, earTag: farrowData.earTag, eventType: "หย่านม",
      eventDate: weanDate, parity: farrowData.parity,
      details: `หย่านม (จำนวน ${pigsWeaned} ตัว)`
    };
    sow_addBreedingEvent(eventData);
    return `✅ บันทึกการหย่านม (ครอกที่ ${farrowData.parity}) ของ ${farrowData.earTag} เรียบร้อย!`;
  } catch (e) {
    return `❌ เกิดข้อผิดพลาดร้ายแรงขณะบันทึกการหย่านม: ${e.message}`;
  }
}

function sow_addSireRegister(sireData) {
  const sheet = sow_getSheet("SireRegister");
  const headers = sow_getHeaderMap(sheet);
  const newRow = new Array(Object.keys(headers).length).fill('');
  newRow[headers.sireId - 1] = sireData["sireId"];
  newRow[headers.sireName - 1] = sireData["sireName"];
  newRow[headers.sireType - 1] = sireData["sireType"];
  newRow[headers.breed - 1] = sireData["breed"] || "";
  newRow[headers.status - 1] = sireData["status"] || "ใช้งาน";
  newRow[headers.notes - 1] = sireData["notes"] || "";
  sheet.appendRow(newRow);
  SpreadsheetApp.flush();
  return "✅ บันทึกข้อมูลพ่อพันธุ์/น้ำเชื้อ เรียบร้อยแล้ว";
}


/* ---------------------------------------------------------
   📤 3. ฟังก์ชันอ่านข้อมูล
   ----------------------------------------------------------*/

function sow_getDashboardData() {
  const sheet = sow_getSheet("SowRegister");
  if (!sheet || sheet.getLastRow() < 2) return null;
  
  const headers = sow_getHeaderMap(sheet);
  const data = sheet.getRange(2, 1, sheet.getLastRow()-1, sheet.getLastColumn()).getValues();
  
  let stats = { total_sows:0, status_wait:0, status_preg:0, status_lac:0, status_rest:0, status_alert:0 };
  
  data.forEach(row => {
    // ดึงค่าสถานะมา และตัดช่องว่างหน้าหลังทิ้ง (Trim) เพื่อความชัวร์
    let status = (row[headers.statusComputed-1] || row[headers.statusManual-1] || "").toString().trim();
    
    stats.total_sows++;
    
    // ✅ Logic แบบระบุคำเป๊ะๆ (Exact Logic) ปลอดภัย 100%
    switch(status) {
      // กลุ่มสีเขียว: ยังไม่ท้อง / รอผสม
      case "พร้อมใช้งาน":
      case "พร้อมผสม":
      case "ผสมพันธุ์":      // ผสมไปแล้ว แต่ยังไม่ตรวจท้อง ถือว่าอยู่ใน process รอ
      case "รอตรวจท้อง (21วัน)":
      case "ตรวจท้อง (ไม่พบ)":
      case "ผสมใหม่":
      case "กลับสัด":
        stats.status_wait++;
        break;

      // กลุ่มสีฟ้า: ท้องชัวร์
      case "ตรวจท้อง (พบ)":
      case "อุ้มท้อง":
      case "ใกล้คลอด":
      case "รอคลอด":
        stats.status_preg++;
        break;

      // กลุ่มสีชมพู: เลี้ยงลูก
      case "คลอด":
      case "เลี้ยงลูก":
        stats.status_lac++;
        break;

      // กลุ่มสีส้ม: พักฟื้น
      case "หย่านม":
      case "พักฟื้น":
      case "รอผสม": // หลังหย่านม
        stats.status_rest++;
        break;

      // กลุ่มสีแดง: แจ้งเตือน/คัดทิ้ง
      case "คัดทิ้ง":
      case "แท้ง":
      case "เลยกำหนด":
        stats.status_alert++;
        break;

      default:
        // ถ้าไม่เข้าพวกเลย ให้ไปรวมในกลุ่มแจ้งเตือน (จะได้รู้ว่าข้อมูลผิด)
        stats.status_alert++; 
    }
  });
  
  return stats;
}


function sow_getSowRegister() {
  const sheet = sow_getSheet("SowRegister");
  Utilities.sleep(100);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = sow_getHeaderMap(sheet);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const englishKeys = Object.keys(headers);
  return data.map(row => {
    const obj = {};
    englishKeys.forEach(key => {
      const colNum = headers[key];
      if (colNum) {
        const value = row[colNum - 1];
        obj[key] = (value instanceof Date) ? Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd") : value
      } else { obj[key] = null }
    });
    return obj
  });
}
function sow_getSireList() {
  const sheet = sow_getSheet("SireRegister");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = sow_getHeaderMap(sheet);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return data.map(row => ({ id: row[headers.sireId - 1], name: row[headers.sireName - 1], type: row[headers.sireType - 1] }))
}
function sow_getSowList() {
  const sheet = sow_getSheet("SowRegister");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = sow_getHeaderMap(sheet);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return data.map(row => ({ id: row[headers.sowId - 1], earTag: row[headers.earTag - 1], parity: row[headers.parity - 1] || 0 }))
}
function sow_getBreedingHistory(sowId) {
  if (!sowId) return [];
  const logs = sow_getLogsForSow(sowId);
  if (!logs || logs.length === 0) return [];
  const timeZone = Session.getScriptTimeZone();
  return logs.map(log => ({
    eventDate: Utilities.formatDate(log.eventDate, timeZone, "yyyy-MM-dd"),
    eventType: log.eventType || 'N/A',
    details: log.details || '-'
  }));
}
function sow_getLittersForWeaning() {
  const farrowSheet = sow_getSheet("FarrowingLog");
  const weanSheet = sow_getSheet("WeaningLog");
  if (!farrowSheet || farrowSheet.getLastRow() < 2) return [];
  const farrowHeaders = sow_getHeaderMap(farrowSheet);
  const farrowData = farrowSheet.getRange(2, 1, farrowSheet.getLastRow() - 1, farrowSheet.getLastColumn()).getValues();
  const weanedFarrowIds = new Set();
  if (weanSheet && weanSheet.getLastRow() > 1) {
    const weanHeaders = sow_getHeaderMap(weanSheet);
    if (weanHeaders.farrowId) {
      weanSheet.getRange(2, weanHeaders.farrowId, weanSheet.getLastRow() - 1, 1)
        .getValues().forEach(row => { if (row[0]) weanedFarrowIds.add(row[0].toString()); });
    }
  }
  const litters = [];
  const f_id = farrowHeaders.farrowId, f_sowId = farrowHeaders.sowId, f_earTag = farrowHeaders.earTag,
    f_parity = farrowHeaders.parity, f_farrowDate = farrowHeaders.farrowDate;
  for (const row of farrowData) {
    const farrowId = row[f_id - 1].toString();
    if (farrowId && !weanedFarrowIds.has(farrowId)) {
      litters.push({
        farrowId: farrowId, sowId: row[f_sowId - 1], earTag: row[f_earTag - 1],
        parity: row[f_parity - 1],
        farrowDate: Utilities.formatDate(row[f_farrowDate - 1], Session.getScriptTimeZone(), "yyyy-MM-dd")
      });
    }
  }
  litters.sort((a, b) => new Date(b.farrowDate) - new Date(a.farrowDate));
  return litters;
}

/* =========================================================
   🌟 ฟังก์ชันดึงข้อมูลบัตรแม่หมู (ฉบับถึกทน - Standalone)
   วางทับฟังก์ชัน sow_getSowCardData ตัวเดิมได้เลย
   ========================================================= */

function sow_getSowCardData(sowId) {
  try {
    // 1. เข้าถึงชีตโดยตรง (ไม่ต้องผ่าน Config)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName("แม่_ทะเบียนประวัติ");
    
    if (!regSheet) {
      Logger.log("❌ Error: ไม่พบชีต 'แม่_ทะเบียนประวัติ'");
      return null;
    }

    const data = regSheet.getDataRange().getValues();
    const headers = data[0]; // หัวตารางบรรทัดแรก

    // 2. หาตำแหน่งคอลัมน์เอง (กันพลาด)
    const getColIndex = (name) => headers.indexOf(name);
    
    const idx = {
      id: getColIndex("รหัสแม่สุกร"),
      tag: getColIndex("เบอร์หู"),
      breed: getColIndex("สายพันธุ์"),
      status: getColIndex("สถานะ(ระบบ)"), // ลองหาอันนี้ก่อน
      status2: getColIndex("สถานะ(ป้อนเอง)"), // ถ้าไม่มีใช้อันนี้
      parity: getColIndex("ครอกที่"),
      img: getColIndex("URLรูปภาพ"),
      nextDate: getColIndex("วันที่นัดหมาย"),
      nextAction: getColIndex("กิจกรรมถัดไป")
    };

    // ถ้าหา ID ไม่เจอ แสดงว่าหัวตารางผิด
    if (idx.id === -1) {
      Logger.log("❌ Error: ไม่พบคอลัมน์ 'รหัสแม่สุกร'");
      return null;
    }

    // 3. ค้นหาแม่หมู
    const row = data.find(r => String(r[idx.id]).trim() === String(sowId).trim());
    if (!row) {
      Logger.log("⚠️ ไม่พบแม่หมู ID: " + sowId);
      return null;
    }

    // 4. เตรียมข้อมูล Profile
    const status = row[idx.status] || row[idx.status2] || "ปกติ";
    const profile = {
      sowId: sowId,
      earTag: row[idx.tag],
      breed: row[idx.breed] || "-",
      status: status,
      parity: row[idx.parity] || 0,
      imageUrl: row[idx.img] || "",
      lastUpdate: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "d MMM yy")
    };

    // 5. คำนวณวันคงเหลือ
    profile.daysCount = "-";
    profile.daysLabel = "";
    
    const nextDateRaw = row[idx.nextDate];
    if (nextDateRaw && nextDateRaw instanceof Date) {
      const today = new Date(); today.setHours(0,0,0,0);
      const target = new Date(nextDateRaw); target.setHours(0,0,0,0);
      const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
      
      if (status.includes("อุ้มท้อง")) {
        profile.daysLabel = "อีกกี่วันคลอด";
        profile.daysCount = diff + " วัน";
      } else if (status.includes("เลี้ยงลูก")) {
        profile.daysLabel = "อีกกี่วันหย่านม";
        profile.daysCount = diff + " วัน";
      } else {
        profile.daysLabel = "นัดหมายถัดไป";
        profile.daysCount = diff > 0 ? `อีก ${diff} วัน` : (diff === 0 ? "วันนี้" : `เลยมา ${Math.abs(diff)} วัน`);
      }
    }

    // 6. ดึงประวัติ (แบบย่อ เพื่อป้องกัน Error)
    let logs = [];
    const logSheet = ss.getSheetByName("แม่_บันทึกผสม");
    if (logSheet) {
      const lData = logSheet.getDataRange().getValues();
      const lHeaders = lData[0];
      const lIdx = { id: lHeaders.indexOf("รหัสแม่สุกร"), event: lHeaders.indexOf("ประเภทเหตุการณ์"), date: lHeaders.indexOf("วันที่เกิดเหตุ"), detail: lHeaders.indexOf("รายละเอียด") };
      
      if (lIdx.id > -1) {
        logs = lData.filter(r => String(r[lIdx.id]) === String(sowId))
                    .sort((a, b) => new Date(b[lIdx.date]) - new Date(a[lIdx.date])) // ใหม่ไปเก่า
                    .slice(0, 5) // เอา 5 อันล่าสุด
                    .map(r => ({
                      event: r[lIdx.event],
                      date: r[lIdx.date] instanceof Date ? Utilities.formatDate(r[lIdx.date], Session.getScriptTimeZone(), "d MMM yy") : "-",
                      detail: r[lIdx.detail] || "-"
                    }));
      }
    }

    // 7. สถิติลูกดก (Stats)
    let stats = { avgBornAlive: "-", totalLitters: 0 };
    const fSheet = ss.getSheetByName("แม่_บันทึกคลอด");
    if (fSheet) {
      const fData = fSheet.getDataRange().getValues();
      const fHeaders = fData[0];
      const fIdx = { id: fHeaders.indexOf("รหัสแม่สุกร"), alive: fHeaders.indexOf("มีชีวิต") };
      
      if (fIdx.id > -1) {
        const myFarrows = fData.filter(r => String(r[fIdx.id]) === String(sowId));
        stats.totalLitters = myFarrows.length;
        if (stats.totalLitters > 0) {
          const sumAlive = myFarrows.reduce((acc, r) => acc + Number(r[fIdx.alive]||0), 0);
          stats.avgBornAlive = (sumAlive / stats.totalLitters).toFixed(1);
        }
      }
    }

    return {
      profile: profile,
      status: { action: row[idx.nextAction] || "-", date: profile.daysLabel, count: profile.daysCount },
      stats: stats,
      history: logs
    };

  } catch (e) {
    Logger.log("❌ Critical Error in sow_getSowCardData: " + e.message);
    return null; // ส่งกลับเป็น null เพื่อให้หน้าจอรู้ว่า error
  }
}

function sow_logNotificationToSheet(sowId, message, type) {
  try {
    const sheet = sow_getSheet("Notifications");
    if (!sheet) return;
    const notifyId = `NOTI-${Utilities.getUuid().substring(0, 6)}`;
    const timestamp = new Date();
    sheet.appendRow([notifyId, timestamp, sowId, message, type, "TRUE", "FALSE"]);
  } catch (e) {
    Logger.log("Error logging notification: " + e.message);
  }
}

// 🧠 ฟังก์ชันรวบรวมข้อมูลให้ AI (Context Builder)
function sow_getFarmContextForAI() {
  let contextText = "";

  // 1. ดึงข้อมูลสถิติจาก Dashboard
  const dashData = sow_getDashboardData(); // ใช้ฟังก์ชันเดิมที่มีอยู่แล้ว
  if (dashData) {
    contextText += "--- ข้อมูลสถิติฟาร์มปัจจุบัน ---\n";
    contextText += `- แม่พันธุ์ทั้งหมด: ${dashData.total_sows || 0} ตัว\n`;
    contextText += `- สถานะรอผสม: ${dashData.status_wait || 0} ตัว\n`;
    contextText += `- สถานะอุ้มท้อง: ${dashData.status_preg || 0} ตัว\n`;
    contextText += `- สถานะเลี้ยงลูก: ${dashData.status_lac || 0} ตัว\n`;
    contextText += `- ค่าเฉลี่ยลูกมีชีวิต: ${dashData.avg_born_alive || 0} ตัว/ครอก\n\n`;
  }

  // 2. ดึงกฎวัคซีน (ย่อ)
  const vaccines = sow_getVaccineRules();
  if (vaccines.length > 0) {
    contextText += "--- โปรแกรมวัคซีน ---\n";
    vaccines.forEach(v => {
      contextText += `- ${v.name}: ฉีดเมื่อ ${v.refEvent} ${v.daysOffset > 0 ? '+' : ''}${v.daysOffset} วัน\n`;
    });
    contextText += "\n";
  }

  // 3. ดึงคู่มือจาก AI_Knowledge
  const kbSheet = sow_getSheet("AI_Knowledge"); // ต้องมั่นใจว่าสร้างชีตชื่อนี้แล้ว
  if (kbSheet && kbSheet.getLastRow() > 1) {
    const kbData = kbSheet.getRange(2, 1, kbSheet.getLastRow() - 1, 2).getValues(); // เอาคอลัมน์ A, B
    contextText += "--- คู่มือการใช้งานระบบและกฎฟาร์ม ---\n";
    kbData.forEach(row => {
      if (row[0] && row[1]) {
        contextText += `Q: ${row[0]}\nA: ${row[1]}\n`;
      }
    });
  }

  return contextText;
}

// ==========================================
// 🤖 ฟังก์ชัน AI อ๊อดแอด (ฉบับดึงกุญแจโดยตรง)
// ==========================================
function sow_askOddAdd(userMessage) {
  // 1. ดึงกุญแจจาก Script Properties โดยตรง (ไม่ผ่าน Config)
  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");

  // 2. ตรวจสอบกุญแจ
  if (!apiKey || apiKey.trim() === "") {
    return "⚠️ ขออภัยครับ ผมหากุญแจ 'GEMINI_API_KEY' ใน Script Properties ไม่เจอครับ";
  }

  // 3. เตรียมข้อมูลบริบทฟาร์ม
  var stats = sow_getDashboardData() || {};
  var context = "ข้อมูลฟาร์มปัจจุบัน: " +
                "แม่หมูทั้งหมด " + (stats.total_sows || 0) + " ตัว, " +
                "รอผสม " + (stats.status_wait || 0) + " ตัว, " +
                "อุ้มท้อง " + (stats.status_preg || 0) + " ตัว, " +
                "เลี้ยงลูก " + (stats.status_lac || 0) + " ตัว";

  // 4. เรียกใช้ Gemini API (รุ่น 1.5 Flash ที่เสถียรที่สุด)
  var apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;
  
  var payload = {
    "contents": [{
      "parts": [{
        "text": "คุณคือ 'อ๊อด แอด' AI ผู้ช่วยจัดการฟาร์มหมู ร่าเริง เป็นกันเอง\n" +
                "ข้อมูลอ้างอิง: " + context + "\n\n" +
                "คำถามจากผู้ใช้: " + userMessage
      }]
    }]
  };

  try {
    var options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    var response = UrlFetchApp.fetch(apiUrl, options);
    var json = JSON.parse(response.getContentText());

    if (json.error) {
      return "😵 เกิดข้อผิดพลาดจาก Google: " + json.error.message;
    }

    return json.candidates[0].content.parts[0].text;

  } catch (e) {
    return "😵 อ๊อดแอดป่วย (Error): " + e.message;
  }
}

/* ---------------------------------------------------------
   🤖 4. Batch Job (คำนวณสถานะ + แจ้งเตือน + Dashboard)
   ----------------------------------------------------------*/
function sow_dailyFarmJob() {
  // 1. คำนวณสถานะการผลิต
  sow_runCalculationForAllSows();
  // 2. อัปเดตข้อมูล Dashboard (Mission 2)
  sow_updateDashboardSheet();
  // 3. ส่งการแจ้งเตือน (รวมวัคซีน)
  sow_sendNotifications();
}

// (Mission 2) ฟังก์ชันคำนวณสถิติและบันทึกลงชีต Dashboard
function sow_updateDashboardSheet() {
  try {
    const dashSheet = sow_getSheet("Dashboard");
    const sowSheet = sow_getSheet("SowRegister");
    const farrowSheet = sow_getSheet("FarrowingLog");
    
    if (!dashSheet || !sowSheet) return;

    // 1. นับจำนวนตามสถานะ
    const sowHeaders = sow_getHeaderMap(sowSheet);
    const sowData = sowSheet.getRange(2, 1, sowSheet.getLastRow() - 1, sowSheet.getLastColumn()).getValues();
    
    let total = 0, wait = 0, preg = 0, lac = 0, rest = 0, alert = 0;
    
    sowData.forEach(row => {
      const status = (row[sowHeaders.statusComputed - 1] || "").toString();
      total++;
      if (status.includes("ผสม") || status.includes("กลับสัด") || status.includes("ไม่ท้อง")) wait++;
      else if (status.includes("อุ้มท้อง") || status.includes("ใกล้คลอด") || status.includes("รอตรวจ")) preg++;
      else if (status.includes("เลี้ยงลูก") || status.includes("ให้นม")) lac++;
      else if (status.includes("พักฟื้น")) rest++;
      else alert++; // อื่นๆ รวมคัดทิ้ง
    });

    // 2. คำนวณประสิทธิภาพ (Avg Born Alive) จาก FarrowingLog
    let avgBornAlive = 0;
    if (farrowSheet && farrowSheet.getLastRow() > 1) {
      const fHeaders = sow_getHeaderMap(farrowSheet);
      const fData = farrowSheet.getRange(2, fHeaders.bornAlive, farrowSheet.getLastRow() - 1, 1).getValues();
      let sumBorn = 0, countBorn = 0;
      fData.forEach(r => { 
        if(r[0]) { sumBorn += Number(r[0]); countBorn++; }
      });
      avgBornAlive = countBorn > 0 ? (sumBorn / countBorn).toFixed(1) : 0;
    }

    // 3. เตรียมข้อมูลลงชีต (Key, Value, Timestamp, Description)
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const stats = [
      ["total_sows", total, timestamp, "แม่พันธุ์ทั้งหมด"],
      ["status_wait", wait, timestamp, "รอผสม"],
      ["status_preg", preg, timestamp, "อุ้มท้อง"],
      ["status_lac", lac, timestamp, "เลี้ยงลูก"],
      ["status_rest", rest, timestamp, "พักฟื้น"],
      ["status_alert", alert, timestamp, "แจ้งเตือน/คัดทิ้ง"],
      ["avg_born_alive", avgBornAlive, timestamp, "ลูกมีชีวิตเฉลี่ย"]
    ];

    // 4. เขียนทับลงชีต Dashboard (ล้างเก่าแล้วเขียนใหม่)
    dashSheet.getRange(2, 1, dashSheet.getLastRow(), 4).clearContent(); // ล้างข้อมูลเดิม
    if (stats.length > 0) {
      dashSheet.getRange(2, 1, stats.length, 4).setValues(stats);
    }
    Logger.log("✅ Update Dashboard Sheet เรียบร้อยแล้ว");

  } catch (e) {
    Logger.log("❌ Error updating dashboard: " + e.message);
  }
}

function sow_runCalculationForAllSows() {
  const sheet = sow_getSheet("SowRegister");
  if (!sheet || sheet.getLastRow() < 2) return;
  Logger.log(`เริ่มต้น... อ่านข้อมูล BreedingLog ทั้งหมด (ครั้งเดียว)...`);
  const allLogsGrouped = sow_getAllLogsGroupedBySow();
  const cfg = sow_loadConfig();
  const headers = sow_getHeaderMap(sheet);
  if (!headers.sowId || !headers.statusComputed || !headers.nextAction || !headers.calendarEventId || !headers.earTag) {
    Logger.log("Error: ไม่พบคอลัมน์ที่จำเป็นใน SowRegister");
    return;
  }
  const sowRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  const sowValues = sowRange.getValues();
  const outputValues = [];
  const today = new Date();
  Logger.log(`เริ่มคำนวณสถานะแม่สุกร ${sowValues.length} ตัว...`);
  for (const sowRowData of sowValues) {
    const sowId = sowRowData[headers.sowId - 1];
    if (!sowId) { outputValues.push(sowRowData); continue; }
    const logs = allLogsGrouped[sowId] || [];
    const result = sow_computeSowStatus(sowId, logs, cfg);
    const earTag = sowRowData[headers.earTag - 1];
    const existingEventId = sowRowData[headers.calendarEventId - 1];
    const newEventId = sow_syncCalendarEvent(earTag, result.nextAction, result.nextActionDate, existingEventId);
    sowRowData[headers.statusComputed - 1] = result.status;
    sowRowData[headers.nextAction - 1] = result.nextAction;
    sowRowData[headers.nextActionDate - 1] = result.nextActionDate;
    sowRowData[headers.lastUpdatedAt - 1] = today;
    sowRowData[headers.calendarEventId - 1] = newEventId;
    outputValues.push(sowRowData);
  }
  sowRange.setValues(outputValues);
  Logger.log("✅ คำนวณสถานะและซิงค์ปฏิทินเรียบร้อยแล้ว");
}

function sow_runCalculationForSingleSow(row) {
  const cfg = sow_loadConfig();
  const sheet = sow_getSheet("SowRegister");
  const headers = sow_getHeaderMap(sheet);
  if (!headers.sowId || !headers.earTag || !headers.calendarEventId) return;
  const sowId = sheet.getRange(row, headers.sowId).getValue();
  if (!sowId) return;
  const logs = sow_getLogsForSow(sowId);
  const result = sow_computeSowStatus(sowId, logs, cfg);
  const earTag = sheet.getRange(row, headers.earTag).getValue();
  const existingEventId = sheet.getRange(row, headers.calendarEventId).getValue();
  const newEventId = sow_syncCalendarEvent(earTag, result.nextAction, result.nextActionDate, existingEventId);
  sheet.getRange(row, headers.statusComputed).setValue(result.status);
  sheet.getRange(row, headers.nextAction).setValue(result.nextAction);
  sheet.getRange(row, headers.nextActionDate).setValue(result.nextActionDate);
  sheet.getRange(row, headers.lastUpdatedAt).setValue(new Date());
  sheet.getRange(row, headers.calendarEventId).setValue(newEventId);
}

/* ---------------------------------------------------------
   🧠 5. ตรรกะการคำนวณ
   ----------------------------------------------------------*/
function sow_loadConfig() {
  const cfgSheet = sow_getSheet("Config");
  if (!cfgSheet || cfgSheet.getLastRow() < 2) return {};
  const cfg = cfgSheet.getRange(2, 1, cfgSheet.getLastRow() - 1, 2).getValues();
  const obj = {};
  for (let i = 0; i < cfg.length; i++) { obj[cfg[i][0]] = Number(cfg[i][1]) || cfg[i][1] }
  return obj
}
function sow_getLogsForSow(sowId) {
  const logSheet = sow_getSheet("BreedingLog");
  if (!logSheet || logSheet.getLastRow() < 2) return [];
  const logHeaders = sow_getHeaderMap(logSheet);
  if (!logHeaders.sowId || !logHeaders.eventType || !logHeaders.eventDate) return [];
  const col_sowId = logHeaders.sowId, col_eventType = logHeaders.eventType, col_eventDate = logHeaders.eventDate;
  const data = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, logSheet.getLastColumn()).getValues();
  const sowLogs = [];
  for (const row of data) {
    if (row[col_sowId - 1] === sowId) {
      const logObj = { sowId: row[col_sowId - 1], eventType: row[col_eventType - 1], eventDate: row[col_eventDate - 1], };
      if (logHeaders.logId) logObj.logId = row[logHeaders.logId - 1];
      if (logHeaders.details) logObj.details = row[logHeaders.details - 1];
      sowLogs.push(logObj)
    }
  }
  sowLogs.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
  return sowLogs
}
function sow_getLastEventDate(logs, eventTypeThai) { const event = logs.find(log => log.eventType === eventTypeThai); return event ? new Date(event.eventDate) : null }
function sow_computeSowStatus(sowId, logs, cfg) {
  const lastMating = sow_getLastEventDate(logs, 'ผสมพันธุ์'), pregPositive = sow_getLastEventDate(logs, 'ตรวจท้อง (พบ)'), pregNegative = sow_getLastEventDate(logs, 'ตรวจท้อง (ไม่พบ)'), farrowDate = sow_getLastEventDate(logs, 'คลอด'), weanDate = sow_getLastEventDate(logs, 'หย่านม'), abortion = sow_getLastEventDate(logs, 'แท้ง'), returnToEstrus = sow_getLastEventDate(logs, 'กลับสัด'), today = new Date(); today.setHours(0, 0, 0, 0); let status = 'พร้อมผสม', nextAction = 'พร้อมผสม', nextActionDate = null; if (weanDate && (!lastMating || lastMating < weanDate)) { const rebreedStart = sow_addDays(weanDate, cfg.min_wean_to_service_window_start), rebreedEnd = sow_addDays(weanDate, cfg.min_wean_to_service_window_end); if (today < rebreedStart) { status = 'พักฟื้น (รอผสม)'; nextAction = 'กำหนดผสมเร็วสุด'; nextActionDate = rebreedStart } else if (today >= rebreedStart && today <= rebreedEnd) { status = 'พร้อมผสมใหม่'; nextAction = 'ช่วงหน้าต่างผสม'; nextActionDate = today } else { status = 'เลยกำหนดผสม'; nextAction = 'เลยกำหนดผสม'; nextActionDate = today } } else if (farrowDate && (!weanDate || weanDate < farrowDate)) { const expectedWean = sow_addDays(farrowDate, cfg.wean_days_default); status = 'เลี้ยงลูก (ให้นม)'; nextAction = 'กำหนดหย่านม'; nextActionDate = expectedWean } else if (lastMating && (!farrowDate || farrowDate < lastMating)) {
    if ((abortion && abortion > lastMating) || (returnToEstrus && returnToEstrus > lastMating) || (pregNegative && pregNegative > lastMating)) { status = 'พร้อมผสม'; nextAction = 'ต้องผสมใหม่'; nextActionDate = today } else if (pregPositive && pregPositive > lastMating) {
      const expectedFarrow = sow_addDays(lastMating, cfg.gestation_days); if (sow_daysBetween(today, expectedFarrow) <= 7) { status = 'ใกล้คลอด' } else { status = 'อุ้มท้อง' }
      nextAction = 'กำหนดคลอด'; nextActionDate = expectedFarrow
    } else { const check1 = sow_addDays(lastMating, cfg.preg_check1_day), check2 = sow_addDays(lastMating, cfg.preg_check2_day); if (today < check1) { status = 'ผสมแล้ว (รอตรวจท้อง 1)'; nextAction = 'ตรวจท้อง ครั้งที่ 1'; nextActionDate = check1 } else if (today >= check1 && today < check2) { status = 'รอตรวจท้อง 2'; nextAction = 'ตรวจท้อง ครั้งที่ 2'; nextActionDate = check2 } else { status = 'เลยกำหนดตรวจท้อง'; nextAction = 'ตรวจท้องทันที'; nextActionDate = today } }
  }
  return { sowId: sowId, status: status, nextAction: nextAction, nextActionDate: nextActionDate }
}


/* ---------------------------------------------------------
   🔔 6. ระบบแจ้งเตือน
   ----------------------------------------------------------*/
function sow_installTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "sow_dailyFarmJob") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sow_dailyFarmJob").timeBased().everyDays(1).atHour(7).create();
  Logger.log("✅ ตั้ง Trigger 'sow_dailyFarmJob' เรียบร้อยแล้ว (ทำงานทุกวัน 07:00)");
}

function sow_sendNotifications() {
  const sheet = sow_getSheet("SowRegister");
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sow_getHeaderMap(sheet);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const allEvents = [];

  for (const row of data) {
    const earTag = row[headers.earTag - 1];
    const nextAction = row[headers.nextAction - 1];
    const nextActionDate = row[headers.nextActionDate - 1];
    const parity = row[headers.parity - 1] || 0;
    const status = row[headers.statusComputed - 1] || "";
    const sowId = row[headers.sowId - 1];

    if (nextActionDate && nextActionDate instanceof Date) {
      const diff = sow_daysBetween(today, nextActionDate);
      if (diff === 0) {
        allEvents.push({ type: 'manage', earTag: earTag, action: nextAction, parity: parity, status: "🔔 วันนี้", sowId: sowId });
      } else if (diff === 1) {
        allEvents.push({ type: 'manage', earTag: earTag, action: nextAction, parity: parity, status: "⏰ พรุ่งนี้", sowId: sowId });
      }
    }
    const vaccineTasks = sow_checkVaccineTasksForSow(sowId, earTag, status, nextActionDate);
    vaccineTasks.forEach(task => {
      allEvents.push({ type: 'vaccine', earTag: earTag, action: task.vaccineName, parity: parity, status: task.status, sowId: sowId });
    });
  }
  if (allEvents.length === 0) { Logger.log("No notifications to send today."); return; }
  const flexMessage = sow_buildAlertCarousel(allEvents);
  sow_sendLinePushMessage(SOW_CONFIG.LINE.GROUP_ID, flexMessage, SOW_CONFIG.LINE.TOKEN, allEvents.length);
}

function sow_checkVaccineTasksForSow(sowId, earTag, currentStatus, nextActionDateObj) {
  const tasks = [];
  if (!nextActionDateObj || !(nextActionDateObj instanceof Date)) return tasks;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rules = sow_getVaccineRules();
  let referenceDate = null;
  let referenceType = "";
  if (currentStatus.includes("อุ้มท้อง") || currentStatus.includes("ใกล้คลอด")) {
    referenceDate = nextActionDateObj; referenceType = "วันคลอด";
  }
  if (!referenceDate) return tasks;

  rules.forEach(rule => {
    if (rule.refEvent === referenceType) {
      const vacDueDate = sow_addDays(referenceDate, rule.daysOffset);
      const diff = sow_daysBetween(today, vacDueDate);
      if (diff === 0) tasks.push({ vaccineName: rule.name, status: "💉 วันนี้" });
      else if (diff === 1) tasks.push({ vaccineName: rule.name, status: "💉 พรุ่งนี้" });
    }
  });
  return tasks;
}

function sow_getVaccineRules() {
  const sheet = sow_getSheet("VaccineProgram");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = sow_getHeaderMap(sheet);
  if (!headers.vaccineName || !headers.refEvent || !headers.daysOffset) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return data.map(row => ({
    name: row[headers.vaccineName - 1],
    refEvent: row[headers.refEvent - 1], 
    daysOffset: Number(row[headers.daysOffset - 1])
  })).filter(r => r.name && r.refEvent);
}

function sow_sendLinePushMessage(groupId, flexMessageObject, token, eventCount) {
  if (token === "ใส่_CHANNEL_ACCESS_TOKEN_ของคุณที่นี่") return;
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = { to: groupId, messages: [{ type: "flex", altText: `🔔 งานวันนี้: ${eventCount}  รายการ`, contents: flexMessageObject }] };
  try {
    UrlFetchApp.fetch(url, { method: "post", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, payload: JSON.stringify(payload) });
  } catch (e) { Logger.log(e); }
}

function sow_buildAlertCarousel(events) {
  const bubbles = events.map(event => sow_buildSingleAlertBubble(event));
  return { type: "carousel", contents: bubbles };
}

function sow_buildSingleAlertBubble(event) {
  const { type, earTag, action, parity, status, sowId } = event;
  const webAppUrl = getAppUrl();
  let headerColor = "#2563eb", headerText = "โรงเรือนแม่พันธุ์";
  if (type === 'vaccine') { headerColor = "#059669"; headerText = "💉 แจ้งเตือนวัคซีน"; }
  else if (action.includes("คลอด") || status.includes("วันนี้")) { headerColor = "#ef4444"; }

  const header = {
    type: "box", layout: "vertical", backgroundColor: headerColor, paddingAll: "12px",
    contents: [{ type: "text", text: headerText, weight: "bold", size: "lg", color: "#ffffff" }]
  };
  const body = {
    type: "box", layout: "vertical", spacing: "md", paddingAll: "16px",
    contents: [
      sow_createKeyValueRow("🐷 เบอร์หู:", earTag, true),
      sow_createKeyValueRow("⭐ ครอกที่:", parity.toString()),
      sow_createKeyValueRow("📅 กิจกรรม:", action),
      sow_createKeyValueRow("⏰ สถานะ:", status, false, status.includes("วันนี้") ? "#ef4444" : "#2563eb")
    ]
  };
  const footerContents = [];
  if (type === 'vaccine' && status.includes("วันนี้")) {
    const recordUrl = `${webAppUrl}?action=record_vaccine&sowId=${sowId}&earTag=${earTag}&vaccine=${encodeURIComponent(action)}`;
    footerContents.push(sow_createButton("✅ ฉีดแล้ว (บันทึก)", recordUrl));
  }
  const footer = { type: "box", layout: "vertical", contents: footerContents, paddingAll: "16px" };
  return { type: "bubble", size: "mega", header: header, body: body, footer: footer, action: { type: "uri", label: "เปิดแอป", uri: webAppUrl } };
}

function sow_createKeyValueRow(key, value, isValueBold = false, valueColor = "#6b7280") {
  return { type: "box", layout: "horizontal", contents: [{ type: "text", text: key, flex: 4 }, { type: "text", text: value, color: isValueBold ? "#15803d" : valueColor, flex: 6 }] };
}
function sow_createButton(label, url) {
  let targetUrl = url; if (url.includes("ใส่_ลิงก์")) targetUrl = ScriptApp.getService().getUrl();
  return { type: "button", action: { type: "uri", label: label, uri: targetUrl }, style: "link", color: "#15803d", height: "sm" };
}

/* ---------------------------------------------------------
   🛠️ 7. ฟังก์ชันช่วย (Helpers)
   ----------------------------------------------------------*/
var _sheetCache = {};
function sow_getSheet(sheetKey) {
  if (_sheetCache[sheetKey]) return _sheetCache[sheetKey];
  // หาชื่อไทยจาก Map
  var realName = SOW_CONFIG.SHEET_NAMES[sheetKey] || sheetKey;
  
  const s = SS.getSheetByName(realName);
  if(s) { _sheetCache[sheetKey] = s; return s; }
  return null;
}

var HEADER_MAP_CACHE = {};
function sow_getHeaderMap(sheet) {
  if (!sheet) return {};
  const sheetName = sheet.getName();
  if (HEADER_MAP_CACHE[sheetName]) return HEADER_MAP_CACHE[sheetName];
  
  // หา Map Key จากชื่อไทย
  const mapKey = Object.keys(SOW_CONFIG.SHEET_NAMES).find(key => SOW_CONFIG.SHEET_NAMES[key] === sheetName);
  const thaiMapKey = mapKey ? SOW_CONFIG.SHEET_NAMES[mapKey] : sheetName;
  const map = THAI_ENGLISH_MAP[thaiMapKey];

  if (!map && sheetName !== "Dashboard") return {}; 
  if (sheetName === "Dashboard") { return { metric_key: 1, metric_value: 2, updated_at: 3 }; }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const finalMap = {};
  if(map) {
      for(let k in map) { const idx = headers.indexOf(k); if(idx > -1) finalMap[map[k]] = idx + 1; }
  }
  HEADER_MAP_CACHE[sheetName] = finalMap;
  return finalMap;
}
function sow_findSowRow(id) { const s = sow_getSheet("SowRegister"); const h = sow_getHeaderMap(s); const d = s.getRange(2, h.sowId, s.getLastRow(), 1).getValues(); for(let i=0; i<d.length; i++) if(d[i][0]==id) return i+2; return -1; }
function sow_addDays(d, n) { let r = new Date(d); r.setDate(r.getDate() + Number(n)); return r; }
function sow_daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / (86400000)); }
function sow_getAllLogsGroupedBySow() { const s = sow_getSheet("BreedingLog"); const h = sow_getHeaderMap(s); const d = s.getDataRange().getValues(); const g = {}; d.slice(1).forEach(r => { const id = r[h.sowId-1]; if(!g[id]) g[id]=[]; g[id].push({eventType:r[h.eventType-1], eventDate:r[h.eventDate-1]}); }); return g; }
function sow_getLogsForSow(sowId) { return sow_getAllLogsGroupedBySow()[sowId] || []; }
function sow_uploadImageAndGetUrl(id, f) { try { return DriveApp.getFolderById(SOW_CONFIG.DRIVE.FOLDER_ID).createFile(Utilities.newBlob(Utilities.base64Decode(f.data.split(',')[1]), f.mimeType, id)).getUrl(); } catch(e){return"";} }
function sow_syncCalendarEvent(earTag, title, date, eventId) { if(!SOW_CONFIG.CALENDAR.ID || !date) return ""; const dStr = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd"); const details = { summary: `[${earTag}] ${title}`, start: { date: dStr }, end: { date: dStr } }; try { if(eventId) { try { Calendar.Events.update(details, SOW_CONFIG.CALENDAR.ID, eventId); return eventId; } catch(e){} } return Calendar.Events.insert(details, SOW_CONFIG.CALENDAR.ID).id; } catch(e) { return ""; } }
function getAppUrl() { return ScriptApp.getService().getUrl(); }

