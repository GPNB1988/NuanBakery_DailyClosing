// ============================================================
//  NUAN BAKERY — ระบบส่งยอดขาย
//  Google Apps Script Backend  |  Sprint 2
// ============================================================
//
//  HOW TO DEPLOY
//  ─────────────
//  1. Go to script.google.com → New project
//  2. Paste this file as Code.gs
//  3. Run setup() once (Menu → Run → setup)
//  4. Deploy → New deployment → Web app
//        Execute as : Me
//        Who can access : Anyone
//  5. Copy the /exec URL into ระบบส่งยอดขาย.dc.html (GAS_URL)
//
//  OPTIONAL: Google Drive upload
//  ─────────────────────────────
//  1. Create a folder in Google Drive named "Nuan Bakery - ยอดขาย"
//  2. Copy its ID from the URL (the long string after /folders/)
//  3. Open the Config sheet → add row: DriveFolderID | <paste ID>
//
//  SHEETS
//  ──────
//  Branches     : BranchID | BranchCode | BranchName | Active | CreatedAt
//  Users        : UserID | Username | PasswordHash | Name | Role | BranchCode | Active | CreatedAt
//  Sessions     : Token | UserID | Username | Name | Role | BranchCode | BranchName | CreatedAt | ExpiresAt
//  Reports      : ReportID | BranchCode | BranchName | ReportDate | TotalSales | TotalIncome |
//                 TotalExpense | TotalCancelled | Remaining | ChangeFloat | ManualSales |
//                 IncomeItemsJSON | ExpenseItemsJSON | CancelledBillsJSON |
//                 AttachmentsJSON | SalesDocsJSON | DriveFolderUrl |
//                 Status | SubmittedBy | SubmittedAt | UpdatedAt
//  Deposits     : DepositID | BranchCode | BranchName | DepositDate | Amount | Bank |
//                 BankLabel | Note | DepositType | SubmittedBy | SubmittedAt | Status
//  EditRequests : RequestID | ReportID | BranchCode | BranchName | ReportDate |
//                 RequestedBy | Reason | Status | RequestedAt | ReviewedAt | ReviewedBy
//  Config       : Key | Value
// ============================================================

// ── Sheet names ───────────────────────────────────────────────
var SHEET_BRANCHES     = 'Branches';
var SHEET_USERS        = 'Users';
var SHEET_SESSIONS     = 'Sessions';
var SHEET_REPORTS      = 'Reports';
var SHEET_DEPOSITS     = 'Deposits';
var SHEET_EDIT_REQUESTS = 'EditRequests';
var SHEET_CONFIG       = 'Config';

var SESSION_HOURS = 8;

// ── Column indices — Branches ─────────────────────────────────
var B_ID=0,B_CODE=1,B_NAME=2,B_ACTIVE=3,B_CREATED=4;

// ── Column indices — Users ────────────────────────────────────
var U_ID=0,U_USER=1,U_HASH=2,U_NAME=3,U_ROLE=4,U_BRANCH=5,U_ACTIVE=6,U_CREATED=7;

// ── Column indices — Sessions ─────────────────────────────────
var S_TOKEN=0,S_UID=1,S_USER=2,S_NAME=3,S_ROLE=4,S_BRANCH=5,S_BNAME=6,S_CREATED=7,S_EXPIRES=8;

// ── Column indices — Reports ──────────────────────────────────
var R_ID=0,R_BRANCH=1,R_BNAME=2,R_DATE=3,R_SALES=4,R_INCOME=5,R_EXPENSE=6,
    R_CANCELLED=7,R_REMAINING=8,R_CHANGEFLOAT=9,R_MANUALSALES=10,
    R_INCOME_JSON=11,R_EXPENSE_JSON=12,R_CANCEL_JSON=13,
    R_ATTACH_JSON=14,R_DOCS_JSON=15,R_DRIVE_URL=16,
    R_STATUS=17,R_BY=18,R_AT=19,R_UPDATED=20;

// ── Column indices — Deposits ─────────────────────────────────
var D_ID=0,D_BRANCH=1,D_BNAME=2,D_DATE=3,D_AMOUNT=4,D_BANK=5,D_BANKLABEL=6,
    D_NOTE=7,D_TYPE=8,D_BY=9,D_AT=10,D_STATUS=11;

