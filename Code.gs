// ============================================================
//  NUAN BAKERY — ระบบส่งยอดขาย
//  Google Apps Script Backend  |  Sprint 1: Auth + Sessions
// ============================================================
//
//  HOW TO DEPLOY
//  ─────────────
//  1. Go to script.google.com → New project
//  2. Paste this file as Code.gs
//  3. Run setup() once (Menu → Run → setup)
//     • Creates Branches, Users, Sessions sheets
//     • Seeds 14 branches and 9 default users
//     • Never overwrites existing data
//  4. Deploy → New deployment → Web app
//        Execute as : Me
//        Who can access : Anyone
//  5. Copy the /exec URL
//  6. Paste it into ระบบส่งยอดขาย.dc.html  (GAS_URL constant)
//
//  ROLES (stored in Users sheet)
//  ─────────────────────────────
//  admin     : Full access, all branches
//  hq        : HQ read access, all branches
//  manager   : Branch manager (can submit deposits)
//  assistant : Assistant manager
//  staff     : Standard staff
//
//  SHEETS
//  ──────
//  Branches  : BranchID | BranchCode | BranchName | Active | CreatedAt
//  Users     : UserID | Username | PasswordHash | Name | Role | BranchCode | Active | CreatedAt
//  Sessions  : Token | UserID | Username | Name | Role | BranchCode | BranchName | CreatedAt | ExpiresAt
// ============================================================

// ── Sheet names ───────────────────────────────────────────────
var SHEET_BRANCHES = 'Branches';
var SHEET_USERS    = 'Users';
var SHEET_SESSIONS = 'Sessions';

// ── Session lifetime (hours) ──────────────────────────────────
var SESSION_HOURS = 8;

// ── Column indices — Branches ─────────────────────────────────
var B_ID = 0, B_CODE = 1, B_NAME = 2, B_ACTIVE = 3, B_CREATED = 4;

// ── Column indices — Users ────────────────────────────────────
var U_ID = 0, U_USER = 1, U_HASH = 2, U_NAME = 3,
    U_ROLE = 4, U_BRANCH = 5, U_ACTIVE = 6, U_CREATED = 7;

// ── Column indices — Sessions ─────────────────────────────────
var S_TOKEN = 0, S_UID = 1, S_USER = 2, S_NAME = 3,
    S_ROLE = 4, S_BRANCH = 5, S_BNAME = 6, S_CREATED = 7, S_EXPIRES = 8;

// ── Sheet headers ─────────────────────────────────────────────
var BRANCH_HEADERS  = ['BranchID','BranchCode','BranchName','Active','CreatedAt'];
var USER_HEADERS    = ['UserID','Username','PasswordHash','Name','Role','BranchCode','Active','CreatedAt'];
var SESSION_HEADERS = ['Token','UserID','Username','Name','Role','BranchCode','BranchName','CreatedAt','ExpiresAt'];

// ── Roles allowed to access all branches ─────────────────────
var GLOBAL_ROLES = ['admin', 'hq'];


// ============================================================
//  HTTP ENTRY POINTS
// ============================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var result;

    switch (action) {
      case 'login':           result = handleLogin(data);           break;
      case 'logout':          result = handleLogout(data);          break;
      case 'validateSession': result = handleValidateSession(data); break;
      case 'getBranches':     result = handleGetBranches();         break;
      default:
        result = { ok: false, error: 'Unknown action: ' + action };
    }
    return respond(result);
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

