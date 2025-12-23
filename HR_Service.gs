/* * HR_Service.gs
 * ระบบจัดการบุคคล: ลงเวลา (GPS), การลา, เบิกเงิน, และคำนวณเงินเดือน
 * Standard: Dynamic Header Map (อ่านชื่อคอลัมน์อัตโนมัติแบบระบบแม่พันธุ์)
 * Version: Full Features (ไม่ตัดทอน)
 */

// ✅ 1. CONFIGURATION
var HR_CONFIG = HR_CONFIG || {};

// กำหนดชื่อชีตให้ตรงกับไฟล์ CSV ของคุณ 100%
HR_CONFIG.SHEET_NAME = {
  EMP: "HR_Employees",
  ADVANCE: "HR_Advances",
  LEAVE: "HR_Leaves",
  TIME: "HR_TimeLogs",
  DOC: "HR_Documents",
  PAYROLL: "HR_Payroll"
};

// ดึง ID จาก Properties
var _scriptProps = PropertiesService.getScriptProperties();
HR_CONFIG.SPREADSHEET_ID = _scriptProps.getProperty("SPREADSHEET_ID");
HR_CONFIG.DRIVE_FOLDER_ID = _scriptProps.getProperty("HR_DOC_FOLDER_ID");
HR_CONFIG.TEMPLATE_ADVANCE_ID = _scriptProps.getProperty("HR_TEMPLATE_ADVANCE_ID");
HR_CONFIG.TEMPLATE_PAYROLL_ID = _scriptProps.getProperty("HR_TEMPLATE_PAYROLL_ID");
HR_CONFIG.LINE_TOKEN = _scriptProps.getProperty("LINE_TOKEN");

// พิกัดฟาร์ม (สำหรับการลงเวลา)
HR_CONFIG.FARM_LOCATION = { lat: 7.6266950, lng: 100.0030960 };
HR_CONFIG.MAX_DISTANCE_METERS = 800; 

const HR_SS = SpreadsheetApp.openById(HR_CONFIG.SPREADSHEET_ID);

// ==========================================
// 🧠 CORE: Helper Functions (Dynamic Header Map)
// ==========================================

function hr_getHeaderMap(sheetName) {
  var sheet = HR_SS.getSheetByName(sheetName);
  if (!sheet) throw new Error("ไม่พบชีต: " + sheetName);
  
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return { map: {}, sheet: sheet, headers: [] };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  
  headers.forEach(function(header, index) {
    map[header.toString().trim()] = index;
  });
  
  return { map: map, sheet: sheet, headers: headers };
}

// ==========================================
// 📥 2. READ FUNCTIONS (ดึงข้อมูล)
// ==========================================

function hr_getEmployeeList() {
  var h = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.EMP);
  var data = h.sheet.getDataRange().getValues();
  
  // Slice(1) เพื่อข้ามหัวตาราง
  return data.slice(1).map(function(row, i) {
    return {
      rowIndex: i + 2, // เก็บเลขแถวไว้ใช้อ้างอิง
      id: row[h.map['รหัสพนักงาน']],
      name: row[h.map['ชื่อ-สกุล']],
      position: row[h.map['ตำแหน่ง']],
      type: row[h.map['ประเภทค่าจ้าง']],
      rate: row[h.map['อัตราค่าจ้าง']],
      bankNum: row[h.map['เลขบัญชี']],
      phone: row[h.map['เบอร์โทร']],
      status: row[h.map['สถานะ']],
      profile: row[h.map['รูปโปรไฟล์']],
      debt: row[h.map['หนี้คงค้าง']]
    };
  }).filter(function(e) { return e.id && e.id !== ""; });
}

function hr_login(employeeId, password) {
  var h = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.EMP);
  var data = h.sheet.getDataRange().getValues();
  
  var userRow = data.slice(1).find(function(row) {
    return String(row[h.map['รหัสพนักงาน']]) === String(employeeId) && 
           String(row[h.map['รหัสผ่าน']]) === String(password);
  });
  
  if (!userRow) return { success: false, message: "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง" };
  
  var status = userRow[h.map['สถานะ']];
  if (status !== 'ทำงาน') return { success: false, message: "สถานะของคุณคือ: " + status };
  
  return { 
    success: true, 
    user: { 
      id: userRow[h.map['รหัสพนักงาน']], 
      name: userRow[h.map['ชื่อ-สกุล']], 
      position: userRow[h.map['ตำแหน่ง']], 
      profile: userRow[h.map['รูปโปรไฟล์']] 
    } 
  };
}