// ── Column indices — EditRequests ─────────────────────────────
var ER_ID=0,ER_REPORTID=1,ER_BRANCH=2,ER_BNAME=3,ER_REPORTDATE=4,
    ER_BY=5,ER_REASON=6,ER_STATUS=7,ER_AT=8,ER_REVIEWED_AT=9,ER_REVIEWED_BY=10;

// ── Sheet headers ─────────────────────────────────────────────
var BRANCH_HEADERS  = ['BranchID','BranchCode','BranchName','Active','CreatedAt'];
var USER_HEADERS    = ['UserID','Username','PasswordHash','Name','Role','BranchCode','Active','CreatedAt'];
var SESSION_HEADERS = ['Token','UserID','Username','Name','Role','BranchCode','BranchName','CreatedAt','ExpiresAt'];
var REPORT_HEADERS  = [
  'ReportID','BranchCode','BranchName','ReportDate','TotalSales','TotalIncome',
  'TotalExpense','TotalCancelled','Remaining','ChangeFloat','ManualSales',
  'IncomeItemsJSON','ExpenseItemsJSON','CancelledBillsJSON',
  'AttachmentsJSON','SalesDocsJSON','DriveFolderUrl',
  'Status','SubmittedBy','SubmittedAt','UpdatedAt'
];
var DEPOSIT_HEADERS = [
  'DepositID','BranchCode','BranchName','DepositDate','Amount','Bank',
  'BankLabel','Note','DepositType','SubmittedBy','SubmittedAt','Status'
];
var EDIT_REQ_HEADERS = [
  'RequestID','ReportID','BranchCode','BranchName','ReportDate',
  'RequestedBy','Reason','Status','RequestedAt','ReviewedAt','ReviewedBy'
];
var CONFIG_HEADERS = ['Key','Value'];

var GLOBAL_ROLES = ['admin','hq'];


// ============================================================
//  HTTP ENTRY POINTS
// ============================================================

function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var action = data.action;
    var result;

    switch (action) {
      // Auth
      case 'login':            result = handleLogin(data);            break;
      case 'logout':           result = handleLogout(data);           break;
      case 'validateSession':  result = handleValidateSession(data);  break;
      // Branches
      case 'getBranches':      result = handleGetBranches();          break;
      // Reports
      case 'submitReport':     result = handleSubmitReport(data);     break;
      case 'getReports':       result = handleGetReports(data);       break;
      // Deposits
      case 'submitDeposit':    result = handleSubmitDeposit(data);    break;
      case 'getDeposits':      result = handleGetDeposits(data);      break;
      // Edit Requests
      case 'submitEditRequest':   result = handleSubmitEditRequest(data);   break;
      case 'getEditRequests':     result = handleGetEditRequests(data);     break;
      case 'approveEditRequest':  result = handleApproveEditRequest(data);  break;
      case 'rejectEditRequest':   result = handleRejectEditRequest(data);   break;
      // File upload
      case 'uploadFile':       result = handleUploadFile(data);       break;
      default:
        result = { ok: false, error: 'Unknown action: ' + action };
    }
    return respond(result);
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