function doGet(e) {
  return respond({ ok: true, status: 'Nuan Bakery API running', version: '1.0' });
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
//  ACTION HANDLERS
// ============================================================

function handleLogin(data) {
  var username   = String(data.username  || '').trim().toLowerCase();
  var password   = String(data.password  || '');
  var branchCode = String(data.branchCode || '');

  if (!username || !password) {
    return { ok: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
  }

  var user = findUser(username);
  if (!user) {
    return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }
  if (!user.active) {
    return { ok: false, error: 'บัญชีผู้ใช้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
  }

  var hash = hashPassword(password);
  if (hash !== user.passwordHash) {
    return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }

  // Non-global roles must log in to their assigned branch
  var isGlobal = GLOBAL_ROLES.indexOf(user.role) !== -1;
  if (!isGlobal && branchCode !== user.branchCode) {
    return { ok: false, error: 'ผู้ใช้นี้ไม่ได้รับสิทธิ์สำหรับสาขาที่เลือก' };
  }

  // Resolve branch name
  var branchName;
  if (isGlobal) {
    branchName = 'ทุกสาขา';
  } else {
    var branch = findBranch(user.branchCode);
    branchName = branch ? branch.branchName : user.branchCode;
  }

  // Create session token (UUID v4)
  var token   = Utilities.getUuid();
  var now     = new Date();
  var expires = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000);
  saveSession(token, user, branchName, expires);

  // Periodically clean up expired sessions (~10 % of logins)
  if (Math.random() < 0.1) {
    try { cleanupExpiredSessions(); } catch (e) { /* non-fatal */ }
  }

  return {
    ok: true,
    token: token,
    user: {
      userId:     user.userId,
      username:   user.username,
      name:       user.name,
      role:       user.role,
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
  if (!token) return { ok: false, error: 'No token provided' };

  var session = findSession(token);
  if (!session) return { ok: false, error: 'Session not found' };

  var now     = new Date();
  var expires = new Date(session.expiresAt);
  if (isNaN(expires.getTime()) || now > expires) {
    deleteSession(token);
    return { ok: false, error: 'Session expired' };
  }

  // Slide the expiry window on each valid check
  extendSession(token, new Date(now.getTime() + SESSION_HOURS * 3600 * 1000));

  return {
    ok: true,
    user: {
      userId:     session.userId,
      username:   session.username,
      name:       session.name,
      role:       session.role,
      branchCode: session.branchCode,
      branchName: session.branchName,
    }
  };
}

function handleGetBranches() {
  var sheet  = getOrCreateSheet(SHEET_BRANCHES, BRANCH_HEADERS);
  var data   = sheet.getDataRange().getValues();
  var branches = [];

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var active = row[B_ACTIVE];
    var isActive = (active === true || active === 'TRUE' ||
                    active === 'true' || active === 1    || active === '1');
    if (isActive) {
      branches.push({
        branchId:   String(row[B_ID]),
        branchCode: String(row[B_CODE]),
        branchName: String(row[B_NAME]),
      });
    }
  }
  return { ok: true, branches: branches };
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
        userId:       String(row[U_ID]),
        username:     String(row[U_USER]),
        passwordHash: String(row[U_HASH]),
        name:         String(row[U_NAME]),
        role:         String(row[U_ROLE]),
        branchCode:   String(row[U_BRANCH]),
        active: (active === true || active === 'TRUE' ||
                 active === 'true' || active === 1   || active === '1'),
      };
    }
  }
  return null;
}

function findBranch(branchCode) {
  var sheet = getOrCreateSheet(SHEET_BRANCHES, BRANCH_HEADERS);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[B_CODE]) === branchCode) {
      return {
        branchId:   String(row[B_ID]),
        branchCode: String(row[B_CODE]),
        branchName: String(row[B_NAME]),
      };
    }
  }
  return null;
}

function hashPassword(password) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}


// ============================================================
//  SESSION HELPERS
// ============================================================

function saveSession(token, user, branchName, expires) {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  sheet.appendRow([
    token,
    user.userId,
    user.username,
    user.name,
    user.role,
    user.branchCode,
    branchName,
    new Date().toISOString(),
    expires.toISOString(),
  ]);
}

function findSession(token) {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[S_TOKEN]) === token) {
      return {
        token:      String(row[S_TOKEN]),
        userId:     String(row[S_UID]),
        username:   String(row[S_USER]),
        name:       String(row[S_NAME]),
        role:       String(row[S_ROLE]),
        branchCode: String(row[S_BRANCH]),
        branchName: String(row[S_BNAME]),
        createdAt:  String(row[S_CREATED]),
        expiresAt:  String(row[S_EXPIRES]),
      };
    }
  }
  return null;
}

function deleteSession(token) {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  var data  = sheet.getDataRange().getValues();

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][S_TOKEN]) === token) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function extendSession(token, newExpires) {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][S_TOKEN]) === token) {
      sheet.getRange(i + 1, S_EXPIRES + 1).setValue(newExpires.toISOString());
      return;
    }
  }
}

