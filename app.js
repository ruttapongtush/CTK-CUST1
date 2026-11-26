// เปลี่ยนเป็น Web App URL ของคุณที่ลงท้ายด้วย /exec (จากหน้า Manage deployments ของ Apps Script)
const API_URL = "https://script.google.com/macros/s/AKfycbziGhvpuP0QmvRBswNNjBFpSfVkP_97yXKwXjLGkIVlNq6DLZzZsc4mYM7E5BRd6FgN/exec";
const WARN_DAYS = 30;

let customersData = [];
let selectedCustomerId = null;

function parseCleanDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const mThai = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mThai) {
    const day = Number(mThai[1]);
    const month = Number(mThai[2]);
    let year = Number(mThai[3]);
    if (year > 2400) year -= 543;
    return new Date(year, month - 1, day);
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  return null;
}

function formatDateISO(val) {
  const dt = parseCleanDate(val);
  if (!dt) return "-";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calcDaysLeft(endDateVal) {
  const target = parseCleanDate(endDateVal);
  if (!target) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function escapeAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function fetchFromSheet() {
  const panel = document.getElementById("customerDetailPanel");
  if (panel) {
    panel.innerHTML = `<div class="card empty-state">กำลังโหลดข้อมูลจาก Google Sheets...</div>`;
  }

  try {
    if (!API_URL || API_URL.includes("วาง_DEPLOYMENT_ID_ของคุณที่นี่")) {
      throw new Error("ยังไม่ได้ตั้งค่า API_URL ที่ลงท้ายด้วย /exec ในไฟล์ app.js");
    }
    if (API_URL.includes("script.googleusercontent.com/macros/echo")) {
      throw new Error("กรุณาใช้ URL ที่ลงท้ายด้วย /exec จากหน้า Manage deployments แทนลิงก์ /echo");
    }

    const res = await fetch(`${API_URL}?t=${Date.now()}`, {
      method: "GET",
      redirect: "follow"
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Google Apps Script ส่งค่ากลับมาไม่ใช่ JSON (ตรวจสิทธิ์ Who has access เป็น Anyone และชื่อแท็บใน Sheet)");
    }

    if (!Array.isArray(data)) {
      throw new Error(data.message || "รูปแบบข้อมูลจาก Google Sheets ไม่ถูกต้อง");
    }

    customersData = data;
    if (!selectedCustomerId && customersData.length > 0) {
      selectedCustomerId = customersData[0].customerId;
    }
    renderAll();
  } catch (err) {
    if (panel) {
      panel.innerHTML = `
        <div class="card" style="color:#b91c1c;">
          <strong>เชื่อมต่อ Google Sheets ไม่สำเร็จ:</strong> ${err.message}
          <div style="margin-top:10px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="fetchFromSheet()">ลองใหม่</button>
          </div>
        </div>
      `;
    }
  }
}

function getExpiringItems() {
  const list = [];
  customersData.forEach(c => {
    (c.receipts || []).forEach(r => {
      (r.items || []).forEach(item => {
        const daysLeft = calcDaysLeft(item.warrantyEnd);
        if (daysLeft <= WARN_DAYS) {
          list.push({
            customerId: c.customerId,
            customerName: c.customerName,
            receiptNo: r.receiptNo,
            productName: item.productName || item.productType || item.model || "-",
            model: item.model || "-",
            serialNo: item.serialNo || "",
            ip: item.ip || "",
            warrantyEnd: formatDateISO(item.warrantyEnd),
            daysLeft
          });
        }
      });
    });
  });
  return list;
}

function renderExpiryAlert() {
  const box = document.getElementById("expiryAlertBox");
  if (!box) return;

  const expiring = getExpiringItems();
  if (expiring.length === 0) {
    box.innerHTML = `<strong>แจ้งเตือนประกันสินค้า:</strong> ไม่มีสินค้าใกล้หมดอายุภายใน ${WARN_DAYS} วัน`;
    return;
  }

  box.innerHTML = `
    <strong>แจ้งเตือนสินค้าใกล้หมดอายุ / หมดอายุแล้ว (${expiring.length} รายการ):</strong>
    <ul style="margin:6px 0 0;padding-left:20px;">
      ${expiring.map(w => `
        <li>
          <a href="#" onclick="selectCustomer('${escapeAttr(w.customerId)}'); return false;"><b>${escapeAttr(w.customerName)}</b></a>
          (บิล <code>${escapeAttr(w.receiptNo)}</code>) — ${escapeAttr(w.productName)}
          ${w.serialNo ? `[S/N: <code>${escapeAttr(w.serialNo)}</code>]` : ""}
          ${w.ip ? `[IP: <code>${escapeAttr(w.ip)}</code>]` : ""} :
          ${w.daysLeft < 0
            ? `<span style="color:#b91c1c;font-weight:700;">หมดประกันแล้ว (${Math.abs(w.daysLeft)} วัน)</span>`
            : `<span style="color:#c2410c;font-weight:700;">เหลืออีก ${w.daysLeft} วัน</span>`}
          (${w.warrantyEnd})
        </li>
      `).join("")}
    </ul>
  `;
}

function selectCustomer(customerId) {
  selectedCustomerId = customerId;
  renderAll();
}

function getFilteredCustomers() {
  const kw = (document.getElementById("globalSearch")?.value || "").trim().toLowerCase();
  if (!kw) return customersData;

  return customersData.filter(c => {
    const hitCustomer =
      String(c.customerId || "").toLowerCase().includes(kw) ||
      String(c.customerName || "").toLowerCase().includes(kw) ||
      String(c.address || "").toLowerCase().includes(kw) ||
      String(c.phone || "").toLowerCase().includes(kw) ||
      String(c.note || "").toLowerCase().includes(kw);

    const hitInvoiceOrItem = (c.receipts || []).some(r =>
      String(r.receiptNo || "").toLowerCase().includes(kw) ||
      String(r.jobTitle || "").toLowerCase().includes(kw) ||
      String(r.note || "").toLowerCase().includes(kw) ||
      (r.items || []).some(item =>
        String(item.productName || "").toLowerCase().includes(kw) ||
        String(item.model || "").toLowerCase().includes(kw) ||
        String(item.serialNo || "").toLowerCase().includes(kw) ||
        String(item.ip || "").toLowerCase().includes(kw) ||
        String(item.distributor || "").toLowerCase().includes(kw) ||
        String(item.note || "").toLowerCase().includes(kw)
      )
    );

    return hitCustomer || hitInvoiceOrItem;
  });
}

function renderCustomerList(filtered) {
  const listEl = document.getElementById("customerList");
  const countEl = document.getElementById("customerCount");
  if (countEl) countEl.textContent = String(filtered.length);
  if (!listEl) return;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state">ไม่พบลูกค้าที่ตรงกับคำค้นหา</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const activeClass = c.customerId === selectedCustomerId ? "active" : "";
    const invCount = (c.receipts || []).length;
    return `
      <button type="button" class="customer-item ${activeClass}" onclick="selectCustomer('${escapeAttr(c.customerId)}')">
        <div class="customer-item-name">${escapeAttr(c.customerName || "-")}</div>
        <div class="customer-item-meta">${escapeAttr(c.customerId || "")} · ${invCount} บิล · ${escapeAttr(c.address || "-")}</div>
      </button>
    `;
  }).join("");
}

function openDiagramModal(scope, customerId, customerName, receiptNo = "", currentPdf = "") {
  document.getElementById("diagScope").value = scope;
  document.getElementById("diagCustomerId").value = customerId;
  document.getElementById("diagReceiptNo").value = receiptNo;
  document.getElementById("diagTargetLabel").value =
    scope === "receipt" ? `${customerName} — บิล ${receiptNo}` : `${customerName} (ผังรวมลูกค้า)`;
  document.getElementById("diagPdfUrl").value = currentPdf || "";
  document.getElementById("diagramModal").showModal();
}

function closeDiagramModal() {
  document.getElementById("diagramModal").close();
}

async function handleSaveDiagram(e) {
  e.preventDefault();
  const scope = document.getElementById("diagScope").value;
  const customerId = document.getElementById("diagCustomerId").value;
  const receiptNo = document.getElementById("diagReceiptNo").value;
  const diagramPdf = document.getElementById("diagPdfUrl").value.trim();
  if (!diagramPdf) return;

  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify({
        action: scope === "receipt" ? "updateReceiptDiagram" : "updateCustomerDiagram",
        customerId,
        receiptNo,
        diagramPdf
      })
    });

    closeDiagramModal();
    await fetchFromSheet();
  } catch (err) {
    alert("บันทึก Diagram ไม่สำเร็จ: " + err.message);
  }
}