function doGet(e) {
  return respond({ ok: true, status: 'Nuan Bakery API running', version: '2.0' });
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
//  AUTH HANDLERS
// ============================================================

function handleLogin(data) {
  var username   = String(data.username  || '').trim().toLowerCase();
  var password   = String(data.password  || '');
  var branchCode = String(data.branchCode || '');

  if (!username || !password) return { ok: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };

  var user = findUser(username);
  if (!user) return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  if (!user.active) return { ok: false, error: 'บัญชีผู้ใช้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };

  if (hashPassword(password) !== user.passwordHash) return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };

  var isGlobal = GLOBAL_ROLES.indexOf(user.role) !== -1;
  if (!isGlobal && branchCode !== user.branchCode) return { ok: false, error: 'ผู้ใช้นี้ไม่ได้รับสิทธิ์สำหรับสาขาที่เลือก' };

  var branchName = isGlobal ? 'ทุกสาขา' : (function() {
    var br = findBranch(user.branchCode);
    return br ? br.branchName : user.branchCode;
  })();

  var token   = Utilities.getUuid();
  var now     = new Date();
  var expires = new Date(now.getTime() + SESSION_HOURS * 3600000);
  saveSession(token, user, branchName, expires);

  if (Math.random() < 0.1) { try { cleanupExpiredSessions(); } catch(e){} }

  return {
    ok: true, token: token,
    user: {
      userId: user.userId, username: user.username, name: user.name,
      role: user.role,
      branchCode: isGlobal ? 'ALL' : user.branchCode,
      branchName: branchName,
    }
  };
}

function handleLogout(data) {
  var token = String(data.token || '');
  if (token) deleteSession(token);
  return { ok: true };
}

function handleValidateSession(data) {
  var token = String(data.token || '');
  if (!token) return { ok: false, error: 'No token' };
  var session = findSession(token);
  if (!session) return { ok: false, error: 'Session not found' };
  var now = new Date();
  if (now > new Date(session.expiresAt)) { deleteSession(token); return { ok: false, error: 'Session expired' }; }
  extendSession(token, new Date(now.getTime() + SESSION_HOURS * 3600000));
  return { ok: true, user: { userId:session.userId, username:session.username, name:session.name, role:session.role, branchCode:session.branchCode, branchName:session.branchName } };
}

function handleGetBranches() {
  var sheet = getOrCreateSheet(SHEET_BRANCHES, BRANCH_HEADERS);
  var data  = sheet.getDataRange().getValues();
  var branches = [];
  for (var i = 1; i < data.length; i++) {
    var active = data[i][B_ACTIVE];
    if (active === true || active === 'TRUE' || active === 'true' || active === 1) {
      branches.push({ branchId:String(data[i][B_ID]), branchCode:String(data[i][B_CODE]), branchName:String(data[i][B_NAME]) });
    }
  }
  return { ok: true, branches: branches };
}


// ============================================================
//  REPORT HANDLERS
// ============================================================

function handleSubmitReport(data) {
  var report = data.report || {};
  var branchCode = String(report.branch || '');
  var reportDate = String(report.date || '');

  if (!branchCode || !reportDate) return { ok: false, error: 'ข้อมูลไม่ครบถ้วน' };
  if ((report.totalIncome || 0) <= 0) return { ok: false, error: 'กรุณากรอกยอดขายอย่างน้อย 1 ช่องทาง' };

  // Duplicate check
  var sheet = getOrCreateSheet(SHEET_REPORTS, REPORT_HEADERS);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][R_BRANCH]) === branchCode && String(rows[i][R_DATE]) === reportDate) {
      return { ok: false, error: 'มีรายงานสำหรับวันที่ ' + reportDate + ' แล้ว ไม่สามารถส่งซ้ำได้' };
    }
  }

  var reportId = Utilities.getUuid();
  var now      = new Date().toISOString();

  sheet.appendRow([
    reportId,
    branchCode,
    String(report.branchName || ''),
    reportDate,
    Number(report.totalSales   || 0),
    Number(report.totalIncome  || 0),
    Number(report.totalExpense || 0),
    Number(report.totalCancelled || 0),
    Number(report.remaining    || 0),
    Number(report.changeFloat  || 0),
    Number(report.manualSales  || 0),
    JSON.stringify(report.incomeItems    || []),
    JSON.stringify(report.expenseItems   || []),
    JSON.stringify(report.cancelledBills || []),
    JSON.stringify(report.attachments    || []),
    JSON.stringify(report.salesDocs      || []),
    String(report.driveFolderUrl || ''),
    'submitted',
    String(report.submittedBy || ''),
    String(report.submittedAt || now),
    now,
  ]);

  return { ok: true, reportId: reportId };
}