function hr_getMyAllHistory(employeeId) {
  var list = [];
  
  // 1. ประวัติเบิกเงิน
  try {
    var adv = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.ADVANCE);
    var advData = adv.sheet.getDataRange().getValues();
    advData.slice(1).forEach(function(row) {
      if (String(row[adv.map['รหัสพนักงาน']]) === String(employeeId)) {
        list.push({
          type: 'money',
          title: "เบิก " + Number(row[adv.map['จำนวนเงินที่ขอ']]).toLocaleString(),
          detail: row[adv.map['เหตุผล']],
          date: Utilities.formatDate(new Date(row[adv.map['วันที่เวลาขอ']]), "Asia/Bangkok", "dd/MM/yyyy"),
          status: row[adv.map['สถานะ']],
          link: row[adv.map['ลิงก์สลิปโอนเงิน (PDF)']]
        });
      }
    });
  } catch(e) {}

  // 2. ประวัติการลา
  try {
    var lev = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.LEAVE);
    var levData = lev.sheet.getDataRange().getValues();
    levData.slice(1).forEach(function(row) {
      if (String(row[lev.map['รหัสพนักงาน']]) === String(employeeId)) {
        list.push({
          type: 'leave',
          title: "ลา" + row[lev.map['ประเภทลา']],
          detail: row[lev.map['จำนวนวัน']] + " วัน (" + row[lev.map['เหตุผล']] + ")",
          date: Utilities.formatDate(new Date(row[lev.map['Timestamp']]), "Asia/Bangkok", "dd/MM/yyyy"),
          status: row[lev.map['สถานะ']],
          link: ""
        });
      }
    });
  } catch(e) {}
  
  // 3. ประวัติเอกสาร
  try {
    var doc = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.DOC);
    var docData = doc.sheet.getDataRange().getValues();
    docData.slice(1).forEach(function(row) {
      if (String(row[doc.map['รหัสพนักงาน']]) === String(employeeId)) {
        list.push({
          type: 'document',
          title: "เอกสาร: " + row[doc.map['ประเภทเอกสาร']],
          detail: "อัปโหลดเมื่อ " + Utilities.formatDate(new Date(row[doc.map['Timestamp']]), "Asia/Bangkok", "HH:mm"),
          date: Utilities.formatDate(new Date(row[doc.map['Timestamp']]), "Asia/Bangkok", "dd/MM/yyyy"),
          status: "สมบูรณ์",
          link: row[doc.map['ลิงก์ไฟล์ (Drive)']]
        });
      }
    });
  } catch(e) {}

  return list.reverse();
}

function hr_getPendingRequests() {
  var list = [];
  
  // รออนุมัติเงิน
  var adv = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.ADVANCE);
  var advData = adv.sheet.getDataRange().getValues();
  advData.slice(1).forEach(function(row, i) {
    if (row[adv.map['สถานะ']] === 'รออนุมัติ') {
      list.push({
        group: 'money', 
        rowIndex: i + 2, 
        reqId: row[adv.map['รหัสรายการ']],
        empId: row[adv.map['รหัสพนักงาน']],
        desc: "เบิก " + Number(row[adv.map['จำนวนเงินที่ขอ']]).toLocaleString() + " (" + row[adv.map['เหตุผล']] + ")"
      });
    }
  });

  // รออนุมัติลา
  var lev = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.LEAVE);
  var levData = lev.sheet.getDataRange().getValues();
  levData.slice(1).forEach(function(row, i) {
    if (row[lev.map['สถานะ']] === 'รออนุมัติ') {
      list.push({
        group: 'leave', 
        rowIndex: i + 2, 
        reqId: row[lev.map['Leave ID']],
        empId: row[lev.map['รหัสพนักงาน']],
        desc: "ลา" + row[lev.map['ประเภทลา']] + " " + row[lev.map['จำนวนวัน']] + " วัน"
      });
    }
  });
  
  return list;
}

