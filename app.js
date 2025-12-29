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

// ✅ FIX: bind login elements explicitly (no deletions)
let loginEmail, loginPassword, loginError;

document.addEventListener("DOMContentLoaded", () => {
  // ✅ FIX: safe bindings
  loginEmail = document.getElementById("loginEmail");
  loginPassword = document.getElementById("loginPassword");
  loginError = document.getElementById("loginError");

  document.getElementById("loginBtn").onclick = login;
  document.getElementById("logoutBtn").onclick = logout;
  document.getElementById("updateManagerPwd").onclick = changeManagerPassword;

  if (CURRENT_USER) {
    unlockApp();
  } else {
    lockApp();
  }
});

/* ===== LOGIN FLOW ===== */

function lockApp(){
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("appRoot").classList.add("hidden");
}

function unlockApp(){
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appRoot").classList.remove("hidden");
  applyRoleRestrictions();
  initApp(); // start main app only AFTER login
}

function login(){
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();
  loginError.classList.add("hidden");

  if (
    USERS.manager.email === email &&
    USERS.manager.password === password
  ) {
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

/* ===== ROLE CONTROL ===== */

function applyRoleRestrictions(){
  if (CURRENT_USER.role === "manager") {
    document.getElementById("managerPanel").classList.remove("hidden");
    renderStaffList();
    return;
  }

  // staff restrictions
  document.getElementById("managerPanel")?.remove();
  document.querySelectorAll(".deleteUnit").forEach(b => b.remove());
  document.querySelectorAll(".pdfBtn").forEach(b => b.remove());
  document.getElementById("pickFolderBtn")?.remove();
  document.getElementById("saveFolderBtn")?.remove();
}

/* ===== MANAGER ACTIONS ===== */

function changeManagerPassword(){
  const pwd = newManagerPassword.value.trim();
  if (pwd.length < 4) return alert("Password too short");

  USERS.manager.password = pwd;
  localStorage.setItem("USERS", JSON.stringify(USERS));
  newManagerPassword.value = "";
  alert("Manager password updated");
}

function addStaff(email, password){
  USERS.staff.push({ email, password });
  localStorage.setItem("USERS", JSON.stringify(USERS));
  renderStaffList();
}

function removeStaff(email){
  USERS.staff = USERS.staff.filter(u => u.email !== email);
  localStorage.setItem("USERS", JSON.stringify(USERS));
  renderStaffList();
}

function resetStaffPassword(email){
  const pwd = prompt(`New password for ${email}`);
  if (!pwd || pwd.length < 4) return alert("Invalid password");

  const staff = USERS.staff.find(u => u.email === email);
  if (!staff) return;

  staff.password = pwd;
  localStorage.setItem("USERS", JSON.stringify(USERS));
  alert("Password reset");
}

function renderStaffList(){
  const box = document.getElementById("staffList");
  box.innerHTML = "";

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
    box.appendChild(row);
  });
}

/* ================= MAIN APP ================= */

const TASK_TYPES = [
  "Cleaning","Painting","Flooring","Maintenance",
  "Electrical","Plumbing","Pest Control","HVAC","Final Inspection"
];

let PROPERTY = localStorage.getItem("property") || "1";
let DB_NAME = `RetreatMakeReadyDB_${PROPERTY}`;
const STORE = "units";
let db = null;
let folderHandle = null;
let openDetails = new Set();

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

/* ===== DATABASE ===== */

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

/* ===== UNITS ===== */

async function addUnit(e){
  e.preventDefault();
  const f = new FormData(e.target);
  const unitNumber = f.get("unitNumber").trim().toUpperCase();

  if (await isDuplicateUnit(unitNumber))
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

async function isDuplicateUnit(unit){
  const units = await getAll();
  return units.some(u => u.unitNumber === unit);
}

async function render(){
  unitList.innerHTML = "";
  const units = await getAll();
  units.forEach(u => unitList.appendChild(renderUnit(u)));
}

function renderUnit(unit){
  const el = unitTemplate.content.cloneNode(true).querySelector(".unit");
  el.querySelector(".unitName").textContent = unit.unitNumber;
  el.querySelector(".notes").textContent = unit.notes || "";
  el.querySelector(".dates").textContent =
    `Start: ${unit.start || "-"} | Finish: ${unit.finish || "-"}`;

  return el;
}

/* ===== BACKUP ===== */

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