function handleGetReports(data) {
  var branchCode = String(data.branchCode || 'ALL');
  var dateFrom   = String(data.dateFrom   || '');
  var dateTo     = String(data.dateTo     || '');
  var limit      = parseInt(data.limit)   || 200;

  var sheet = getOrCreateSheet(SHEET_REPORTS, REPORT_HEADERS);
  var rows  = sheet.getDataRange().getValues();
  var reports = [];

  for (var i = rows.length - 1; i >= 1; i--) {
    var row = rows[i];
    var rBranch = String(row[R_BRANCH]);
    var rDate   = String(row[R_DATE]);

    if (branchCode !== 'ALL' && rBranch !== branchCode) continue;
    if (dateFrom && rDate < dateFrom) continue;
    if (dateTo   && rDate > dateTo)   continue;

    reports.push(rowToReport(row));
    if (reports.length >= limit) break;
  }

  return { ok: true, reports: reports };
}

function rowToReport(row) {
  return {
    id:            String(row[R_ID]),
    branch:        String(row[R_BRANCH]),
    branchName:    String(row[R_BNAME]),
    date:          String(row[R_DATE]),
    totalSales:    Number(row[R_SALES])      || 0,
    totalIncome:   Number(row[R_INCOME])     || 0,
    totalExpense:  Number(row[R_EXPENSE])    || 0,
    totalCancelled:Number(row[R_CANCELLED])  || 0,
    remaining:     Number(row[R_REMAINING])  || 0,
    changeFloat:   Number(row[R_CHANGEFLOAT])|| 0,
    manualSales:   Number(row[R_MANUALSALES])|| 0,
    incomeItems:    safeJsonParse(row[R_INCOME_JSON],  []),
    expenseItems:   safeJsonParse(row[R_EXPENSE_JSON], []),
    cancelledBills: safeJsonParse(row[R_CANCEL_JSON],  []),
    attachments:    safeJsonParse(row[R_ATTACH_JSON],  []),
    salesDocs:      safeJsonParse(row[R_DOCS_JSON],    []),
    driveFolderUrl: String(row[R_DRIVE_URL] || ''),
    status:         String(row[R_STATUS]    || 'submitted'),
    submittedBy:    String(row[R_BY]        || ''),
    submittedAt:    String(row[R_AT]        || ''),
  };
}


// ============================================================
//  DEPOSIT HANDLERS
// ============================================================

function handleSubmitDeposit(data) {
  var dep = data.deposit || {};
  if (!dep.amount || Number(dep.amount) <= 0) return { ok: false, error: 'กรุณากรอกจำนวนเงิน' };
  if (!dep.branchCode) return { ok: false, error: 'ไม่พบข้อมูลสาขา' };

  var sheet    = getOrCreateSheet(SHEET_DEPOSITS, DEPOSIT_HEADERS);
  var depositId = Utilities.getUuid();
  var now       = new Date().toISOString();
  var status    = dep.depType === 'refund' ? 'pending' : 'confirmed';

  sheet.appendRow([
    depositId,
    String(dep.branchCode  || ''),
    String(dep.branchName  || ''),
    String(dep.date        || now.slice(0,10)),
    Number(dep.amount      || 0),
    String(dep.bank        || ''),
    String(dep.bankLabel   || ''),
    String(dep.note        || ''),
    String(dep.depType     || 'deposit'),
    String(dep.submittedBy || ''),
    now,
    status,
  ]);

  return { ok: true, depositId: depositId, status: status };
}

function handleGetDeposits(data) {
  var branchCode = String(data.branchCode || 'ALL');
  var dateFrom   = String(data.dateFrom   || '');
  var dateTo     = String(data.dateTo     || '');
  var limit      = parseInt(data.limit)   || 100;

  var sheet   = getOrCreateSheet(SHEET_DEPOSITS, DEPOSIT_HEADERS);
  var rows    = sheet.getDataRange().getValues();
  var deposits = [], refunds = [];

  for (var i = rows.length - 1; i >= 1; i--) {
    var row = rows[i];
    var rBranch = String(row[D_BRANCH]);
    var rDate   = String(row[D_DATE]);

    if (branchCode !== 'ALL' && rBranch !== branchCode) continue;
    if (dateFrom && rDate < dateFrom) continue;
    if (dateTo   && rDate > dateTo)   continue;

    var dep = {
      id:          String(row[D_ID]),
      branch:      rBranch,
      branchName:  String(row[D_BNAME]),
      date:        rDate,
      amount:      Number(row[D_AMOUNT]) || 0,
      bank:        String(row[D_BANK]),
      bankLabel:   String(row[D_BANKLABEL]),
      note:        String(row[D_NOTE]),
      depType:     String(row[D_TYPE]),
      by:          String(row[D_BY]),
      at:          String(row[D_AT]),
      status:      String(row[D_STATUS]),
    };

    if (dep.depType === 'refund') { if (refunds.length < limit) refunds.push(dep); }
    else                          { if (deposits.length < limit) deposits.push(dep); }
  }

  return { ok: true, deposits: deposits, refundRequests: refunds };
}

