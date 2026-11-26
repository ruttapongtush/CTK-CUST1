// เปลี่ยนเป็น Web App URL ของคุณที่ลงท้ายด้วย /exec
const API_URL = "https://script.google.com/macros/s/AKfycbyp94qwphKaL8fMnOq6RFfI6fqhTKq2lK8baDyVNbgunkHQrwAZiZ0ZRLdzBfBDN5WE/exec";
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

async function fetchFromSheet() {
  const panel = document.getElementById("customerDetailPanel");
  panel.innerHTML = `<div class="card empty-state">กำลังโหลดข้อมูลจาก Google Sheets...</div>`;

  try {
    const res = await fetch(`${API_URL}?t=${Date.now()}`, { redirect: "follow" });
    const data = await res.json();
    customersData = Array.isArray(data) ? data : [];

    if (!selectedCustomerId && customersData.length > 0) {
      selectedCustomerId = customersData[0].customerId;
    }
    renderAll();
  } catch (err) {
    panel.innerHTML = `
      <div class="card" style="color:#b91c1c;">
        <strong>เชื่อมต่อ Google Sheets ไม่สำเร็จ:</strong> ${err.message}
      </div>
    `;
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
            productName: item.productName || item.productType || item.model,
            model: item.model,
            ip: item.ip,
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
          <a href="#" onclick="selectCustomer('${w.customerId}'); return false;"><b>${w.customerName}</b></a>
          (บิล <code>${w.receiptNo}</code>) — ${w.productName} (${w.model || "-"})
          ${w.ip ? `[IP: <code>${w.ip}</code>]` : ""} :
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
      String(c.phone || "").toLowerCase().includes(kw);

    const hitInvoiceOrItem = (c.receipts || []).some(r =>
      String(r.receiptNo || "").toLowerCase().includes(kw) ||
      String(r.jobTitle || "").toLowerCase().includes(kw) ||
      (r.items || []).some(item =>
        String(item.productName || "").toLowerCase().includes(kw) ||
        String(item.model || "").toLowerCase().includes(kw) ||
        String(item.serialNo || "").toLowerCase().includes(kw) ||
        String(item.ip || "").toLowerCase().includes(kw) ||
        String(item.note || "").toLowerCase().includes(kw)
      )
    );

    return hitCustomer || hitInvoiceOrItem;
  });
}

function renderCustomerList(filtered) {
  const listEl = document.getElementById("customerList");
  const countEl = document.getElementById("customerCount");
  countEl.textContent = String(filtered.length);

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state">ไม่พบลูกค้าที่ตรงกับคำค้นหา</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const activeClass = c.customerId === selectedCustomerId ? "active" : "";
    const invCount = (c.receipts || []).length;
    return `
      <button type="button" class="customer-item ${activeClass}" onclick="selectCustomer('${c.customerId}')">
        <div class="customer-item-name">${c.customerName || "-"}</div>
        <div class="customer-item-meta">${c.customerId || ""} · ${invCount} บิล · ${c.address || "-"}</div>
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
}

async function addMaintenance(customerId, receiptNo, itemId, btnEl) {
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
          <h2 style="margin:0;color:#1e3a8a;">${current.customerName || "-"}</h2>
          <div class="cust-meta-grid">
            <div><strong>รหัสลูกค้า:</strong> ${current.customerId || "-"}</div>
            <div><strong>เลขภาษี:</strong> ${current.taxId || "-"}</div>
            <div><strong>โทร:</strong> ${current.phone || "-"}</div>
            <div><strong>ที่อยู่:</strong> ${current.address || "-"}</div>
          </div>
          ${current.note ? `<div style="margin-top:6px;font-size:13px;color:#475569;"><strong>หมายเหตุ:</strong> ${current.note}</div>` : ""}
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm"
            onclick="openDiagramModal('customer', '${current.customerId}', '${escapeAttr(current.customerName)}', '', '${escapeAttr(current.masterDiagramPdf || "")}')">
            + เพิ่ม/แก้ Diagram (PDF)
          </button>
          ${current.masterDiagramPdf
            ? `<a href="${current.masterDiagramPdf}" target="_blank" rel="noopener noreferrer" class="btn btn-success btn-sm">เปิดผังลูกค้า (PDF)</a>`
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
                <strong>เลขที่บิล: ${r.receiptNo || "-"}</strong>
                ${r.jobTitle ? `— <span>${r.jobTitle}</span>` : ""}
                ${r.issueDate ? `<span class="pill" style="margin-left:6px;">วันที่: ${formatDateISO(r.issueDate)}</span>` : ""}
              </div>

              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                <button type="button" class="btn btn-secondary btn-sm"
                  onclick="openDiagramModal('receipt', '${current.customerId}', '${escapeAttr(current.customerName)}', '${escapeAttr(r.receiptNo)}', '${escapeAttr(r.diagramPdf || "")}')">
                  + Diagram บิล
                </button>
                ${r.diagramPdf
                  ? `<a href="${r.diagramPdf}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">ดู Diagram บิล (PDF)</a>`
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

                    return `
                      <tr>
                        <td>${item.productName || item.productType || "-"}</td>
                        <td>${item.model || "-"}</td>
                        <td>${item.serialNo || "-"}</td>
                        <td><code>${item.ip || "-"}</code></td>
                        <td>${formatDateISO(item.warrantyEnd)}<br/>${badge}</td>
                        <td>${Number(item.price || 0).toLocaleString("th-TH")}</td>
                        <td>${item.distributor || "-"}</td>
                        <td>
                          <div>${item.note || "-"}</div>
                          <ul class="maint-list">
                            ${logs.length
                              ? logs.map(m => `<li><b>${formatDateISO(m.date)}:</b> ${m.detail}</li>`).join("")
                              : "<li>ยังไม่มีประวัติการซ่อมแซม</li>"}
                          </ul>
                          <div class="maint-form">
                            <input type="date" id="mDate_${item.id}" />
                            <input type="text" id="mDetail_${item.id}" placeholder="เช่น กล้องตัวที่ 1 adapter เสีย วันที่เปลี่ยน..." />
                            <button type="button" class="btn btn-primary btn-sm"
                              onclick="addMaintenance('${current.customerId}', '${r.receiptNo}', '${item.id}', this)">
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

function escapeAttr(str) {
  return String(str || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function renderAll() {
  renderExpiryAlert();
  const filtered = getFilteredCustomers();
  renderCustomerList(filtered);
  renderCustomerDetail(filtered);
}

fetchFromSheet();
