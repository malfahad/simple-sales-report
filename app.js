const DB_NAME = "dailySalesReport";
const DB_VERSION = 1;
const STORE_REPORTS = "reports";
const STORE_SETTINGS = "settings";
const BACKUP_VERSION = 1;
const BACKUP_APP_ID = "dailySalesReport";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const form = document.getElementById("report-form");
const nameInput = document.getElementById("name");
const dayInput = document.getElementById("report-day");
const monthSelect = document.getElementById("report-month");
const yearInput = document.getElementById("report-year");
const targetInput = document.getElementById("target");
const salesInput = document.getElementById("sales");
const outputSection = document.getElementById("output-section");
const reportTextEl = document.getElementById("report-text");
const copyBtn = document.getElementById("copy-btn");
const whatsappBtn = document.getElementById("whatsapp-btn");
const toastEl = document.getElementById("toast");
const tabCalculator = document.getElementById("tab-calculator");
const tabReports = document.getElementById("tab-reports");
const panelCalculator = document.getElementById("panel-calculator");
const panelReports = document.getElementById("panel-reports");
const reportsListEl = document.getElementById("reports-list");
const reportsEmptyEl = document.getElementById("reports-empty");
const refreshReportsBtn = document.getElementById("refresh-reports-btn");
const tabSettings = document.getElementById("tab-settings");
const panelSettings = document.getElementById("panel-settings");
const exportBackupBtn = document.getElementById("export-backup-btn");
const importPickBtn = document.getElementById("import-pick-btn");
const importFileInput = document.getElementById("import-file");
const importFileNameEl = document.getElementById("import-file-name");
const importBackupBtn = document.getElementById("import-backup-btn");
const importReplaceCheckbox = document.getElementById("import-replace");

let dbPromise = null;
let pendingImportFile = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_REPORTS)) {
          db.createObjectStore(STORE_REPORTS, { keyPath: "dateKey" });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
        }
      };
    });
  }
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        resolve(store);
        transaction.onerror = () => reject(transaction.error);
      })
  );
}

function getSetting(key) {
  return tx(STORE_SETTINGS, "readonly").then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

function setSetting(key, value) {
  return tx(STORE_SETTINGS, "readwrite").then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.put({ key, value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

function getReport(dateKey) {
  return tx(STORE_REPORTS, "readonly").then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.get(dateKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
  );
}

function saveReport(record) {
  return tx(STORE_REPORTS, "readwrite").then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

function getAllReports() {
  return tx(STORE_REPORTS, "readonly").then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      })
  );
}

function deleteReport(dateKey) {
  return tx(STORE_REPORTS, "readwrite").then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.delete(dateKey);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
  );
}

function getAllSettings() {
  return tx(STORE_SETTINGS, "readonly").then(
    (store) =>
      new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      })
  );
}

function importBackupData(reports, settings, replace) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_REPORTS, STORE_SETTINGS], "readwrite");
        const reportsStore = transaction.objectStore(STORE_REPORTS);
        const settingsStore = transaction.objectStore(STORE_SETTINGS);

        if (replace) {
          reportsStore.clear();
          settingsStore.clear();
        }

        reports.forEach((record) => reportsStore.put(record));
        settings.forEach((entry) => settingsStore.put(entry));

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      })
  );
}

function validateBackupPayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid backup file.");
  }
  if (data.app !== BACKUP_APP_ID) {
    throw new Error("This file is not a Daily Sales Report backup.");
  }
  if (!Array.isArray(data.reports) || !Array.isArray(data.settings)) {
    throw new Error("Backup file is missing reports or settings.");
  }
  data.reports.forEach((record, index) => {
    if (!record || typeof record.dateKey !== "string") {
      throw new Error(`Invalid report at index ${index}.`);
    }
  });
  data.settings.forEach((entry, index) => {
    if (!entry || typeof entry.key !== "string" || !("value" in entry)) {
      throw new Error(`Invalid setting at index ${index}.`);
    }
  });
  return {
    reports: data.reports,
    settings: data.settings,
  };
}

async function buildBackupPayload() {
  const [reports, settings] = await Promise.all([getAllReports(), getAllSettings()]);
  return {
    version: BACKUP_VERSION,
    app: BACKUP_APP_ID,
    exportedAt: new Date().toISOString(),
    reports,
    settings,
  };
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function backupFilename() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `daily-sales-report-backup-${stamp}.json`;
}

function resetImportFileUi() {
  pendingImportFile = null;
  importFileInput.value = "";
  importFileNameEl.textContent = "No file selected";
  importBackupBtn.disabled = true;
}

async function exportBackup() {
  const payload = await buildBackupPayload();
  downloadJson(backupFilename(), payload);
  showToast(`Exported ${payload.reports.length} report(s)`);
}

