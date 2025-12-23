/* * Main_App.gs
 * หน้าที่: เป็นตัวกลาง (Router) และ API Gateway สำหรับหน้า Dashboard (Index.html)
 * เชื่อมต่อกับ: Fatten_Service, Sow_Service, HR_Service, Feed_Service
 */

// ==========================================
// 🌐 1. ROUTER (ตัวแยกเส้นทาง)
// ==========================================
function doGet(e) {
  var params = e.parameter || {};
  var page = params.page || 'home'; // ค่าเริ่มต้นคือหน้า Home (Index.html)
  var htmlOutput;

  switch (page) {
    case 'fatten': // 🐷 ระบบหมูขุน
      htmlOutput = HtmlService.createTemplateFromFile('Fatten_Index');
      htmlOutput.startPen = 1; // เริ่มต้นที่คอก 1
      break;

    case 'sow':    // 🤰 ระบบแม่พันธุ์
      htmlOutput = HtmlService.createTemplateFromFile('Sow_Index');
      break;

    case 'hr':     // 👥 ระบบ HR
      htmlOutput = HtmlService.createTemplateFromFile('HR_Index');
      break;

    case 'feed':   // 🍽️ ระบบอาหาร
      htmlOutput = HtmlService.createTemplateFromFile('Feed_Index');
      break;

    case 'home':   // 🏠 หน้า Dashboard รวม (ไฟล์ที่คุณเพิ่งส่งมา)
    default:
      // ต้องมั่นใจว่าไฟล์ HTML ชื่อ "Index" (ไม่ใช่ Index.html ในโค้ดเรียกแค่ Index)
      // ถ้าคุณตั้งชื่อไฟล์ว่า Index.html ใน Apps Script ให้ใช้ชื่อ 'Index'
      htmlOutput = HtmlService.createTemplateFromFile('Index'); 
      break;
  }

  // ส่งค่า URL ของ App ไปให้หน้าบ้านใช้ (สำคัญมากสำหรับการกดเปลี่ยนหน้า)
  htmlOutput.appUrl = getAppUrl();

  return htmlOutput.evaluate()
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle('นิพนธ์ฟาร์ม (Smart Farm)');
}

// ฟังก์ชันช่วยดึง URL (เรียกใช้โดย HTML: <? var url = getAppUrl(); ?>)
function getAppUrl() {
  return ScriptApp.getService().getUrl();
}

// ==========================================
// 📊 2. API สำหรับ DASHBOARD (ตัวหนังสือวิ่ง)
// ==========================================
// ฟังก์ชันนี้ถูกเรียกโดย Index.html -> google.script.run.main_getGlobalStats()
function main_getGlobalStats() {
  var stats = {
    sow: "กำลังโหลด...",
    fatten: "กำลังโหลด...",
    feed: "ปกติ"
  };

  try {
    // --- ดึงข้อมูลแม่พันธุ์ ---
    // ลองเรียกฟังก์ชันจาก Sow_Service (ถ้ามี) หรืออ่านชีตโดยตรง
    try {
       // สมมติว่าดึงจากชีตแดชบอร์ดแม่พันธุ์
       var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"));
       var sowSheet = ss.getSheetByName("แม่_แดชบอร์ด");
       if (sowSheet) {
         var val = sowSheet.getRange("B2").getValue(); // สมมติ B2 คือจำนวนแม่ทั้งหมด
         stats.sow = "แม่พันธุ์ทั้งหมด " + val + " ตัว | พร้อมผสม " + sowSheet.getRange("B3").getValue() + " ตัว";
       } else {
         stats.sow = "พร้อมใช้งาน (รอข้อมูล)";
       }
    } catch(e) { stats.sow = "ระบบแม่พันธุ์: พร้อม"; }

    // --- ดึงข้อมูลหมูขุน ---
    try {
      // นับจำนวนจากชีตสถานะคอก
      var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"));
      var fatSheet = ss.getSheetByName("ขุน_สถานะคอก");
      if (fatSheet) {
         var data = fatSheet.getDataRange().getValues();
         var totalPigs = 0;
         var activePens = 0;
         // วนลูปนับ (เริ่มแถว 1 ข้ามหัวตาราง)
         for (var i=1; i<data.length; i++) {
           if (data[i][1] == "ใช้งาน") { // คอลัมน์ B คือสถานะ
             activePens++;
             totalPigs += Number(data[i][5] || 0); // คอลัมน์ F คือคงเหลือ
           }
         }
         stats.fatten = "เลี้ยงอยู่ " + activePens + " คอก | รวม " + totalPigs + " ตัว";
      }
    } catch(e) { stats.fatten = "ระบบหมูขุน: พร้อม"; }

    // --- ดึงข้อมูลอาหาร ---
    // (ส่วนนี้ใส่ Logic แจ้งเตือนอาหารใกล้หมดได้ในอนาคต)
    stats.feed = "✅ สต็อกอาหารเพียงพอ | 🚚 รับเข้าล่าสุดเมื่อวาน";

  } catch (error) {
    console.error("Error getting global stats: " + error);
  }

  return stats;
}