function handleUpdateDepositStatus(data) {
  var depositId = String(data.depositId || '');
  var newStatus = String(data.status    || '');
  if (!depositId || !newStatus) return { ok: false, error: 'ข้อมูลไม่ครบ' };

  var sheet = getOrCreateSheet(SHEET_DEPOSITS, DEPOSIT_HEADERS);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][D_ID]) === depositId) {
      sheet.getRange(i + 1, D_STATUS + 1).setValue(newStatus);
      return { ok: true };
    }
  }
  return { ok: false, error: 'ไม่พบรายการ' };
}


// ============================================================
//  EDIT REQUEST HANDLERS
// ============================================================

function handleSubmitEditRequest(data) {
  var req = data.request || {};
  if (!req.reason || !req.reason.trim()) return { ok: false, error: 'กรุณากรอกเหตุผลในการขอแก้ไข' };

  var sheet = getOrCreateSheet(SHEET_EDIT_REQUESTS, EDIT_REQ_HEADERS);
  var reqId = Utilities.getUuid();
  var now   = new Date().toISOString();

  sheet.appendRow([
    reqId,
    String(req.reportId   || ''),
    String(req.branchCode || ''),
    String(req.branchName || ''),
    String(req.reportDate || ''),
    String(req.requestedBy|| ''),
    String(req.reason     || ''),
    'pending',
    now,
    '',
    '',
  ]);

  return { ok: true, requestId: reqId };
}

function handleGetEditRequests(data) {
  var branchCode = String(data.branchCode || 'ALL');
  var sheet  = getOrCreateSheet(SHEET_EDIT_REQUESTS, EDIT_REQ_HEADERS);
  var rows   = sheet.getDataRange().getValues();
  var result = [];

  for (var i = rows.length - 1; i >= 1; i--) {
    var row = rows[i];
    if (branchCode !== 'ALL' && String(row[ER_BRANCH]) !== branchCode) continue;
    result.push({
      id:           String(row[ER_ID]),
      reportId:     String(row[ER_REPORTID]),
      branch:       String(row[ER_BRANCH]),
      branchName:   String(row[ER_BNAME]),
      reportDate:   String(row[ER_REPORTDATE]),
      requestedBy:  String(row[ER_BY]),
      reason:       String(row[ER_REASON]),
      status:       String(row[ER_STATUS]),
      requestedAt:  String(row[ER_AT]),
    });
  }
  return { ok: true, editRequests: result };
}

function handleApproveEditRequest(data) { return updateEditRequestStatus(data.requestId, 'approved', data.reviewedBy); }
function handleRejectEditRequest(data)  { return updateEditRequestStatus(data.requestId, 'rejected', data.reviewedBy); }

function updateEditRequestStatus(reqId, status, reviewedBy) {
  var sheet = getOrCreateSheet(SHEET_EDIT_REQUESTS, EDIT_REQ_HEADERS);
  var rows  = sheet.getDataRange().getValues();
  var now   = new Date().toISOString();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][ER_ID]) === String(reqId)) {
      sheet.getRange(i+1, ER_STATUS+1).setValue(status);
      sheet.getRange(i+1, ER_REVIEWED_AT+1).setValue(now);
      sheet.getRange(i+1, ER_REVIEWED_BY+1).setValue(String(reviewedBy||''));
      return { ok: true };
    }
  }
  return { ok: false, error: 'ไม่พบคำขอ' };
}


// ============================================================
//  GOOGLE DRIVE UPLOAD HANDLER
// ============================================================