// ==========================================
// 📝 3. WRITE FUNCTIONS (บันทึกข้อมูล)
// ==========================================

function hr_submitTimeLog(data) {
  // 1. คำนวณระยะทาง GPS
  var dist = hr_calculateDistance(data.lat, data.lng, HR_CONFIG.FARM_LOCATION.lat, HR_CONFIG.FARM_LOCATION.lng);
  if (dist > HR_CONFIG.MAX_DISTANCE_METERS) {
    return { success: false, message: "อยู่นอกพื้นที่ (" + Math.round(dist) + " ม.)" };
  }

  // 2. เตรียมข้อมูล
  var h = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.TIME);
  var logs = h.sheet.getDataRange().getValues();
  var todayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
  var type = "IN"; // Default
  
  // 3. ตรวจสอบสถานะล่าสุด (IN หรือ OUT)
  if (logs.length > 1) {
    for (var i = logs.length - 1; i >= 1; i--) {
      var row = logs[i];
      if (String(row[h.map['รหัสพนักงาน']]) === String(data.empId)) {
         var logDate = Utilities.formatDate(new Date(row[h.map['Timestamp']]), "Asia/Bangkok", "yyyy-MM-dd");
         if (logDate === todayStr) {
             type = (row[h.map['ประเภท']] === 'IN') ? 'OUT' : 'IN';
             break;
         }
      }
    }
  }

  // 4. จัดการรูปภาพ (ถ้ามี)
  var noteOrUrl = "";
  if (data.image) {
     try {
       var folder = DriveApp.getFolderById(HR_CONFIG.DRIVE_FOLDER_ID);
       var blob = Utilities.newBlob(Utilities.base64Decode(data.image.split(',')[1]), 'image/jpeg', "Log_" + data.empId + "_" + Date.now());
       var file = folder.createFile(blob);
       file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
       noteOrUrl = file.getUrl();
     } catch(e) {
       noteOrUrl = "Image Error";
     }
  }

  // 5. บันทึกข้อมูล (ใช้ Array เปล่าแล้วหยอดตามชื่อคอลัมน์)
  var newRow = new Array(h.headers.length).fill("");
  
  newRow[h.map['Log ID']] = "LOG-" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyMMddHHmmss");
  newRow[h.map['Timestamp']] = new Date();
  newRow[h.map['รหัสพนักงาน']] = data.empId;
  newRow[h.map['ชื่อ-สกุล']] = data.empName;
  newRow[h.map['ประเภท']] = type;
  newRow[h.map['พิกัด (GPS)']] = data.lat + ", " + data.lng;
  newRow[h.map['แผนที่']] = "http://googleusercontent.com/maps.google.com/maps/api/staticmap?center=" + data.lat + "," + data.lng + "&zoom=15&size=400x400&markers=" + data.lat + "," + data.lng;
  newRow[h.map['สถานะ']] = "ปกติ";
  newRow[h.map['หมายเหตุ']] = noteOrUrl || "ปกติ";

  h.sheet.appendRow(newRow);
  
  hr_sendLineNotify("🕒 " + data.empName + " ลงเวลา " + type + " (ห่าง " + Math.round(dist) + " ม.)");
  
  return { success: true, message: "ลงเวลา " + type + " สำเร็จ", type: type };
}