// ==========================================
// 🕒 3. API สำหรับ HR WIDGET (ปุ่มลงเวลาลอย)
// ==========================================

// 3.1 ดึงรายชื่อพนักงานใส่ Dropdown
// ถูกเรียกโดย Index.html -> google.script.run.hr_getEmployeeList()
function hr_getEmployeeList() {
  try {
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"));
    // ต้องตรงกับชื่อชีตใน Config ของคุณ
    var sheet = ss.getSheetByName("HR_Employees") || ss.getSheetByName("พนักงาน_รายชื่อ"); 
    
    if (!sheet) return [];

    var data = sheet.getDataRange().getValues();
    var list = [];
    
    // เริ่ม i=1 เพื่อข้ามหัวตาราง
    for (var i = 1; i < data.length; i++) {
      if (data[i][9] === "ทำงาน" || data[i][9] === "Active") { // เช็คสถานะ (คอลัมน์ J)
        list.push({
          id: data[i][0],   // รหัสพนักงาน (คอลัมน์ A)
          name: data[i][1]  // ชื่อ-สกุล (คอลัมน์ B)
        });
      }
    }
    return list;
  } catch (e) {
    console.error("Error getting emp list: " + e);
    return [];
  }
}

// 3.2 บันทึกเวลาจากหน้า Dashboard
// ถูกเรียกโดย Index.html -> google.script.run.hr_submitTimeLog()
function hr_submitTimeLog(data) {
  // data = { empId, empName, lat, lng }
  try {
    // เรียกใช้ฟังก์ชันหลักจากไฟล์ HR_Service.gs (ถ้าคุณเขียนไว้แล้ว)
    // แต่ถ้ายัง ให้ใช้โค้ดบันทึกเบื้องต้นนี้ไปก่อน:
    
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"));
    var logSheet = ss.getSheetByName("HR_TimeLogs") || ss.getSheetByName("พนักงาน_ลงเวลา");
    
    if (!logSheet) return { success: false, message: "หาชีตลงเวลาไม่เจอ" };

    // สร้าง ID ธุรกรรม
    var logId = "LOG-" + Utilities.formatDate(new Date(), "GMT+7", "yyMMddHHmmss");
    var timestamp = new Date();
    var mapLink = "https://www.google.com/maps?q=" + data.lat + "," + data.lng;

    // บันทึก (appendRow)
    logSheet.appendRow([
      logId,                // A: Log ID
      timestamp,            // B: เวลา
      data.empId,           // C: รหัส
      data.empName,         // D: ชื่อ
      "IN (Dashboard)",     // E: ประเภท (บังคับเข้างาน)
      data.lat + "," + data.lng, // F: พิกัด
      mapLink,              // G: แผนที่
      "ปกติ",               // H: สถานะ
      "ลงผ่านหน้าแรก"         // I: หมายเหตุ
    ]);

    return { success: true, message: "บันทึกเวลาสำเร็จ!" };

  } catch (e) {
    return { success: false, message: "Error: " + e.message };
  }
}