function handleUploadFile(data) {
  var rootFolderId = getConfig('DriveFolderID');
  if (!rootFolderId) {
    return { ok: false, error: 'กรุณาตั้งค่า DriveFolderID ใน Config sheet ก่อนอัปโหลดไฟล์' };
  }

  var fileName   = String(data.fileName   || 'file');
  var mimeType   = String(data.mimeType   || 'application/octet-stream');
  var base64Data = String(data.base64Data || '');
  var folderType = String(data.folder     || 'slips');  // 'slips' | 'docs'
  var branchCode = String(data.branchCode || 'general');
  var reportDate = String(data.reportDate || new Date().toISOString().slice(0,10));

  if (!base64Data) return { ok: false, error: 'ไม่มีข้อมูลไฟล์' };

  // Strip data-URL prefix
  var base64 = base64Data.replace(/^data:[^;]+;base64,/, '');

  try {
    var bytes = Utilities.base64Decode(base64);
    var blob  = Utilities.newBlob(bytes, mimeType, fileName);

    // Folder structure: Root / Type / YYYY-MM / BranchCode
    var yearMonth   = reportDate.slice(0, 7);
    var folderLabel = folderType === 'slips' ? 'สลิปโอนเงิน' : 'เอกสารขาย';

    var rootFolder   = DriveApp.getFolderById(rootFolderId);
    var typeFolder   = getOrCreateSubfolder(rootFolder, folderLabel);
    var monthFolder  = getOrCreateSubfolder(typeFolder,  yearMonth);
    var branchFolder = getOrCreateSubfolder(monthFolder, branchCode);

    var file = branchFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      ok:       true,
      driveUrl: file.getUrl(),
      driveId:  file.getId(),
      fileName: fileName,
    };
  } catch (err) {
    return { ok: false, error: 'อัปโหลดไม่สำเร็จ: ' + err.message };
  }
}

function getOrCreateSubfolder(parentFolder, name) {
  var folders = parentFolder.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parentFolder.createFolder(name);
}


// ============================================================
//  CONFIG HELPERS
// ============================================================

function getConfig(key) {
  try {
    var sheet = getOrCreateSheet(SHEET_CONFIG, CONFIG_HEADERS);
    var rows  = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === key) return String(rows[i][1]);
    }
  } catch(e) {}
  return '';
}

function setConfig(key, value) {
  var sheet = getOrCreateSheet(SHEET_CONFIG, CONFIG_HEADERS);
  var rows  = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}


// ============================================================
//  USER HELPERS
// ============================================================

function findUser(username) {
  var sheet = getOrCreateSheet(SHEET_USERS, USER_HEADERS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[U_USER]).trim().toLowerCase() === username) {
      var active = row[U_ACTIVE];
      return {
        userId: String(row[U_ID]), username: String(row[U_USER]),
        passwordHash: String(row[U_HASH]), name: String(row[U_NAME]),
        role: String(row[U_ROLE]), branchCode: String(row[U_BRANCH]),
        active: (active===true||active==='TRUE'||active==='true'||active===1||active==='1'),
      };
    }
  }
  return null;
}

function findBranch(branchCode) {
  var sheet = getOrCreateSheet(SHEET_BRANCHES, BRANCH_HEADERS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][B_CODE]) === branchCode) {
      return { branchId:String(data[i][B_ID]), branchCode:String(data[i][B_CODE]), branchName:String(data[i][B_NAME]) };
    }
  }
  return null;
}

function hashPassword(password) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  return bytes.map(function(b){ return ('0'+(b&0xFF).toString(16)).slice(-2); }).join('');
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(String(str || '')) || fallback; } catch(e) { return fallback; }
}


// ============================================================
//  SESSION HELPERS
// ============================================================

function saveSession(token, user, branchName, expires) {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  sheet.appendRow([token, user.userId, user.username, user.name, user.role, user.branchCode, branchName, new Date().toISOString(), expires.toISOString()]);
}

function findSession(token) {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[S_TOKEN]) === token) {
      return { token:String(row[S_TOKEN]), userId:String(row[S_UID]), username:String(row[S_USER]), name:String(row[S_NAME]), role:String(row[S_ROLE]), branchCode:String(row[S_BRANCH]), branchName:String(row[S_BNAME]), createdAt:String(row[S_CREATED]), expiresAt:String(row[S_EXPIRES]) };
    }
  }
  return null;
}