function hr_submitApplication(form) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var h = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.EMP);
    
    var nextId = "EMP-" + String(h.sheet.getLastRow()).padStart(3, '0');
    var profileUrl = "";
    
    if (form.photoBase64) {
      var folder = DriveApp.getFolderById(HR_CONFIG.DRIVE_FOLDER_ID);
      var blob = Utilities.newBlob(Utilities.base64Decode(form.photoBase64.split(',')[1]), form.mimeType, "Profile_" + nextId);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      profileUrl = file.getUrl();
    }

    var newRow = new Array(h.headers.length).fill("");

    newRow[h.map['รหัสพนักงาน']] = nextId;
    newRow[h.map['ชื่อ-สกุล']] = form.name;
    newRow[h.map['ตำแหน่ง']] = form.position;
    newRow[h.map['ประเภทค่าจ้าง']] = "-";
    newRow[h.map['อัตราค่าจ้าง']] = 0;
    newRow[h.map['เลขบัญชี']] = form.bankNum;
    newRow[h.map['เบอร์โทร']] = form.phone;
    newRow[h.map['รหัสผ่าน']] = form.password;
    newRow[h.map['หนี้คงค้าง']] = 0;
    newRow[h.map['สถานะ']] = "รออนุมัติ";
    newRow[h.map['ที่อยู่']] = form.address;
    newRow[h.map['การศึกษา']] = form.edu;
    newRow[h.map['ชื่อธนาคาร']] = form.bankName;
    newRow[h.map['Gmail']] = form.gmail;
    newRow[h.map['LINE ID']] = form.lineId;
    newRow[h.map['รูปโปรไฟล์']] = profileUrl;

    h.sheet.appendRow(newRow);
    hr_sendLineNotify("📝 มีผู้สมัครใหม่: " + form.name);
    return { success: true, message: "สมัครเรียบร้อย รหัสของคุณคือ: " + nextId };

  } catch(e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

function hr_activateEmployee(data) {
  var h = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.EMP);
  var sheet = h.sheet;
  
  // ใช้ rowIndex เพื่อระบุแถว
  sheet.getRange(data.rowIndex, h.map['ประเภทค่าจ้าง'] + 1).setValue(data.type);
  sheet.getRange(data.rowIndex, h.map['อัตราค่าจ้าง'] + 1).setValue(data.rate);
  sheet.getRange(data.rowIndex, h.map['สถานะ'] + 1).setValue("ทำงาน");
  
  return { success: true };
}

function hr_submitAdvance(form) {
  var h = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.ADVANCE);
  var newRow = new Array(h.headers.length).fill("");

  newRow[h.map['รหัสรายการ']] = "ADV-" + Date.now();
  newRow[h.map['วันที่เวลาขอ']] = new Date();
  newRow[h.map['รหัสพนักงาน']] = form.empId;
  newRow[h.map['จำนวนเงินที่ขอ']] = form.amount;
  newRow[h.map['เหตุผล']] = form.reason;
  newRow[h.map['สถานะ']] = "รออนุมัติ";

  h.sheet.appendRow(newRow);
  hr_sendLineNotify("💸 ขอเบิกเงิน: " + form.empName + " (" + form.amount + ")");
  return { success: true };
}

function hr_submitLeave(form) {
  var h = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.LEAVE);
  var d1 = new Date(form.start);
  var d2 = new Date(form.end);
  var days = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;

  var newRow = new Array(h.headers.length).fill("");

  newRow[h.map['Leave ID']] = "LEV-" + Date.now();
  newRow[h.map['Timestamp']] = new Date();
  newRow[h.map['รหัสพนักงาน']] = form.empId;
  newRow[h.map['ชื่อ-สกุล']] = form.empName;
  newRow[h.map['ประเภทลา']] = form.type;
  newRow[h.map['วันเริ่ม']] = d1;
  newRow[h.map['วันสิ้นสุด']] = d2;
  newRow[h.map['จำนวนวัน']] = days;
  newRow[h.map['เหตุผล']] = form.reason;
  newRow[h.map['สถานะ']] = "รออนุมัติ";

  h.sheet.appendRow(newRow);
  return { success: true };
}

function hr_uploadDocument(form) {
  try {
    var folder = DriveApp.getFolderById(HR_CONFIG.DRIVE_FOLDER_ID);
    var blob = Utilities.newBlob(Utilities.base64Decode(form.fileBase64.split(',')[1]), form.mimeType, form.empId + "_" + form.docType);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var h = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.DOC);
    var newRow = new Array(h.headers.length).fill("");
    
    newRow[h.map['Doc ID']] = "DOC-" + Date.now();
    newRow[h.map['Timestamp']] = new Date();
    newRow[h.map['รหัสพนักงาน']] = form.empId;
    newRow[h.map['ชื่อ-สกุล']] = form.empName;
    newRow[h.map['ประเภทเอกสาร']] = form.docType;
    newRow[h.map['ลิงก์ไฟล์ (Drive)']] = file.getUrl();
    newRow[h.map['ผู้อัปโหลด']] = "Uploaded by User";
    
    h.sheet.appendRow(newRow);
    return { success: true };
  } catch(e) { return { success: false, message: e.message }; }
}

// ==========================================
// 👔 4. MANAGER & PAYROLL (อนุมัติ/เงินเดือน)
// ==========================================

