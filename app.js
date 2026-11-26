const RAW_API_URL = "https://docs.google.com/spreadsheets/d/15mFEwfDx5fujaZjzfki-BpY4UMimusHjKTqiIbBK1hw/edit?gid=53403992#gid=53403992";
const WARN_DAYS = 30;
let cachedCustomers = [];

// แปลงวันที่ทุกรูปแบบให้เป็น YYYY-MM-DD และคำนวณจำนวนวันคงเหลือให้แม่นยำ
function parseCleanDate(dateVal) {
  if (!dateVal) return null;
  const str = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime())) {
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  return null;
}

function formatDateThaiISO(dateVal) {
  const dt = parseCleanDate(dateVal);
  if (!dt) return "-";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysUntil(dateVal) {
  const target = parseCleanDate(dateVal);
  if (!target) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

async function fetchFromSheet() {
  const container = document.getElementById("recordsContainer");
  container.innerHTML = `<div class="card">กำลังโหลดข้อมูลลูกค้าและบิลจาก Google Sheets...</div>`;

  try {
    const res = await fetch(`${RAW_API_URL}?t=${Date.now()}`, { redirect: "follow" });
    const data = await res.json();
    cachedCustomers = Array.isArray(data) ? data : [];
    renderAll();
  } catch (err) {
    container.innerHTML = `<div class="card" style="color:#b91c1c;">เชื่อมต่อ Google Sheets ไม่สำเร็จ: ${err.message}</div>`;
  }
}

async function addMaintenance(customerId, receiptNo, itemId, btnEl) {
  const dateInput = document.getElementById(`mDate_${itemId}`);
  const detailInput = document.getElementById(`mDetail_${itemId}`);
  const dateVal = dateInput ? dateInput.value : "";
  const detailVal = detailInput ? detailInput.value.trim() : "";

  if (!dateVal || !detailVal) {
    alert("กรุณากรอกวันที่ซ่อม/เปลี่ยน และรายละเอียดอาการเสีย");
    return;
  }

  btnEl.disabled = true;
  btnEl.textContent = "กำลังบันทึก...";

  try {
    await fetch(RAW_API_URL, {
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
    await fetchFromSheet();
  } catch (err) {
    alert("บันทึกไม่สำเร็จ: " + err.message);
    btnEl.disabled = false;
    btnEl.textContent = "+ บันทึกซ่อม";
  }
}

function renderAlerts(customers) {
  const box = document.getElementById("warrantyAlerts");
  const warnings = [];

  customers.forEach(c => {
    (c.receipts || []).forEach(r => {
      (r.items || []).forEach(item => {
        const rem = daysUntil(item.warrantyEnd);
        if (rem <= WARN_DAYS) {
          warnings.push({
            customerName: c.customerName,
            receiptNo: r.receiptNo,
            model: item.model,
            ip: item.ip,
            warrantyEnd: formatDateThaiISO(item.warrantyEnd),
            rem
          });
        }
      });
    });
  });

  if (warnings.length === 0) {
    box.innerHTML = `<strong>สถานะประกัน:</strong> ไม่มีอุปกรณ์ที่ใกล้หมดอายุภายใน ${WARN_DAYS} วัน`;
    return;
  }

  box.innerHTML = `
    <strong>แจ้งเตือนประกันใกล้หมดอายุ / หมดอายุแล้ว (${warnings.length} รายการ):</strong>
    <ul style="margin:8px 0 0; padding-left:20px;">
      ${warnings.map(w => `
        <li>
          <b>${w.customerName}</b> (บิล: ${w.receiptNo}) — <code>${w.model}</code> [IP: ${w.ip}]
          หมดประกัน <b>${w.warrantyEnd}</b>
          (${w.rem < 0 ? `เกินมา ${Math.abs(w.rem)} วัน` : `เหลืออีก ${w.rem} วัน`})
        </li>
      `).join("")}
    </ul>
  `;
}

function renderAll() {
  const kw = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  renderAlerts(cachedCustomers);

  const container = document.getElementById("recordsContainer");
  const filtered = cachedCustomers.filter(c => {
    const matchCust =
      String(c.customerName || "").toLowerCase().includes(kw) ||
      String(c.address || "").toLowerCase().includes(kw) ||
      String(c.phone || "").toLowerCase().includes(kw);

    const matchRecOrItem = (c.receipts || []).some(r =>
      String(r.receiptNo || "").toLowerCase().includes(kw) ||
      (r.items || []).some(i =>
        String(i.model || "").toLowerCase().includes(kw) ||
        String(i.ip || "").toLowerCase().includes(kw) ||
        String(i.note || "").toLowerCase().includes(kw)
      )
    );
    return !kw || matchCust || matchRecOrItem;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="card">ไม่พบข้อมูลลูกค้าหรือบิลที่ค้นหา</div>`;
    return;
  }

  container.innerHTML = filtered.map(c => `
    <div class="card" style="border-top: 4px solid #2563eb;">
      <!-- ส่วนหัว: ชื่อลูกค้าเป็นคีย์หลัก -->
      <div class="row-flex" style="justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 14px;">
        <div>
          <h2 style="margin:0 0 4px; color:#1e3a8a;">${c.customerName}</h2>
          <div style="color:#4b5563; font-size:14px;">ที่อยู่: ${c.address || "-"} ${c.phone ? `| โทร: ${c.phone}` : ""}</div>
        </div>
        <div class="row-flex">
          ${c.masterDiagramPdf
            ? `<a href="${c.masterDiagramPdf}" target="_blank" style="background:#eff6ff; color:#1d4ed8; padding:6px 12px; border-radius:6px; text-decoration:none; font-weight:600;">ผังรวมลูกค้า (PDF)</a>`
            : ""}
          <span style="background:#f1f5f9; padding:6px 10px; border-radius:6px; font-size:13px;">
            จำนวนบิลทั้งหมด: <b>${(c.receipts || []).length}</b> บิล
          </span>
        </div>
      </div>

      <!-- รายการบิลต่างๆ ของลูกค้าคนนี้ (เช่น Invoice1234, Invoice5678) -->
      ${(c.receipts || []).length === 0
        ? `<div style="color:#6b7280;">ยังไม่มีรายการบิลของลูกค้ารายนี้</div>`
        : (c.receipts || []).map(r => `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:14px;">
            <div class="row-flex" style="justify-content: space-between; margin-bottom:8px;">
              <div>
                <strong style="font-size:16px; color:#0f172a;">บิลเลขที่: ${r.receiptNo}</strong>
                ${r.issueDate ? `<span style="color:#64748b; font-size:13px; margin-left:8px;">(วันที่: ${r.issueDate})</span>` : ""}
                ${r.note ? `<div style="font-size:13px; color:#475569;">รายละเอียดงาน: ${r.note}</div>` : ""}
              </div>
              <div>
                ${r.diagramPdf
                  ? `<a href="${r.diagramPdf}" target="_blank" style="background:#16a34a; color:#fff; padding:5px 10px; border-radius:6px; text-decoration:none; font-size:13px; font-weight:600;">เปิด Diagram บิลนี้ (PDF)</a>`
                  : `<span style="color:#9ca3af; font-size:13px;">ไม่มี Diagram บิลนี้</span>`}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>Model</th>
                  <th>IP</th>
                  <th>วันหมดประกัน & สถานะ</th>
                  <th>ราคา</th>
                  <th>Distributor</th>
                  <th>หมายเหตุ & บันทึกการซ่อม</th>
                </tr>
              </thead>
              <tbody>
                ${(r.items || []).map(item => {
                  const rem = daysUntil(item.warrantyEnd);
                  const cleanEnd = formatDateThaiISO(item.warrantyEnd);
                  const statusBadge = rem <= WARN_DAYS
                    ? `<span class="badge-warn">${rem < 0 ? "หมดอายุแล้ว" : `เหลือ ${rem} วัน`}</span>`
                    : `<span class="badge-ok">ปกติ (เหลือ ${rem} วัน)</span>`;

                  return `
                    <tr>
                      <td>${item.productType || "-"}</td>
                      <td>${item.model || "-"}</td>
                      <td><code>${item.ip || "-"}</code></td>
                      <td>${cleanEnd}<br/>${statusBadge}</td>
                      <td>${Number(item.price || 0).toLocaleString()}</td>
                      <td>${item.distributor || "-"}</td>
                      <td>
                        <div>${item.note || "-"}</div>
                        <ul class="maint-list">
                          ${(item.maintenance || []).length
                            ? item.maintenance.map(m => `<li><b>${formatDateThaiISO(m.date)}:</b> ${m.detail}</li>`).join("")
                            : "<li>ยังไม่มีประวัติซ่อมบำรุง</li>"}
                        </ul>
                        <div class="row-flex" style="margin-top:8px;">
                          <input type="date" id="mDate_${item.id}" />
                          <input type="text" id="mDetail_${item.id}" placeholder="เช่น กล้องตัวที่ 1 adapter เสีย วันที่เปลี่ยน..." style="min-width:210px;" />
                          <button onclick="addMaintenance('${c.customerId}', '${r.receiptNo}', '${item.id}', this)">+ บันทึกซ่อม</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        `).join("")}
    </div>
  `).join("");
}

fetchFromSheet();