function deleteSession(token) {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length-1; i >= 1; i--) {
    if (String(data[i][S_TOKEN]) === token) { sheet.deleteRow(i+1); return; }
  }
}

function extendSession(token, newExpires) {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][S_TOKEN]) === token) { sheet.getRange(i+1,S_EXPIRES+1).setValue(newExpires.toISOString()); return; }
  }
}

function cleanupExpiredSessions() {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();
  for (var i = data.length-1; i >= 1; i--) {
    try { var exp=new Date(String(data[i][S_EXPIRES])); if(isNaN(exp.getTime())||now>exp) sheet.deleteRow(i+1); } catch(e){}
  }
}


// ============================================================
//  SHEET HELPERS
// ============================================================

function getOrCreateSheet(name, headers) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
  }
  return sheet;
}


// ============================================================
//  SETUP  (run once after deployment)
// ============================================================

function setup() {
  Logger.log('=== Nuan Bakery Setup v2 ===');

  var branchSheet = getOrCreateSheet(SHEET_BRANCHES,      BRANCH_HEADERS);
  var userSheet   = getOrCreateSheet(SHEET_USERS,         USER_HEADERS);
  getOrCreateSheet(SHEET_SESSIONS,     SESSION_HEADERS);
  getOrCreateSheet(SHEET_REPORTS,      REPORT_HEADERS);
  getOrCreateSheet(SHEET_DEPOSITS,     DEPOSIT_HEADERS);
  getOrCreateSheet(SHEET_EDIT_REQUESTS,EDIT_REQ_HEADERS);
  getOrCreateSheet(SHEET_CONFIG,       CONFIG_HEADERS);

  seedBranches(branchSheet);
  seedUsers(userSheet);

  Logger.log('=== Setup complete ===');
  Logger.log('OPTIONAL: Add DriveFolderID in the Config sheet for Google Drive uploads.');
}

function seedBranches(sheet) {
  if (sheet.getLastRow() > 1) { Logger.log('Branches: data exists — skipped.'); return; }
  var branches = [
    ['89','89 พลาซ่า'],['RC','รวมโชค'],['ABJ','อบจ. เชียงใหม่'],
    ['CTF','เซ็นทรัลเฟส เชียงใหม่'],['APG','เซ็นทรัลแอร์พอร์ต เชียงใหม่'],
    ['BCDJ','บิ๊กซีดอนจั่น'],['BCEX','บิ๊กซีเอ็กตร้า'],
    ['BCHD','บิ๊กซีหางดง'],['BCLP','บิ๊กซีลำพูน'],
    ['HNKP','รพ. นครพิงค์'],['HSD','รพ. สวนดอก'],
    ['HCR','รพ. เชียงราย'],['HLP','รพ. ลำปาง'],['WL','วังหลัง'],
  ];
  var now = new Date().toISOString();
  branches.forEach(function(b){ sheet.appendRow([Utilities.getUuid(),b[0],b[1],true,now]); });
  Logger.log('Branches: seeded ' + branches.length);
}

function seedUsers(sheet) {
  if (sheet.getLastRow() > 1) { Logger.log('Users: data exists — skipped.'); return; }
  var now   = new Date().toISOString();
  var users = [
    ['admin','admin','ผู้ดูแลระบบ','admin','ALL'],
    ['rc001','1234','สมใจ รักดี','manager','RC'],
    ['rc002','1234','วิไล สุขสัน','assistant','RC'],
    ['rc003','1234','มานี รอดชีวิต','staff','RC'],
    ['ctf001','1234','ประยุทธ์ สบาย','manager','CTF'],
    ['abj001','1234','สาวิตรี ใจดี','manager','ABJ'],
    ['bcdj001','1234','บุญเรือง สว่าง','manager','BCDJ'],
    ['wl001','1234','นิรันดร์ ยั่งยืน','manager','WL'],
    ['audit','1234','ตรวจสอบ การเงิน','hq','ALL'],
  ];
  users.forEach(function(u){
    sheet.appendRow([Utilities.getUuid(),u[0],hashPassword(u[1]),u[2],u[3],u[4],true,now]);
  });
  Logger.log('Users: seeded ' + users.length);
}