function hr_approveItem(data) {
  var sheetName = (data.group === 'money') ? HR_CONFIG.SHEET_NAME.ADVANCE : HR_CONFIG.SHEET_NAME.LEAVE;
  var h = hr_getHeaderMap(sheetName);
  var sheet = h.sheet;
  
  sheet.getRange(data.row, h.map['สถานะ'] + 1).setValue("อนุมัติ");
  sheet.getRange(data.row, h.map['ผู้อนุมัติ'] + 1).setValue("Admin");
  
  if (data.group === 'money') {
    sheet.getRange(data.row, h.map['วันที่จ่ายเงิน/โอน'] + 1).setValue(new Date());
    
    if (HR_CONFIG.TEMPLATE_ADVANCE_ID) {
        var emp = hr_getEmployeeList().find(function(e) { return String(e.id) === String(data.empId); }) || { name: data.empId, position: '-' };
        var amountOnly = data.desc.match(/\d+/g).join("");
        
        var pdfUrl = hr_createPdfFromTemplate(HR_CONFIG.TEMPLATE_ADVANCE_ID, "ADV_" + data.reqId, {
          "{req_id}": data.reqId,
          "{date}": Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy"),
          "{emp_name}": emp.name, "{emp_id}": data.empId, "{position}": emp.position,
          "{amount}": Number(amountOnly).toLocaleString(),
          "{reason}": "-", "{approver}": "Admin"
        });
        sheet.getRange(data.row, h.map['ลิงก์สลิปโอนเงิน (PDF)'] + 1).setValue(pdfUrl);
    }
  }
  return { success: true };
}

function hr_rejectItem(data) {
  var sheetName = (data.group === 'money') ? HR_CONFIG.SHEET_NAME.ADVANCE : HR_CONFIG.SHEET_NAME.LEAVE;
  var h = hr_getHeaderMap(sheetName);
  h.sheet.getRange(data.row, h.map['สถานะ'] + 1).setValue("ไม่อนุมัติ");
  return { success: true };
}

function hr_calculatePayrollPreview() {
  var empH = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.EMP);
  var advH = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.ADVANCE);
  
  var emps = empH.sheet.getDataRange().getValues().slice(1);
  var advs = advH.sheet.getDataRange().getValues().slice(1);
  var period = new Date().getDate() <= 15 ? "งวดกลางเดือน" : "งวดสิ้นเดือน";
  
  return emps.filter(function(e) {
    return e[empH.map['รหัสพนักงาน']] && e[empH.map['สถานะ']] === 'ทำงาน';
  }).map(function(e) {
    var rate = Number(e[empH.map['อัตราค่าจ้าง']]) || 0;
    var empId = e[empH.map['รหัสพนักงาน']];
    var type = e[empH.map['ประเภทค่าจ้าง']];
    
    // Logic คำนวณ (เปลี่ยนได้ตามต้องการ)
    var income = (type === 'รายเดือน') ? (rate / 2) : (rate * 15);
    
    var myAdv = advs.reduce(function(sum, r) {
      if (String(r[advH.map['รหัสพนักงาน']]) === String(empId) && r[advH.map['สถานะ']] === 'อนุมัติ') {
        return sum + Number(r[advH.map['จำนวนเงินที่ขอ']]);
      }
      return sum;
    }, 0);
    
    var oldDebt = Number(e[empH.map['หนี้คงค้าง']]) || 0;
    var net = income - myAdv - oldDebt;
    var newDebt = 0;
    
    if (net < 0) { newDebt = Math.abs(net); net = 0; }
    
    return {
      empId: empId, name: e[empH.map['ชื่อ-สกุล']],
      position: e[empH.map['ตำแหน่ง']], income: income,
      deductAdv: myAdv, deductDebt: oldDebt,
      net: net, newDebt: newDebt, period: period
    };
  });
}

