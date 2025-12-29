/* ===== AUTH ===== */

const DEFAULT_USERS = {
  manager: {
    email: "manager@rjames.com",
    password: "manager123"
  },
  staff: [
    {
      email: "staff@rjames.com",
      password: "staff123"
    }
  ]
};

let USERS = JSON.parse(localStorage.getItem("USERS")) || DEFAULT_USERS;
localStorage.setItem("USERS", JSON.stringify(USERS));

let CURRENT_USER = JSON.parse(localStorage.getItem("CURRENT_USER"));

// Load users or init defaults
let USERS = JSON.parse(localStorage.getItem("USERS")) || DEFAULT_USERS;
localStorage.setItem("USERS", JSON.stringify(USERS));

let CURRENT_USER = JSON.parse(localStorage.getItem("CURRENT_USER"));

document.addEventListener("DOMContentLoaded", () => {
  if (!CURRENT_USER) {
    document.getElementById("loginScreen").classList.remove("hidden");
  } else {
    applyRoleRestrictions();
  }

  document.getElementById("loginBtn").onclick = login;
});

function login(){
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

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
  document.getElementById("loginScreen").classList.add("hidden");
  applyRoleRestrictions();
}


function logout(){
  localStorage.removeItem("CURRENT_USER");
  location.reload();
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

function changeManagerPassword(){
  const pwd = newManagerPassword.value.trim();
  if (pwd.length < 4) return alert("Password too short");

  USERS.manager.password = pwd;
  localStorage.setItem("USERS", JSON.stringify(USERS));
  newManagerPassword.value = "";
  alert("Manager password updated");
}

function addStaff(){
  const email = staffEmail.value.trim();
  const pwd = staffPassword.value.trim();

  if (!email || !pwd) return alert("Fill all fields");

  if (USERS.staff.some(u => u.email === email))
    return alert("Staff already exists");

  USERS.staff.push({ email, password: pwd });
  localStorage.setItem("USERS", JSON.stringify(USERS));

  staffEmail.value = "";
  staffPassword.value = "";
  renderStaffList();
}

function removeStaff(email){
  USERS.staff = USERS.staff.filter(u => u.email !== email);
  localStorage.setItem("USERS", JSON.stringify(USERS));
  renderStaffList();
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
        <button class="btn small ghost" onclick="resetStaffPassword('${u.email}')">
          Reset Password
        </button>
        <button class="btn danger small" onclick="removeStaff('${u.email}')">
          Remove
        </button>
      </div>
    `;

    box.appendChild(row);
  });
}


}
function applyRoleRestrictions(){
  const isStaff = CURRENT_USER.role === "staff";

  if (isStaff) {
    document.querySelectorAll(".deleteUnit").forEach(b => b.remove());
    document.querySelectorAll(".pdfBtn").forEach(b => b.remove());
    document.getElementById("pickFolderBtn")?.remove();
    document.getElementById("saveFolderBtn")?.remove();
  }
}

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

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", async () => {
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
});

/* ================= DB ================= */

function openDB() {
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

/* ================= VALIDATION ================= */

function normalizeUnitNumber(value) {
  return value.trim().toUpperCase();
}

function isValidUnitNumber(unitNumber) {
  if (PROPERTY === "1") {
    // A101
    return /^[A-Z][0-9]{3}$/.test(unitNumber);
  }
  if (PROPERTY === "2") {
    // 1001
    return /^[0-9]{4}$/.test(unitNumber);
  }
  return false;
}

async function isDuplicateUnit(unitNumber) {
  const units = await getAll();
  return units.some(u => u.unitNumber === unitNumber);
}

/* ================= HELPERS ================= */

function enableDatePickers(root=document) {
  root.querySelectorAll(".datePick").forEach(i => {
    i.onkeydown = e => e.preventDefault();
    i.onclick = () => i.showPicker?.();
    i.onfocus = () => i.showPicker?.();
  });
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + " at " +
    d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
}

/* ================= ADD UNIT ================= */

async function addUnit(e) {
  e.preventDefault();
  const f = new FormData(e.target);

  const unitNumber = normalizeUnitNumber(f.get("unitNumber"));

  if (!isValidUnitNumber(unitNumber)) {
    alert(
      PROPERTY === "1"
        ? "Retreat 1 format: Letter + 3 digits (example: A101)"
        : "Retreat 2 format: 4 digits only (example: 1001)"
    );
    return;
  }

  if (await isDuplicateUnit(unitNumber)) {
    alert(`Unit ${unitNumber} already exists in this property.`);
    return;
  }

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

/* ================= RENDER ================= */

async function render() {
  unitList.innerHTML = "";
  const q = (search.value || "").toLowerCase();
  const units = await getAll();

  const filtered = units.filter(u =>
    !q || JSON.stringify(u).toLowerCase().includes(q)
  );

  if (q) filtered.forEach(u => openDetails.add(u.id));

  filtered.forEach(u => {
    const el = renderUnit(u);
    unitList.appendChild(el);
    enableDatePickers(el);
  });
}

/* ================= UNIT ================= */

function renderUnit(unit) {
  const tpl = unitTemplate.content.cloneNode(true);
  const el = tpl.querySelector(".unit");

  el.querySelector(".unitName").textContent = unit.unitNumber;
  el.querySelector(".notes").textContent = unit.notes || "";
  el.querySelector(".dates").textContent =
    `Start: ${unit.start || "-"} | Finish: ${unit.finish || "-"}`;

  if (unit.completed)
    el.querySelector(".unitBadge").classList.remove("hidden");

  const details = el.querySelector(".details");
  if (openDetails.has(unit.id)) details.classList.remove("hidden");

  el.querySelector(".toggleDetails").onclick = () => {
    details.classList.toggle("hidden");
    details.classList.contains("hidden")
      ? openDetails.delete(unit.id)
      : openDetails.add(unit.id);
  };

  /* ===== DELETE UNIT ===== */
  el.querySelector(".deleteUnit").onclick = async () => {
    if (!confirm("Are you sure you want to delete this unit?")) return;

    const todayDay = new Date().getDate();
    const correctPassword = String(683 * todayDay);
    const entered = prompt("Enter delete password");

    if (entered !== correctPassword) {
      alert("Incorrect password.");
      return;
    }

    await store("readwrite").delete(unit.id);
    render();
  };

  /* ===== MARK DONE ===== */
  el.querySelector(".markDone").onclick = async () => {
    if (!unit.completed) {
      const finalInspection = unit.tasks.find(
        t => t.name === "Final Inspection" && t.status === "done"
      );
      if (!finalInspection) {
        alert("Final Inspection must be completed first.");
        return;
      }
    }

    unit.completed = !unit.completed;
    if (unit.completed && !unit.finish)
      unit.finish = new Date().toISOString().slice(0,10);

    await store("readwrite").put(unit);
    render();
  };

  el.querySelector(".pdfBtn").onclick = () => exportPDF(unit);

  const finish = el.querySelector(".finishDate");
  finish.value = unit.finish || "";
  finish.onchange = async () => {
    unit.finish = finish.value;
    await store("readwrite").put(unit);
    render();
  };

  /* ===== TASK ADD / LIST (UNCHANGED) ===== */

  const picker = el.querySelector(".taskPicker");
  picker.innerHTML = `<option value="">Select task</option>`;
  TASK_TYPES.forEach(t => picker.add(new Option(t,t)));

  const vendorI = el.querySelector(".taskVendor");
  const dateI = el.querySelector(".taskDate");
  const statusI = el.querySelector(".taskStatus");
  const noteI = el.querySelector(".taskNote");

  el.querySelector(".addTask").onclick = async () => {
    if (!picker.value) return;

    if (picker.value === "Final Inspection" && !noteI.value.trim()) {
      alert("Final Inspection requires a note.");
      return;
    }

    unit.tasks.push({
      name: picker.value,
      vendor: vendorI.value,
      date: dateI.value,
      status: statusI.value,
      note: noteI.value,
      doneAt: statusI.value === "done" ? new Date().toISOString() : null
    });

    vendorI.value = "";
    dateI.value = "";
    statusI.value = "pending";
    noteI.value = "";

    await store("readwrite").put(unit);
    render();
  };

  const box = el.querySelector(".tasks");
  box.innerHTML = "";

  unit.tasks.forEach(task => {
    const row = document.createElement("div");
    row.className = "task" + (task.status === "done" ? " done" : "");

    row.innerHTML = `
      <select class="edit-name" disabled></select>
      <input class="edit-vendor" value="${task.vendor||""}" disabled>
      <input type="date" class="edit-date datePick" value="${task.date||""}" disabled>
      <select class="edit-status" disabled>
        <option value="pending">Pending</option>
        <option value="done">Done</option>
      </select>
      <input class="edit-note" value="${task.note||""}" disabled>
      <span class="doneTime">${task.doneAt ? "✔ Done on " + formatDateTime(task.doneAt) : ""}</span>
      <button class="editBtn">Edit</button>
      <button class="saveBtn hidden">Save</button>
      <button class="deleteBtn">Delete</button>
    `;

    const nameSel = row.querySelector(".edit-name");
    TASK_TYPES.forEach(t => nameSel.add(new Option(t,t)));
    nameSel.value = task.name;

    const statusSel = row.querySelector(".edit-status");
    statusSel.value = task.status;

    row.querySelector(".editBtn").onclick = () => {
      row.querySelectorAll("input,select").forEach(i => i.disabled = false);
      row.querySelector(".editBtn").classList.add("hidden");
      row.querySelector(".saveBtn").classList.remove("hidden");
    };

    row.querySelector(".saveBtn").onclick = async () => {
      const prevStatus = task.status;

      task.name = nameSel.value;
      task.vendor = row.querySelector(".edit-vendor").value;
      task.date = row.querySelector(".edit-date").value;
      task.status = statusSel.value;
      task.note = row.querySelector(".edit-note").value;

      if (prevStatus !== "done" && task.status === "done")
        task.doneAt = new Date().toISOString();

      if (task.status !== "done")
        task.doneAt = null;

      await store("readwrite").put(unit);
      render();
    };

    row.querySelector(".deleteBtn").onclick = async () => {
      if (!confirm("Are you sure?")) return;
      unit.tasks = unit.tasks.filter(t => t !== task);
      await store("readwrite").put(unit);
      render();
    };

    box.appendChild(row);
  });

  return el;
}

/* ================= BACKUP ================= */

  function exportPDF(unit) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });

  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();

  let y = 90;
  let page = 1;

  const colX = [40,130,240,310,380,470];
  const colW = [90,100,60,60,90,90];

  /* ===== FOOTER ===== */
  const footer = () => {
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(`Page ${page}`, W - 40, H - 20, { align: "right" });
  };

  /* ===== HEADER ===== */
  const header = () => {
    // White background
    pdf.setFillColor(255,255,255);
    pdf.rect(0,0,W,H,"F");

    // Logo
    try {
      pdf.addImage(
        document.querySelector(".logo"),
        "PNG",
        40,
        30,
        60,
        30
      );
    } catch {}

    // Title
    pdf.setTextColor(0,0,0);
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(16);
    pdf.text(`Retreat at Greenbriar ${PROPERTY}`, W/2, 45, { align:"center" });

    pdf.setFontSize(10);
    pdf.setFont("helvetica","normal");
    pdf.text(
      "Make-Ready Manager — Mohabatullah Hakimi",
      W/2,
      62,
      { align:"center" }
    );

    // Unit meta
    pdf.setFont("helvetica","bold");
    pdf.text(`Unit: ${unit.unitNumber}`, 40, 80);
    pdf.setFont("helvetica","normal");
    pdf.text(
      `Start: ${unit.start || "-"}   Finish: ${unit.finish || "-"}`,
      160,
      80
    );

    y = 100;
  };

  /* ===== TABLE HEADER ===== */
  const tableHeader = () => {
    pdf.setFont("helvetica","bold");
    pdf.setFontSize(10);

    ["Task","Vendor","Date","Status","Note","Done At"].forEach((h,i)=>{
      pdf.rect(colX[i], y, colW[i], 22);
      pdf.text(h, colX[i]+4, y+15);
    });

    pdf.setFont("helvetica","normal");
    y += 22;
  };

  /* ===== NEW PAGE ===== */
  const newPage = () => {
    footer();
    pdf.addPage();
    page++;
    header();
    tableHeader();
  };

  /* ===== START ===== */
  header();
  tableHeader();

  (unit.tasks || []).forEach(t => {
    if (y > H - 70) newPage();

    const row = [
      t.name || "-",
      t.vendor || "-",
      t.date || "-",
      t.status || "-",
      t.note || "-",
      t.doneAt
        ? new Date(t.doneAt).toLocaleDateString() + " " +
          new Date(t.doneAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})
        : "-"
    ];

  row.forEach((val,i)=>{
  pdf.rect(colX[i], y, colW[i], 22);

  if (i === 5) {
    // DONE AT → force single-line, clean format
    pdf.text(
      String(val),
      colX[i] + 4,
      y + 15,
      { maxWidth: colW[i] - 6 }
    );
  } else {
    pdf.text(
      pdf.splitTextToSize(String(val), colW[i]-6),
      colX[i]+4,
      y+15
    );
  }
});


    y += 22;
  });

  footer();
  pdf.save(`Unit-${unit.unitNumber}.pdf`);
}


async function pickFolder() {
  folderHandle = await window.showDirectoryPicker();
  alert("Folder selected");
}

async function saveBackupToFolder() {
  if (!folderHandle) return alert("Choose folder first");
  const file = await folderHandle.getFileHandle(
    `backup-${DB_NAME}-${new Date().toISOString().slice(0,10)}.json`,
    { create:true }
  );
  const w = await file.createWritable();
  await w.write(JSON.stringify(await getAll(),null,2));
  await w.close();
}