function cleanupExpiredSessions() {
  var sheet = getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();

  // Iterate bottom-to-top so row deletions don't shift indices
  for (var i = data.length - 1; i >= 1; i--) {
    try {
      var expires = new Date(String(data[i][S_EXPIRES]));
      if (isNaN(expires.getTime()) || now > expires) {
        sheet.deleteRow(i + 1);
      }
    } catch (e) { /* skip malformed rows */ }
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
    sheet.getRange(1, 1, 1, headers.length)
         .setFontWeight('bold')
         .setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
  }
  return sheet;
}


// ============================================================
//  SETUP  (run once after deployment)
// ============================================================

function setup() {
  Logger.log('=== Nuan Bakery Setup ===');

  var branchSheet  = getOrCreateSheet(SHEET_BRANCHES, BRANCH_HEADERS);
  var userSheet    = getOrCreateSheet(SHEET_USERS,    USER_HEADERS);
  getOrCreateSheet(SHEET_SESSIONS, SESSION_HEADERS);

  seedBranches(branchSheet);
  seedUsers(userSheet);

  Logger.log('=== Setup complete ===');
}

function seedBranches(sheet) {
  if (sheet.getLastRow() > 1) {
    Logger.log('Branches: sheet already has data — skipping seed.');
    return;
  }

  // [BranchCode, BranchName]
  var branches = [
    ['89',   '89 พลาซ่า'],
    ['RC',   'รวมโชค'],
    ['ABJ',  'อบจ. เชียงใหม่'],
    ['CTF',  'เซ็นทรัลเฟส เชียงใหม่'],
    ['APG',  'เซ็นทรัลแอร์พอร์ต เชียงใหม่'],
    ['BCDJ', 'บิ๊กซีดอนจั่น'],
    ['BCEX', 'บิ๊กซีเอ็กตร้า'],
    ['BCHD', 'บิ๊กซีหางดง'],
    ['BCLP', 'บิ๊กซีลำพูน'],
    ['HNKP', 'รพ. นครพิงค์'],
    ['HSD',  'รพ. สวนดอก'],
    ['HCR',  'รพ. เชียงราย'],
    ['HLP',  'รพ. ลำปาง'],
    ['WL',   'วังหลัง'],
  ];

  var now = new Date().toISOString();
  branches.forEach(function(b) {
    sheet.appendRow([Utilities.getUuid(), b[0], b[1], true, now]);
  });
  Logger.log('Branches: seeded ' + branches.length + ' records.');
}

function seedUsers(sheet) {
  if (sheet.getLastRow() > 1) {
    Logger.log('Users: sheet already has data — skipping seed.');
    return;
  }

  // [Username, Password (plain — hashed below), Name, Role, BranchCode]
  var users = [
    ['admin',   'admin', 'ผู้ดูแลระบบ',       'admin',     'ALL'],
    ['rc001',   '1234',  'สมใจ รักดี',          'manager',   'RC'],
    ['rc002',   '1234',  'วิไล สุขสัน',         'assistant', 'RC'],
    ['rc003',   '1234',  'มานี รอดชีวิต',       'staff',     'RC'],
    ['ctf001',  '1234',  'ประยุทธ์ สบาย',       'manager',   'CTF'],
    ['abj001',  '1234',  'สาวิตรี ใจดี',        'manager',   'ABJ'],
    ['bcdj001', '1234',  'บุญเรือง สว่าง',      'manager',   'BCDJ'],
    ['wl001',   '1234',  'นิรันดร์ ยั่งยืน',    'manager',   'WL'],
    ['audit',   '1234',  'ตรวจสอบ การเงิน',     'hq',        'ALL'],
  ];

  var now = new Date().toISOString();
  users.forEach(function(u) {
    sheet.appendRow([
      Utilities.getUuid(),
      u[0],
      hashPassword(u[1]),
      u[2],
      u[3],
      u[4],
      true,
      now,
    ]);
  });
  Logger.log('Users: seeded ' + users.length + ' records (passwords hashed).');
}