function hr_confirmPayroll(list) {
  var payH = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.PAYROLL);
  var empH = hr_getHeaderMap(HR_CONFIG.SHEET_NAME.EMP);
  var batchId = "PAY-" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyMMdd");
  
  list.forEach(function(p) {
    var pdfUrl = "";
    if (HR_CONFIG.TEMPLATE_PAYROLL_ID) {
       pdfUrl = hr_createPdfFromTemplate(HR_CONFIG.TEMPLATE_PAYROLL_ID, "Slip_" + p.empId, {
         "{period_date}": p.period, "{emp_id}": p.empId, "{emp_name}": p.name,
         "{position}": p.position, "{income}": Number(p.income).toLocaleString(),
         "{deduction_advance}": Number(p.deductAdv).toLocaleString(),
         "{deduction_debt}": Number(p.deductDebt).toLocaleString(),
         "{net_total}": Number(p.net).toLocaleString(),
         "{debt_remain}": Number(p.newDebt).toLocaleString()
       });
    }
    
    var newRow = new Array(payH.headers.length).fill("");
    newRow[payH.map['รหัสรอบจ่าย']] = batchId;
    newRow[payH.map['วันที่ตัดรอบ']] = new Date();
    newRow[payH.map['รหัสพนักงาน']] = p.empId;
    newRow[payH.map['รายได้รวม']] = p.income;
    newRow[payH.map['หักเบิกล่วงหน้า']] = p.deductAdv;
    newRow[payH.map['หักหนี้เก่า']] = p.deductDebt;
    newRow[payH.map['ยอดสุทธิที่จ่าย']] = p.net;
    newRow[payH.map['ยอดหนี้ยกยอดไป']] = p.newDebt;
    newRow[payH.map['ลิงก์สลิปเงินเดือน (PDF)']] = pdfUrl;
    
    payH.sheet.appendRow(newRow);
    
    // อัปเดตหนี้
    var empData = empH.sheet.getDataRange().getValues();
    for (var i = 1; i < empData.length; i++) {
      if (String(empData[i][empH.map['รหัสพนักงาน']]) === String(p.empId)) {
        empH.sheet.getRange(i + 1, empH.map['หนี้คงค้าง'] + 1).setValue(p.newDebt);
        break;
      }
    }
  });
  return { success: true };
}

// ==========================================
// 🛠️ 5. HELPERS (ตัวช่วย)
// ==========================================

function hr_calculateDistance(lat1, lon1, lat2, lon2) {
  var R = 6371e3;
  var φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  var Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
  var a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function hr_sendLineNotify(msg) {
  var token = HR_CONFIG.LINE_TOKEN;
  if (token) {
    try {
      UrlFetchApp.fetch("https://notify-api.line.me/api/notify", {
        "method": "post",
        "headers": { "Authorization": "Bearer " + token },
        "payload": { "message": msg }
      });
    } catch(e) {}
  }
}

function main_getWeatherUpdate() {
  try {
    var lat = HR_CONFIG.FARM_LOCATION.lat;
    var lng = HR_CONFIG.FARM_LOCATION.lng;
    var response = UrlFetchApp.fetch("https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lng+"&current_weather=true");
    var data = JSON.parse(response.getContentText());
    var temp = data.current_weather.temperature;
    var wind = data.current_weather.windspeed;
    var wcode = data.current_weather.weathercode;
    var icon = (wcode <= 3) ? "☀️" : ((wcode <= 60) ? "☁️" : "🌧️");
    return `📢 สวัสดีครับ! วันนี้ ${Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy")} | ${icon} อุณหภูมิ: ${temp}°C | 💨 ลม: ${wind} km/h | นิพนธ์ฟาร์มยินดีต้อนรับ 🐷`;
  } catch(e) { return "📢 นิพนธ์ฟาร์ม - ระบบจัดการมาตรฐาน"; }
}

function hr_createPdfFromTemplate(templateId, fileName, replacements) {
  try {
    var folder = DriveApp.getFolderById(HR_CONFIG.DRIVE_FOLDER_ID);
    var template = DriveApp.getFileById(templateId);
    var newFile = template.makeCopy("TEMP_" + fileName);
    var doc = DocumentApp.openById(newFile.getId());
    var body = doc.getBody();
    for (var key in replacements) {
      body.replaceText(key, String(replacements[key]));
    }
    doc.saveAndClose();
    var pdfBlob = newFile.getAs(MimeType.PDF);
    var pdfFile = folder.createFile(pdfBlob).setName(fileName + ".pdf");
    newFile.setTrashed(true);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return pdfFile.getUrl();
  } catch(e) { return ""; }
}
