// วาง Web App URL ที่ได้จากการ Deploy Apps Script (ต้องลงท้ายด้วย /exec)
// ตัวอย่าง: "https://script.google.com/macros/s/AKfycbyp94qwphKaL8fMnO6RfFl6fqhTKq2lK8.../exec"
const RAW_API_URL = "https://script.google.com/macros/s/AKfycbyp94qwphKaL8fMnOq6RFfI6fqhTKq2lK8baDyVNbgunkHQrwAZiZ0ZRLdzBfBDN5WE/exec";

function normalizeWebAppUrl(url) {
  const trimmed = (url || "").trim();
  // หากเผลอวางลิงก์จากหน้ารีไดเรกต์ script.googleusercontent.com/macros/echo ให้แจ้งเตือนชัดเจน
  if (trimmed.includes("script.googleusercontent.com/macros/echo")) {
    throw new Error(
      "URL ไม่ถูกต้อง: กรุณาใช้ลิงก์ Web App ที่ลงท้ายด้วย /exec จากหน้า Manage deployments แทนลิงก์ /echo"
    );
  }
  return trimmed;
}

const WARN_DAYS = 30;
let cachedData = [];

function daysUntil(dateStr) {
  if (!dateStr) return 9999;
  const cleanDate = String(dateStr).trim().slice(0, 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(cleanDate + "T00:00:00");
  if (Number.isNaN(target.getTime())) return 9999;
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function formatMoney(amount) {
  const num = Number(amount);
  return Number.isFinite(num) ? num.toLocaleString("th-TH") : "0";
}

async function fetchFromSheet() {
  const container = document.getElementById("recordsContainer");
  container.innerHTML = `<div class="card">กำลังโหลดข้อมูลจาก Google Sheets...</div>`;

  try {
    const apiUrl = normalizeWebAppUrl(RAW_API_URL);
    if (!apiUrl || apiUrl.includes("วาง_DEPLOYMENT_ID_ของคุณที่นี่")) {
      throw new Error("ยังไม่ได้ตั้งค่า API_URL ที่ลงท้ายด้วย /exec ในไฟล์ app.js");
    }

    const res = await fetch(`${apiUrl}?t=${Date.now()}`, {
      method: "GET",
      redirect: "follow"
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        "Google Apps Script ส่งข้อมูลกลับมาไม่ใช่ JSON (อาจยังไม่ได้ตั้งสิทธิ์ Who has access เป็น Anyone หรือชื่อแท็บ Receipts/Equipment/Maintenance ไม่ตรง)"
      );
    }

    if (!Array.isArray(json)) {
      throw new Error(json.message || "รูปแบบข้อมูลจาก Google Sheets ไม่ถูกต้อง");
    }

    cachedData = json;
    renderAll();
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="color:#b91c1c;">
        <strong>เชื่อมต่อ Google Sheets ไม่สำเร็จ:</strong> ${err.message}
        <div style="margin-top:10px;">
          <button onclick="fetchFromSheet()">ลองเชื่อมต่อใหม่</button>
        </div>
      </div>
    `;
  }
}

async function addMaintenance(receiptNo, itemId, btnEl) {
  const dateInput = document.getElementById(`mDate_${itemId}`);
  const detailInput = document.getElementById(`mDetail_${itemId}`);
  const dateVal = dateInput ? dateInput.value : "";
  const detailVal = detailInput ? detailInput.value.trim() : "";

  if (!dateVal || !detailVal) {
    alert("กรุณากรอกวันที่เปลี่ยน/ซ่อม และรายละเอียดอาการเสีย");
    return;
  }

  const originalText = btnEl ? btnEl.textContent : "+ บันทึกซ่อม";
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = "กำลังบันทึก...";
  }

  try {
    const apiUrl = normalizeWebAppUrl(RAW_API_URL);
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify({
        action: "addMaintenance",
        receiptNo: receiptNo,
        itemId: itemId,
        date: dateVal,
        detail: detailVal
      })
    });

    const text = await res.text();
    try {
      const result = JSON.parse(text);
      if (result.status && result.status !== "success") {
        throw new Error(result.message || "บันทึกไม่สำเร็จ");
      }
    } catch {
      // บางกรณี redirect ของ Apps Script อาจคืนค่าไม่เป็น JSON แต่บันทึกสำเร็จแล้ว
    }

    if (detailInput) detailInput.value = "";
    await fetchFromSheet();
  } catch (err) {
    alert("บันทึกไม่สำเร็จ: " + err.message);
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = originalText;
    }
  }
}

function renderAlerts(data) {
  const box = document.getElementById("warrantyAlerts");
  const warnings = [];

  data.forEach(r => {
    (r.items || []).forEach(item => {
      const rem = daysUntil(item.warrantyEnd);
      if (rem <= WARN_DAYS) {
        warnings.push({
          receiptNo: r.receiptNo || "-",
          customerName: r.customerName || "-",
          model: item.model || "-",
          ip: item.ip || "-",
          warrantyEnd: item.warrantyEnd || "-",
          rem
        });
      }
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
  const searchEl = document.getElementById("searchInput");
  const kw = searchEl ? searchEl.value.trim().toLowerCase() : "";
  renderAlerts(cachedData);

  const container = document.getElementById("recordsContainer");
  const filtered = cachedData.filter(r => {
    const items = r.items || [];
    const matchReceipt =
      String(r.receiptNo || "").toLowerCase().includes(kw) ||
      String(r.customerName || "").toLowerCase().includes(kw) ||
      String(r.address || "").toLowerCase().includes(kw);

    const matchItem = items.some(i =>
      String(i.model || "").toLowerCase().includes(kw) ||
      String(i.ip || "").toLowerCase().includes(kw) ||
      String(i.note || "").toLowerCase().includes(kw) ||
      String(i.productType || "").toLowerCase().includes(kw)
    );

    return !kw || matchReceipt || matchItem;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="card">ไม่พบข้อมูลที่ค้นหา</div>`;
    return;
  }

  container.innerHTML = filtered.map(r => {
    const items = r.items || [];
    return `
      <div class="card">
        <div class="row-flex" style="justify-content: space-between;">
          <div>
            <h2 style="margin:0 0 4px;">เลขที่ใบเสร็จ: ${r.receiptNo || "-"} — ${r.customerName || "-"}</h2>
            <div style="color:#4b5563; font-size:14px;">ที่อยู่: ${r.address || "-"}</div>
          </div>
          <div>
            ${r.diagramPdf
              ? `<a href="${r.diagramPdf}" target="_blank" rel="noopener noreferrer">เปิดไฟล์ Diagram (PDF)</a>`
              : `<span style="color:#9ca3af; font-size:13px;">ไม่มีไฟล์ Diagram</span>`}
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
              <th>หมายเหตุ & ประวัติซ่อมบำรุง</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => {
              const rem = daysUntil(item.warrantyEnd);
              const statusBadge = rem <= WARN_DAYS
                ? `<span class="badge-warn">${rem < 0 ? "หมดอายุแล้ว" : `เหลือ ${rem} วัน`}</span>`
                : `<span class="badge-ok">ปกติ (เหลือ ${rem} วัน)</span>`;

              const logs = item.maintenance || [];

              return `
                <tr>
                  <td>${item.productType || "-"}</td>
                  <td>${item.model || "-"}</td>
                  <td><code>${item.ip || "-"}</code></td>
                  <td>${item.warrantyEnd || "-"}<br/>${statusBadge}</td>
                  <td>${formatMoney(item.price)}</td>
                  <td>${item.distributor || "-"}</td>
                  <td>
                    <div>${item.note || "-"}</div>
                    <ul class="maint-list">
                      ${logs.length
                        ? logs.map(m => `<li><b>${m.date || "-"}:</b> ${m.detail || "-"}</li>`).join("")
                        : "<li>ยังไม่มีประวัติซ่อมบำรุง</li>"}
                    </ul>
                    <div class="row-flex" style="margin-top:8px;">
                      <input type="date" id="mDate_${item.id}" />
                      <input type="text" id="mDetail_${item.id}" placeholder="เช่น กล้องตัวที่ 1 adapter เสีย วันที่เปลี่ยน..." style="min-width:220px;" />
                      <button onclick="addMaintenance('${r.receiptNo}', '${item.id}', this)">+ บันทึกซ่อม</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }).join("");
}

fetchFromSheet();