async function importBackupFromFile(file, replace) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Could not read backup file (invalid JSON).");
  }
  const { reports, settings } = validateBackupPayload(parsed);
  await importBackupData(reports, settings, replace);
  await loadSettingsIntoForm();
  if (!panelReports.hidden) renderReportsList();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateKeyFromParts(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function parseReportDate() {
  const year = Number(yearInput.value);
  const monthIndex = Number(monthSelect.value);
  const day = Number(dayInput.value);
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    throw new Error("Invalid date for this month.");
  }
  return { year, monthIndex, day, date };
}

function yesterdayKey(year, monthIndex, day) {
  const d = new Date(year, monthIndex, day);
  d.setDate(d.getDate() - 1);
  return dateKeyFromParts(d.getFullYear(), d.getMonth(), d.getDate());
}

function countNonSundaysFromMonthStart(year, monthIndex, throughDay) {
  let count = 0;
  for (let d = 1; d <= throughDay; d++) {
    const date = new Date(year, monthIndex, d);
    if (date.getDay() !== 0) count++;
  }
  return count;
}

function countRemainingNonSundays(year, monthIndex, afterDay) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let d = afterDay + 1; d <= lastDay; d++) {
    const date = new Date(year, monthIndex, d);
    if (date.getDay() !== 0) count++;
  }
  return count;
}

/** Compact amount for target only: 200m, 15.5m, 850k, 120 */
function formatTarget(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const str = m >= 100 ? Math.round(m) : Number(m.toFixed(1));
    return `${sign}${str}m`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    const str = k >= 100 ? Math.round(k) : Number(k.toFixed(1));
    return `${sign}${str}k`;
  }
  return `${sign}${Math.round(abs)}`;
}

function formatFullAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) {
    return rounded.toLocaleString("en-US");
  }
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatRate(value) {
  if (!Number.isFinite(value) || value === Infinity) return "—";
  return formatFullAmount(value);
}

function reportRecordToText(record) {
  return buildReportText({
    name: record.name,
    day: record.day,
    monthName: record.monthName,
    year: record.year,
    target: record.target,
    sales: record.sales,
    mtd: record.mtd,
    bal: record.bal,
    salesDays: record.salesDays,
    remainingDays: record.remainingDays,
    curr: record.curr,
    rrr: record.rrr,
  });
}

function buildReportText({ name, day, monthName, year, target, sales, mtd, bal, salesDays, remainingDays, curr, rrr }) {
  return `*${name.trim()}*

 DAILY SALES REPORT ${day} -  ${monthName} - ${year} 

TGT      - ${formatTarget(target)} 
SALES  -  ${formatFullAmount(sales)}
MTD     -  ${formatFullAmount(mtd)}
BAL      -  ${formatFullAmount(bal)}
Sales days - ${salesDays}
Remaining days - ${remainingDays}
CURR   -  ${formatRate(curr)}
RRR      -  ${formatRate(rrr)}`;
}

const TAB_CONFIG = {
  calculator: { tab: tabCalculator, panel: panelCalculator },
  reports: { tab: tabReports, panel: panelReports },
  settings: { tab: tabSettings, panel: panelSettings },
};

function activateTab(which) {
  Object.entries(TAB_CONFIG).forEach(([id, { tab, panel }]) => {
    const active = id === which;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.classList.toggle("hidden", !active);
    panel.hidden = !active;
  });
  if (which === "reports") renderReportsList();
}

async function renderReportsList() {
  reportsListEl.innerHTML = "";
  let reports;
  try {
    reports = await getAllReports();
  } catch {
    showToast("Could not load reports");
    return;
  }

  reportsEmptyEl.classList.toggle("hidden", reports.length > 0);

  reports.forEach((record) => {
    const li = document.createElement("li");
    li.className = "report-item";
    li.dataset.dateKey = record.dateKey;

    const text = reportRecordToText(record);

    li.innerHTML = `
      <div class="report-item-summary">
        <div class="report-item-meta">
          <p class="report-item-date">${record.day} ${record.monthName} ${record.year}</p>
          <p class="report-item-stats">
            Sales ${formatFullAmount(record.sales)} · MTD ${formatFullAmount(record.mtd)} · BAL ${formatFullAmount(record.bal)}
          </p>
        </div>
        <div class="report-item-actions">
          <button type="button" class="btn-secondary btn-sm btn-view">View</button>
          <button type="button" class="btn-danger btn-sm btn-delete">Delete</button>
        </div>
      </div>
      <div class="report-item-detail hidden">
        <pre></pre>
        <button type="button" class="btn-secondary btn-sm btn-copy-saved">Copy</button>
      </div>
    `;

    li.querySelector("pre").textContent = text;

    const detail = li.querySelector(".report-item-detail");
    const viewBtn = li.querySelector(".btn-view");
    viewBtn.addEventListener("click", () => {
      const open = detail.classList.toggle("hidden");
      viewBtn.textContent = open ? "View" : "Hide";
    });

    li.querySelector(".btn-copy-saved").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied to clipboard");
      } catch {
        showToast("Copy failed");
      }
    });

    li.querySelector(".btn-delete").addEventListener("click", async () => {
      const label = `${record.day} ${record.monthName} ${record.year}`;
      if (!window.confirm(`Delete report for ${label}?`)) return;
      try {
        await deleteReport(record.dateKey);
        showToast("Report deleted");
        renderReportsList();
      } catch {
        showToast("Could not delete report");
      }
    });

    reportsListEl.appendChild(li);
  });
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.add("hidden"), 2200);
}

