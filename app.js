/* ================= AUTH ================= */

const DEFAULT_USERS = {
  manager: {
    email: "manager@rjames.com",
    password: "manager123"
  },
  staff: [
    { email: "staff@rjames.com", password: "staff123" }
  ]
};

let USERS = JSON.parse(localStorage.getItem("USERS")) || DEFAULT_USERS;
localStorage.setItem("USERS", JSON.stringify(USERS));

let CURRENT_USER = JSON.parse(localStorage.getItem("CURRENT_USER"));

// 🔐 Login elements
let loginEmail, loginPassword, loginError;

// 🧱 App elements
let propertySelect, propertyTitle;
let pickFolderBtn, saveFolderBtn, logoutBtn;
let unitForm, search, unitList, unitTemplate;
let managerPanel, staffList;

/* ================= DOM READY ================= */

document.addEventListener("DOMContentLoaded", () => {

  // Login
  loginEmail = document.getElementById("loginEmail");
  loginPassword = document.getElementById("loginPassword");
  loginError = document.getElementById("loginError");

  // App
  propertySelect = document.getElementById("propertySelect");
  propertyTitle = document.getElementById("propertyTitle");
  pickFolderBtn = document.getElementById("pickFolderBtn");
  saveFolderBtn = document.getElementById("saveFolderBtn");
  logoutBtn = document.getElementById("logoutBtn");

  unitForm = document.getElementById("unitForm");
  search = document.getElementById("search");
  unitList = document.getElementById("unitList");
  unitTemplate = document.getElementById("unitTemplate");

  managerPanel = document.getElementById("managerPanel");
  staffList = document.getElementById("staffList");

  document.getElementById("loginBtn").onclick = login;
  logoutBtn.onclick = logout;
  document.getElementById("updateManagerPwd").onclick = changeManagerPassword;

  if (CURRENT_USER) unlockApp();
  else lockApp();
});

/* ================= LOGIN FLOW ================= */

function lockApp(){
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("appRoot").classList.add("hidden");
}

async function unlockApp(){
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appRoot").classList.remove("hidden");

  await initApp();          // ✅ INIT FIRST
  applyRoleRestrictions(); // ✅ THEN RESTRICT
}

function login(){
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();
  loginError.classList.add("hidden");

  if (USERS.manager.email === email && USERS.manager.password === password) {
    CURRENT_USER = { role: "manager", email };
  } else {
    const staffUser = USERS.staff.find(
      u => u.email === email && u.password === password
    );
    if (!staffUser) {
      loginError.classList.remove("hidden");
      return;
    }
    CURRENT_USER = { role: "staff", email };
  }

  localStorage.setItem("CURRENT_USER", JSON.stringify(CURRENT_USER));
  unlockApp();
}

function logout(){
  localStorage.removeItem("CURRENT_USER");
  CURRENT_USER = null;
  lockApp();
}

/* ================= ROLE CONTROL ================= */

function applyRoleRestrictions(){
  if (CURRENT_USER.role === "manager") {
    managerPanel.classList.remove("hidden");
    renderStaffList();
    return;
  }

  // Staff restrictions
  managerPanel.remove();
  document.querySelectorAll(".deleteUnit,.pdfBtn").forEach(b => b.remove());
  pickFolderBtn.remove();
  saveFolderBtn.remove();
}

/* ================= MANAGER ================= */

function changeManagerPassword(){
  const pwd = newManagerPassword.value.trim();
  if (pwd.length < 4) return alert("Password too short");

  USERS.manager.password = pwd;
  localStorage.setItem("USERS", JSON.stringify(USERS));
  newManagerPassword.value = "";
  alert("Manager password updated");
}

function renderStaffList(){
  staffList.innerHTML = "";
  USERS.staff.forEach(u => {
    const row = document.createElement("div");
    row.className = "staffRow";
    row.innerHTML = `
      <span>${u.email}</span>
      <div class="row">
        <button class="btn ghost small" onclick="resetStaffPassword('${u.email}')">Reset</button>
        <button class="btn danger small" onclick="removeStaff('${u.email}')">Remove</button>
      </div>
    `;
    staffList.appendChild(row);
  });
}

function resetStaffPassword(email){
  const pwd = prompt(`New password for ${email}`);
  if (!pwd || pwd.length < 4) return;

  const staff = USERS.staff.find(u => u.email === email);
  if (!staff) return;

  staff.password = pwd;
  localStorage.setItem("USERS", JSON.stringify(USERS));
  alert("Password reset");
}

function removeStaff(email){
  USERS.staff = USERS.staff.filter(u => u.email !== email);
  localStorage.setItem("USERS", JSON.stringify(USERS));
  renderStaffList();
}

/* ================= MAIN APP ================= */

let PROPERTY = localStorage.getItem("property") || "1";
let DB_NAME = `RetreatMakeReadyDB_${PROPERTY}`;
const STORE = "units";
let db = null;
let folderHandle = null;

async function initApp(){
  propertySelect.value = PROPERTY;
  propertyTitle.textContent = `Retreat at Greenbriar ${PROPERTY}`;

  propertySelect.onchange = e => {
    localStorage.setItem("property", e.target.value);
    location.reload();
  };

  pickFolderBtn.onclick = pickFolder;
  saveFolderBtn.onclick = saveBackupToFolder;

  await openDB();
  unitForm.onsubmit = addUnit;
  search.oninput = render;
  render();
}

/* ================= DATABASE ================= */

function openDB(){
  return new Promise(res => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = e =>
      e.target.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = e => { db = e.target.result; res(); };
  });
}

const store = mode => db.transaction(STORE, mode).objectStore(STORE);
const getAll = () => new Promise(res => {
  const r = store("readonly").getAll();
  r.onsuccess = () => res(r.result || []);
});

/* ================= UNITS ================= */

async function addUnit(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const unitNumber = f.get("unitNumber").trim().toUpperCase();

  const units = await getAll();
  if (units.some(u => u.unitNumber === unitNumber))
    return alert("Unit already exists");

  await store("readwrite").put({
    id: crypto.randomUUID(),
    unitNumber,
    status: f.get("status"),
    start: f.get("start"),
    finish: "",
    notes: f.get("notes"),
    tasks: [],
    completed: false
  });

  e.target.reset();
  render();
}

async function render(){
  unitList.innerHTML = "";
  const units = await getAll();
  units.forEach(u => {
    const el = unitTemplate.content.cloneNode(true).querySelector(".unit");
    el.querySelector(".unitName").textContent = u.unitNumber;
    el.querySelector(".notes").textContent = u.notes || "";
    el.querySelector(".dates").textContent =
      `Start: ${u.start || "-"} | Finish: ${u.finish || "-"}`;
    unitList.appendChild(el);
  });
}

/* ================= BACKUP ================= */

async function pickFolder(){
  folderHandle = await window.showDirectoryPicker();
  alert("Folder selected");
}

async function saveBackupToFolder(){
  if (!folderHandle) return alert("Choose folder first");
  const file = await folderHandle.getFileHandle(
    `backup-${DB_NAME}-${new Date().toISOString().slice(0,10)}.json`,
    { create:true }
  );
  const w = await file.createWritable();
  await w.write(JSON.stringify(await getAll(), null, 2));
  await w.close();
}
