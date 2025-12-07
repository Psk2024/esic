// ---------------- Firebase setup ----------------
const firebaseConfig = {
  apiKey: "AIzaSyBl0JbugtktEVUP-Pdg6Rl0nzK9u10aN2c",
  authDomain: "empdb-2c5bb.firebaseapp.com",
  projectId: "empdb-2c5bb",
  storageBucket: "empdb-2c5bb.appspot.com",
  messagingSenderId: "94024514062",
  appId: "1:94024514062:web:431c9908b5f6afc1949a5f",
  measurementId: "G-JX251BG0G2"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const empCollection = db.collection("employees");
const transferCollection = db.collection("transferHistory");

/* ================== Utilities ================== */
const $ = id => document.getElementById(id);

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function safeLower(v) {
  return (v || "").toString().toLowerCase();
}
function applyPendingHighlight(id, value) {
  const el = document.getElementById(id);
  if (!el) return;

  if ((value || "").toLowerCase() === "pending") {
    el.classList.add("red-pending");
  } else {
    el.classList.remove("red-pending");
  }
}
/* ===== tenure helper (days) ===== */
function computeTenureYMD(fromDate, toDate) {
  if (!fromDate || !toDate) return "";

  const start = new Date(fromDate);
  const end = new Date(toDate);
  if (isNaN(start) || isNaN(end) || end < start) return "";

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  // Adjust month and day values when needed
  if (days < 0) {
    months--;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    days += prevMonth;
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  let output = "";
  if (years) output += `${years} year${years > 1 ? "s" : ""} `;
  if (months) output += `${months} month${months > 1 ? "s" : ""} `;
  if (days || output === "") output += `${days} day${days > 1 ? "s" : ""}`;

  return output.trim();
}
function applyPendingHighlight(id, value) {
  const el = document.getElementById(id);
  if (!el) return;

  if ((value || "").toLowerCase() === "pending") {
    el.classList.add("red-pending");
  } else {
    el.classList.remove("red-pending");
  }
}
/* ================== State ================== */
let employees = [];
let currentGroupFilter = "ALL"; // ALL | A | B | C
let currentStatusFilterField = null; // probationStatus / characterStatus / casteStatus / confirmationStatus
const STATUS_FILTER_VALUE = "Pending"; // for cards
let currentSearchTerm = "";

let currentEmployeeId = null;      // Firestore doc id
let currentTransferKey = null;     // Emp ID string (used in transferHistory)
let viewOnlyMode = false;

/* ================== Load Employees ================== */
async function loadEmployees() {
  setText("statusText", "Loading employees...");

  try {
    const snap = await db.collection("employees")
                         .orderBy("empId", "asc")   // <-- ADD HERE
                         .get();

    employees = [];
    snap.forEach(doc => {
      employees.push({ id: doc.id, ...doc.data() });
    });

    setText("statusText", `Loaded ${employees.length} record(s).`);
    setText(
      "empCount",
      `Total Employees: ${getUniqueEmpCount()}`
    );

    renderGroupCards();
    renderStatusCards();
    renderTable();
  } catch (err) {
    console.error("Error loading employees", err);
    setText("statusText", "Error loading employees.");
  }
}

function getUniqueEmpCount() {
  const setIds = new Set(
    employees.map(e => (e.empId || e.emp_id || "").toString().trim())
  );
  if (setIds.has("")) setIds.delete("");
  return setIds.size;
}

/* ================== Group Cards ================== */
function getEmployeeGroupCode(emp) {
  const g = (emp.group || emp.cadre || "").toString().trim().toUpperCase();
  if (g.startsWith("GROUP A") || g === "A") return "A";
  if (g.startsWith("GROUP B") || g === "B") return "B";
  if (g.startsWith("GROUP C") || g === "C") return "C";
  return "UNGROUPED";
}

function getUniqueCountForGroup(code) {
  const setIds = new Set();
  employees.forEach(e => {
    if (getEmployeeGroupCode(e) === code) {
      const id = (e.empId || e.emp_id || "").toString().trim();
      if (id) setIds.add(id);
    }
  });
  return setIds.size;
}

function renderGroupCards() {
  const row = $("dashCardRow");
  if (!row) return;
  row.innerHTML = "";

  const cards = [
    { code: "ALL", label: "All Groups", count: getUniqueEmpCount() },
    { code: "A", label: "Group A", count: getUniqueCountForGroup("A") },
    { code: "B", label: "Group B", count: getUniqueCountForGroup("B") },
    { code: "C", label: "Group C", count: getUniqueCountForGroup("C") }
  ];

  cards.forEach(cardInfo => {
    const card = document.createElement("div");
    card.className =
      "dash-summary-card" + (currentGroupFilter === cardInfo.code ? " active" : "");

    const label = document.createElement("div");
    label.className = "dash-summary-card-title";
    label.textContent = cardInfo.label;

    const value = document.createElement("div");
    value.className = "dash-summary-card-count";
    value.textContent = cardInfo.count;

    card.appendChild(label);
    card.appendChild(value);

    card.addEventListener("click", () => {
      currentGroupFilter =
        currentGroupFilter === cardInfo.code ? "ALL" : cardInfo.code;
      renderGroupCards();
      renderTable();
    });

    row.appendChild(card);
  });
}

/* ================== Status Cards (Pending) ================== */
function countStatus(field) {
  const seen = new Set();
  employees.forEach(e => {
    const id = (e.empId || e.emp_id || "").toString().trim();
    if (!id) return;
    if ((e[field] || "") === STATUS_FILTER_VALUE) {
      seen.add(id);
    }
  });
  return seen.size;
}

function renderStatusCards() {
  const row = $("statusCardRow");
  if (!row) return;
  row.innerHTML = "";

  const cards = [
    { field: "probationStatus", label: "Probation Pending" },
    { field: "characterStatus", label: "Police Verification Pending" },
    { field: "casteStatus", label: "Caste Verification Pending" },
    { field: "confirmationStatus", label: "Confirmation Pending" }
  ];

  cards.forEach(sf => {
    const count = countStatus(sf.field);
    const card = document.createElement("div");
    const isActive = currentStatusFilterField === sf.field;
    card.className = "dash-summary-card" + (isActive ? " active" : "");

    const label = document.createElement("div");
    label.className = "dash-summary-card-title";
    label.textContent = sf.label;

    const value = document.createElement("div");
    value.className = "dash-summary-card-count";
    value.textContent = count;

    card.appendChild(label);
    card.appendChild(value);

    card.addEventListener("click", () => {
      currentStatusFilterField =
        currentStatusFilterField === sf.field ? null : sf.field;
      renderStatusCards();
      renderTable();
    });

    row.appendChild(card);
  });
}

/* ================== Filtering / Table ================== */
function getFilteredEmployees() {
  let rows = [...employees];

  if (currentGroupFilter !== "ALL") {
    rows = rows.filter(e => getEmployeeGroupCode(e) === currentGroupFilter);
  }

  if (currentStatusFilterField) {
    rows = rows.filter(
      e => (e[currentStatusFilterField] || "") === STATUS_FILTER_VALUE
    );
  }

  if (currentSearchTerm) {
    const t = safeLower(currentSearchTerm);
    rows = rows.filter(e =>
      safeLower(e.empId).includes(t) ||
      safeLower(e.emp_id).includes(t) ||
      safeLower(e.empName).includes(t) ||
      safeLower(e.name).includes(t) ||
      safeLower(e.branch).includes(t) ||
      safeLower(e.group).includes(t)
    );
  }

  return rows;
}

function renderTable() {
  const tbody = $("employeeTableBody");
  if (!tbody) return;

  const rows = getFilteredEmployees();
  tbody.innerHTML = "";

  rows.forEach((emp, idx) => {
    const tr = document.createElement("tr");

    function cell(v) {
      const td = document.createElement("td");
      td.textContent = v || "";
      return td;
    }

    tr.appendChild(cell(idx + 1)); // Sl. No.
    tr.appendChild(cell(emp.empId || emp.emp_id));
    tr.appendChild(cell(emp.empName || emp.name));
    tr.appendChild(cell(emp.designation));
    tr.appendChild(cell(emp.branch));

    tr.addEventListener("click", () => openEmployeeForView(emp.id));

    tbody.appendChild(tr);
  });
}

/* ================== Employee Modal ================== */
function openEmployeeModal() {
  const overlay = $("modalOverlay");
  if (overlay) overlay.classList.add("active");
}

function closeEmployeeModal() {
  const overlay = $("modalOverlay");
  if (overlay) overlay.classList.remove("active");

  currentEmployeeId = null;
  currentTransferKey = null;
  viewOnlyMode = false;
  setFormReadOnly(false);
  const badge = $("editBadge");
  if (badge) badge.style.display = "none";
  clearEmployeeForm();
  setText("modalStatus", "");
  const tbody = $("transferTableBody");
  if (tbody) {
    tbody.innerHTML =
      `<tr><td colspan="8" class="status">Save the employee and then add transfer records.</td></tr>`;
  }
  setText("transferStatusText", "");
}

function getAllFieldIds() {
  return [
    "empId",
    "empName",
    "empDesignation",
    "empGroup",
    "empBranch",
    "empGender",
    "empDob",
    "empRetirement",
    "empDojBranch",
    "empDojAU",
    "empContact",
    "empProbationStatus",
    "empCharacterStatus",
    "empCasteStatus",
    "empConfirmationStatus"
  ];
}

function clearEmployeeForm() {
  getAllFieldIds().forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
}

function setFormReadOnly(readOnly) {
  getAllFieldIds().forEach(id => {
    const el = $(id);
    if (!el) return;
    if (el.tagName === "SELECT") {
      el.disabled = readOnly;
    } else {
      el.readOnly = readOnly;
    }
  });
}

function openNewEmployee() {
  currentEmployeeId = null;
  currentTransferKey = null;
  viewOnlyMode = false;
  clearEmployeeForm();

  const badge = $("editBadge");
  if (badge) badge.style.display = "none";

  setText("modalTitle", "Add Employee");
  setText("modalStatus", "");

  const tbody = $("transferTableBody");
  if (tbody) {
    tbody.innerHTML =
      `<tr><td colspan="8" class="status">Save the employee and then add transfer records.</td></tr>`;
  }
  setText("transferStatusText", "");

  openEmployeeModal();
}

function openEmployeeForView(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;

  currentEmployeeId = empId;
  currentTransferKey = (emp.empId || emp.emp_id || "").toString().trim();
  viewOnlyMode = true;

 setText("modalTitle", emp.empName || emp.name || "");
  setText("modalStatus", "");

  fillEmployeeForm(emp);
  
  setFormReadOnly(true);

  const badge = $("editBadge");
  if (badge) badge.style.display = "inline-flex";

  loadTransferHistoryForCurrentEmp();
  openEmployeeModal();
}

/* Fill form with robust mappings (handles older column names too) */
function fillEmployeeForm(emp) {
  $("empId").value =
    emp.empId || emp.emp_id || emp.EmpID || "";
  $("empName").value =
    emp.empName || emp.name || emp.OfficerName || emp["Officer / Official Name"] || "";
  $("empDesignation").value = emp.designation || emp.Designation || "";

  $("empGroup").value = emp.group || emp.cadre || emp.Cadre || "";

  $("empBranch").value =
    emp.branch ||
    emp.placeOfPosting ||
    emp["Place of Posting"] ||
    emp.Branch ||
    "";

  $("empContact").value =
    emp.contact ||
    emp.contactNo ||
    emp.Contact ||
    emp["Contact Details"] ||
    "";

  $("empGender").value = emp.gender || emp.Gender || "";

  $("empDob").value =
    emp.dob ||
    emp.DoB ||
    emp.DOB ||
    emp["Date of Birth"] ||
    "";

  $("empRetirement").value =
    emp.retirementDate ||
    emp.retirement ||
    emp.Retirement ||
    emp.DOR ||
    emp["Retirement Date"] ||
    "";

  $("empDojBranch").value =
    emp.dojBranch ||
    emp["DoJ (Branch)"] ||
    emp.doj_branch ||
    emp["Date of Joining (Branch)"] ||
    "";

  $("empDojAU").value =
    emp.dojAU ||
    emp["DoJ (Accounting Unit)"] ||
    emp["DoJ (AU)"] ||
    emp.doj_au ||
    emp["Date of Joining (AU)"] ||
    "";

  $("empProbationStatus").value =
    emp.probationStatus ||
    emp.ProbationStatus ||
    emp["Probation Status"] ||
    "";

  $("empCharacterStatus").value =
    emp.characterStatus ||
    emp["Police Verification Status"] ||
    emp.policeVerificationStatus ||
    "";

  $("empCasteStatus").value =
    emp.casteStatus ||
    emp["Caste Verification Status"] ||
    "";

  $("empConfirmationStatus").value =
    emp.confirmationStatus ||
    emp["Confirmation Status"] ||
    emp.confirmStatus ||
    "";
applyPendingHighlight("empProbationStatus", emp.probationStatus);
applyPendingHighlight("empCharacterStatus", emp.characterStatus);
applyPendingHighlight("empCasteStatus", emp.casteStatus);
applyPendingHighlight("empConfirmationStatus", emp.confirmationStatus);
}

/* ================== Save Employee ================== */
function getEmployeeFromForm() {
  return {
    empId: $("empId").value.trim(),
    empName: $("empName").value.trim(),
    designation: $("empDesignation").value.trim(),
    group: $("empGroup").value.trim(),
    branch: $("empBranch").value.trim(),
    contact: $("empContact").value.trim(),
    gender: $("empGender").value.trim(),
    dob: $("empDob").value.trim(),
    retirementDate: $("empRetirement").value.trim(),
    dojBranch: $("empDojBranch").value.trim(),
    dojAU: $("empDojAU").value.trim(),
    probationStatus: $("empProbationStatus").value,
    characterStatus: $("empCharacterStatus").value,
    casteStatus: $("empCasteStatus").value,
    confirmationStatus: $("empConfirmationStatus").value
  };
}

async function saveEmployee() {
  const statusEl = $("modalStatus");
  const data = getEmployeeFromForm();

  if (!data.empId || !data.empName) {
    statusEl.textContent = "Emp ID and Name are required.";
    return;
  }

  statusEl.textContent = "Saving...";

  try {
    if (currentEmployeeId) {
      await empCollection.doc(currentEmployeeId).set(data, { merge: true });
      statusEl.textContent = "Employee updated successfully.";
    } else {
      const docRef = await empCollection.add(data);
      currentEmployeeId = docRef.id;
      statusEl.textContent = "Employee added successfully.";
    }

    currentTransferKey = data.empId;
    await loadEmployees();
    await loadTransferHistoryForCurrentEmp();
  } catch (err) {
    console.error("Error saving employee", err);
    statusEl.textContent = "Error saving employee.";
  }
}

/* ================== Excel Download (filtered) ================== */
function downloadFilteredToExcel() {
  const rows = getFilteredEmployees();
  if (!rows.length) {
    alert("No data to download for current filters.");
    return;
  }

  const headers = [
    "Emp ID","Name","Designation","Group","Branch",
    "Gender","DoB","Retirement","DoJ (Branch)","DoJ (AU)",
    "Contact","Probation Status","Police Verification Status",
    "Caste Verification Status","Confirmation Status"
  ];

  const csvRows = [headers.join(",")];

  rows.forEach(e => {
    const row = [
      e.empId || e.emp_id || "",
      e.empName || e.name || "",
      e.designation || "",
      e.group || e.cadre || "",
      e.branch || "",
      e.gender || "",
      e.dob || "",
      e.retirementDate || "",
      e.dojBranch || "",
      e.dojAU || "",
      e.contact || "",
      e.probationStatus || "",
      e.characterStatus || "",
      e.casteStatus || "",
      e.confirmationStatus || ""
    ];

    const escaped = row.map(v => {
      const s = (v || "").toString();
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });

    csvRows.push(escaped.join(","));
  });

  const blob = new Blob([csvRows.join("\r\n")], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "employees_filtered.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ================== Transfer History (top-level collection) ================== */
async function loadTransferHistoryForCurrentEmp() {
  const tbody = $("transferTableBody");
  const statusEl = $("transferStatusText");
  if (!tbody || !statusEl) return;

  if (!currentTransferKey) {
    tbody.innerHTML =
      `<tr><td colspan="8" class="status">Save the employee and then add transfer records.</td></tr>`;
    statusEl.textContent = "";
    return;
  }

  statusEl.textContent = "Loading transfer records...";

  try {
    const snap = await transferCollection
      .where("empId", "==", String(currentTransferKey))
      .get();

    const records = [];
    snap.forEach(doc => records.push({ id: doc.id, ...doc.data() }));

    if (!records.length) {
      tbody.innerHTML =
        `<tr><td colspan="8" class="status">No transfer records found.</td></tr>`;
      statusEl.textContent = "";
      return;
    }

    records.sort((a, b) => (a.fromDate || "").localeCompare(b.fromDate || ""));

    tbody.innerHTML = "";
    let i = 1;

    records.forEach(rec => {
      const tr = document.createElement("tr");
      const tenureText = computeTenureYMD(rec.fromDate, rec.toDate);   function td(txt) {
        const el = document.createElement("td");
        el.textContent = txt || "";
        return el;
      }

      tr.appendChild(td(i++));           // Sl. No.
      tr.appendChild(td(rec.orderNo));   // Order No.
      tr.appendChild(td(rec.orderDate)); // Order Date
      tr.appendChild(td(rec.branch));    // Branch
      tr.appendChild(td(rec.fromDate));  // From Date
      tr.appendChild(td(rec.toDate));    // To Date
      tr.appendChild(td(tenureText));    // Tenure

      const actionTd = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-danger btn-small";
      btn.textContent = "Delete";
      btn.onclick = () => deleteTransfer(rec.id);
      actionTd.appendChild(btn);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });

    statusEl.textContent = "";
  } catch (err) {
    console.error("Error loading transfer history", err);
    tbody.innerHTML =
      `<tr><td colspan="8" class="status">Error loading transfer records.</td></tr>`;
    statusEl.textContent = "Error loading transfer records.";
  }
}

/* Add transfer record – Branch, From Date, To Date, Order No, Order Date */
async function handleAddTransferRecordInline() {
  const statusEl = $("transferStatusText");

  if (!currentEmployeeId || !currentTransferKey) {
    statusEl.textContent =
      "Please save the employee record before adding transfers.";
    return;
  }

  const branch   = $("tfBranch").value.trim();
  const fromDate = $("tfFromDate").value;
  const toDate   = $("tfToDate").value;
  const orderNo  = $("tfOrderNo").value.trim();
  const orderDate= $("tfOrderDate").value;

  if (!branch || !fromDate || !toDate) {
    statusEl.textContent = "All fields in transfer form are required.";
    return;
  }

  const tenure = computeTenureYMD(fromDate, toDate);
  statusEl.textContent = "Saving transfer record...";

  try {
    await transferCollection.add({
      empId: String(currentTransferKey),
      branch,
      fromDate,
      toDate,
      orderNo,
      orderDate,
      tenure,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    $("tfBranch").value = "";
    $("tfFromDate").value = "";
    $("tfToDate").value = "";
    $("tfOrderNo").value = "";
    $("tfOrderDate").value = "";

    statusEl.textContent = "Transfer record added.";
    loadTransferHistoryForCurrentEmp();
  } catch (err) {
    console.error("Error adding transfer record", err);
    statusEl.textContent = "Failed to add record.";
  }
}

async function deleteTransfer(transferId) {
  if (!confirm("Delete this transfer record?")) return;
  try {
    await transferCollection.doc(transferId).delete();
    loadTransferHistoryForCurrentEmp();
  } catch (err) {
    console.error("Error deleting transfer", err);
    alert("Failed to delete transfer record.");
  }
}

/* ================== Events ================== */
document.addEventListener("DOMContentLoaded", () => {
  loadEmployees();

  $("addEmpBtn").addEventListener("click", openNewEmployee);
  $("downloadBtn").addEventListener("click", downloadFilteredToExcel);

  $("searchInput").addEventListener("input", e => {
    currentSearchTerm = e.target.value || "";
    renderTable();
  });

  $("modalCloseBtn").addEventListener("click", closeEmployeeModal);
  $("modalOverlay").addEventListener("click", e => {
    if (e.target.id === "modalOverlay") closeEmployeeModal();
  });

  $("saveBtn").addEventListener("click", saveEmployee);
  $("clearBtn").addEventListener("click", clearEmployeeForm);

  $("editBtn").addEventListener("click", () => {
    viewOnlyMode = false;
    setFormReadOnly(false);
    const badge = $("editBadge");
    if (badge) badge.style.display = "none";
    setText("modalTitle", "Edit Employee");
  });

  $("addTransferBtn").addEventListener("click", handleAddTransferRecordInline);
});