function fillMonthOptions(selectedIndex) {
  monthSelect.innerHTML = "";
  MONTHS.forEach((name, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = name;
    if (i === selectedIndex) opt.selected = true;
    monthSelect.appendChild(opt);
  });
}

function initDateFields() {
  const now = new Date();
  fillMonthOptions(now.getMonth());
  dayInput.value = String(now.getDate());
  yearInput.value = String(now.getFullYear());
}

async function loadSettingsIntoForm() {
  const [name, target] = await Promise.all([getSetting("name"), getSetting("target")]);
  if (name) nameInput.value = name;
  if (target != null && target !== "") targetInput.value = String(target);
}

async function computeAndSaveReport() {
  const name = nameInput.value.trim();
  const target = Number(targetInput.value);
  const sales = Number(salesInput.value);
  if (!name) throw new Error("Name is required.");
  if (!Number.isFinite(target) || target < 0) throw new Error("Enter a valid target.");
  if (!Number.isFinite(sales) || sales < 0) throw new Error("Enter a valid sales amount.");

  const { year, monthIndex, day } = parseReportDate();
  const dateKey = dateKeyFromParts(year, monthIndex, day);
  const yKey = yesterdayKey(year, monthIndex, day);
  const yesterday = await getReport(yKey);

  const yesterdayMtd = yesterday ? Number(yesterday.mtd) : 0;
  const mtd = yesterdayMtd + sales;
  const bal = target - mtd;

  const salesDays = countNonSundaysFromMonthStart(year, monthIndex, day);
  const remainingDays = countRemainingNonSundays(year, monthIndex, day);
  const curr = salesDays > 0 ? mtd / salesDays : NaN;
  const rrr = remainingDays > 0 ? bal / remainingDays : NaN;

  const monthName = MONTHS[monthIndex];
  const record = {
    dateKey,
    name,
    year,
    monthIndex,
    day,
    monthName,
    target,
    sales,
    mtd,
    bal,
    salesDays,
    remainingDays,
    curr,
    rrr,
    updatedAt: Date.now(),
  };

  await saveReport(record);
  await setSetting("name", name);
  await setSetting("target", target);

  const text = buildReportText({
    name,
    day,
    monthName,
    year,
    target,
    sales,
    mtd,
    bal,
    salesDays,
    remainingDays,
    curr,
    rrr,
  });

  return text;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const text = await computeAndSaveReport();
    reportTextEl.textContent = text;
    outputSection.classList.remove("hidden");
    showToast("Report saved");
    if (!panelReports.hidden) renderReportsList();
  } catch (err) {
    showToast(err.message || "Could not generate report");
  }
});

copyBtn.addEventListener("click", async () => {
  const text = reportTextEl.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
  } catch {
    showToast("Copy failed — select text manually");
  }
});

whatsappBtn.addEventListener("click", () => {
  const text = reportTextEl.textContent;
  if (!text) return;
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
});

monthSelect.addEventListener("change", () => {
  const year = Number(yearInput.value);
  const monthIndex = Number(monthSelect.value);
  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  dayInput.max = String(maxDay);
  if (Number(dayInput.value) > maxDay) dayInput.value = String(maxDay);
});

yearInput.addEventListener("change", () => {
  monthSelect.dispatchEvent(new Event("change"));
});

tabCalculator.addEventListener("click", () => activateTab("calculator"));
tabReports.addEventListener("click", () => activateTab("reports"));
tabSettings.addEventListener("click", () => activateTab("settings"));
refreshReportsBtn.addEventListener("click", () => renderReportsList());

exportBackupBtn.addEventListener("click", async () => {
  try {
    await exportBackup();
  } catch {
    showToast("Export failed");
  }
});

importPickBtn.addEventListener("click", () => importFileInput.click());

importFileInput.addEventListener("change", () => {
  const file = importFileInput.files?.[0];
  if (!file) {
    resetImportFileUi();
    return;
  }
  pendingImportFile = file;
  importFileNameEl.textContent = file.name;
  importBackupBtn.disabled = false;
});

importBackupBtn.addEventListener("click", async () => {
  if (!pendingImportFile) return;
  const replace = importReplaceCheckbox.checked;
  const message = replace
    ? "Replace all saved reports and settings with this backup?"
    : "Merge this backup into your existing data?";
  if (!window.confirm(message)) return;
  try {
    await importBackupFromFile(pendingImportFile, replace);
    showToast(replace ? "Backup restored" : "Backup merged");
    resetImportFileUi();
  } catch (err) {
    showToast(err.message || "Import failed");
  }
});

initDateFields();
monthSelect.dispatchEvent(new Event("change"));
openDb()
  .then(loadSettingsIntoForm)
  .catch(() => showToast("IndexedDB unavailable"));