async function addMaintenance(customerId, receiptNo, itemId, productName, serialNo, ip, btnEl) {
  const dateEl = document.getElementById(`mDate_${itemId}`);
  const detailEl = document.getElementById(`mDetail_${itemId}`);
  const dateVal = dateEl ? dateEl.value : "";
  const detailVal = detailEl ? detailEl.value.trim() : "";

  if (!dateVal || !detailVal) {
    alert("กรุณากรอกวันที่ซ่อม/เปลี่ยน และรายละเอียดอาการเสีย");
    return;
  }

  const prevLabel = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "กำลังบันทึก...";

  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify({
        action: "addMaintenance",
        customerId,
        receiptNo,
        itemId,
        productName,
        serialNo,
        ip,
        date: dateVal,
        detail: detailVal
      })
    });

    if (detailEl) detailEl.value = "";
    await fetchFromSheet();
  } catch (err) {
    alert("บันทึกไม่สำเร็จ: " + err.message);
    btnEl.disabled = false;
    btnEl.textContent = prevLabel;
  }
}

function renderCustomerDetail(filtered) {
  const panel = document.getElementById("customerDetailPanel");
  if (!panel) return;

  if (filtered.length === 0) {
    panel.innerHTML = `<div class="card empty-state">ไม่พบข้อมูลลูกค้าหรือบิลที่ค้นหา</div>`;
    return;
  }

  const current =
    filtered.find(c => c.customerId === selectedCustomerId) || filtered[0];
  selectedCustomerId = current.customerId;

  const receipts = current.receipts || [];

  panel.innerHTML = `
    <div class="card">
      <div class="cust-header">
        <div>
          <h2 style="margin:0;color:#1e3a8a;">${escapeAttr(current.customerName || "-")}</h2>
          <div class="cust-meta-grid">
            <div><strong>รหัสลูกค้า:</strong> ${escapeAttr(current.customerId || "-")}</div>
            <div><strong>เลขภาษี:</strong> ${escapeAttr(current.taxId || "-")}</div>
            <div><strong>โทร:</strong> ${escapeAttr(current.phone || "-")}</div>
            <div><strong>ที่อยู่:</strong> ${escapeAttr(current.address || "-")}</div>
          </div>
          ${current.note ? `<div style="margin-top:6px;font-size:13px;color:#475569;"><strong>หมายเหตุ:</strong> ${escapeAttr(current.note)}</div>` : ""}
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm"
            onclick="openDiagramModal('customer', '${escapeAttr(current.customerId)}', '${escapeAttr(current.customerName)}', '', '${escapeAttr(current.masterDiagramPdf || "")}')">
            + เพิ่ม/แก้ Diagram (PDF)
          </button>
          ${current.masterDiagramPdf
            ? `<a href="${escapeAttr(current.masterDiagramPdf)}" target="_blank" rel="noopener noreferrer" class="btn btn-success btn-sm">เปิดผังลูกค้า (PDF)</a>`
            : `<span class="pill">ยังไม่มี Diagram ลูกค้า</span>`}
        </div>
      </div>

      <h3 style="margin:0 0 12px;">Invoices / งานติดตั้ง (${receipts.length} บิล)</h3>

      ${receipts.length === 0
        ? `<div class="empty-state">ยังไม่มีรายการบิลสำหรับลูกค้ารายนี้</div>`
        : receipts.map(r => `
          <div class="invoice-box">
            <div class="invoice-head">
              <div>
                <strong>เลขที่บิล: ${escapeAttr(r.receiptNo || "-")}</strong>
                ${r.jobTitle ? `— <span>${escapeAttr(r.jobTitle)}</span>` : ""}
                ${r.issueDate ? `<span class="pill" style="margin-left:6px;">วันที่: ${formatDateISO(r.issueDate)}</span>` : ""}
              </div>

              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                <button type="button" class="btn btn-secondary btn-sm"
                  onclick="openDiagramModal('receipt', '${escapeAttr(current.customerId)}', '${escapeAttr(current.customerName)}', '${escapeAttr(r.receiptNo)}', '${escapeAttr(r.diagramPdf || "")}')">
                  + Diagram บิล
                </button>
                ${r.diagramPdf
                  ? `<a href="${escapeAttr(r.diagramPdf)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">ดู Diagram บิล (PDF)</a>`
                  : `<span style="font-size:12px;color:#94a3b8;">ไม่มีไฟล์ PDF บิลนี้</span>`}
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th>Model</th>
                    <th>S/N</th>
                    <th>IP</th>
                    <th>วันหมดประกัน & สถานะ</th>
                    <th>ราคา</th>
                    <th>Distributor</th>
                    <th>หมายเหตุ & ประวัติการซ่อมแซม</th>
                  </tr>
                </thead>
                <tbody>
                  ${(r.items || []).map(item => {
                    const daysLeft = calcDaysLeft(item.warrantyEnd);
                    const badge = daysLeft <= WARN_DAYS
                      ? `<span class="badge-warn">${daysLeft < 0 ? "หมดอายุแล้ว" : `ใกล้หมดอายุ (${daysLeft} วัน)`}</span>`
                      : `<span class="badge-ok">ปกติ (เหลือ ${daysLeft} วัน)</span>`;
                    const logs = item.maintenance || [];
                    const safeItemId = escapeAttr(item.id);
                    const prodLabel = item.productName || item.productType || item.model || "-";

                    return `
                      <tr>
                        <td>${escapeAttr(prodLabel)}</td>
                        <td>${escapeAttr(item.model || "-")}</td>
                        <td>${escapeAttr(item.serialNo || "-")}</td>
                        <td><code>${escapeAttr(item.ip || "-")}</code></td>
                        <td>${formatDateISO(item.warrantyEnd)}<br/>${badge}</td>
                        <td>${Number(item.price || 0).toLocaleString("th-TH")}</td>
                        <td>${escapeAttr(item.distributor || "-")}</td>
                        <td>
                          <div>${escapeAttr(item.note || "-")}</div>
                          <ul class="maint-list">
                            ${logs.length
                              ? logs.map(m => `<li><b>${formatDateISO(m.date)}:</b> ${escapeAttr(m.detail)}</li>`).join("")
                              : "<li>ยังไม่มีประวัติการซ่อมแซม</li>"}
                          </ul>
                          <div class="maint-form">
                            <input type="date" id="mDate_${safeItemId}" />
                            <input type="text" id="mDetail_${safeItemId}" placeholder="เช่น กล้องตัวที่ 1 adapter เสีย วันที่เปลี่ยน..." />
                            <button type="button" class="btn btn-primary btn-sm"
                              onclick="addMaintenance('${escapeAttr(current.customerId)}', '${escapeAttr(r.receiptNo)}', '${safeItemId}', '${escapeAttr(prodLabel)}', '${escapeAttr(item.serialNo || "")}', '${escapeAttr(item.ip || "")}', this)">
                              + บันทึกซ่อม
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        `).join("")}
    </div>
  `;
}

function renderAll() {
  renderExpiryAlert();
  const filtered = getFilteredCustomers();
  renderCustomerList(filtered);
  renderCustomerDetail(filtered);
}

fetchFromSheet();
