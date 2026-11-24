const STORAGE_KEY = "cctv_billing_system_v1";
const WARN_DAYS = 30;

const defaultData = [
  {
    receiptNo: "INV-2026-001",
    customerName: "บริษัท ตัวอย่าง จำกัด",
    address: "123 ถ.พหลโยธิน ต.ท่าหิน อ.เมืองลพบุรี จ.ลพบุรี 15000",
    diagramPdf: "diagrams/INV-2026-001.pdf",
    items: [
      {
        id: "CAM-01",
        productType: "กล้อง",
        model: "DS-2CD2146G3-IPTRZ",
        ip: "192.168.1.101",
        warrantyEnd: "2026-12-10",
        price: 3800,
        distributor: "Distributor A",
        note: "กล้องตัวที่ 1 หน้าประตูทางเข้า",
        maintenance: [
          { date: "2026-08-15", detail: "กล้องตัวที่ 1 Adapter เสีย -> เปลี่ยน 12V 2A ตัวใหม่แล้ว" }
        ]
      },
      {
        id: "CAM-02",
        productType: "กล้อง",
        model: "DS-2CD2146G3-IPTRZ",
        ip: "192.168.1.102",
        warrantyEnd: "2028-05-15",
        price: 3800,
        distributor: "Distributor A",
        note: "กล้องตัวที่ 2 ลานจอดรถ",
        maintenance: []
      }
    ]
  }
];

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
  return structuredClone(defaultData);
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function resetDemoData() {
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function addMaintenance(receiptNo, itemId) {
  const dateInput = document.getElementById(`mDate_${itemId}`);
  const detailInput = document.getElementById(`mDetail_${itemId}`);
  const dateVal = dateInput.value;
  const detailVal = detailInput.value.trim();

  if (!dateVal || !detailVal) {
    alert("กรุณากรอกวันที่เปลี่ยน/ซ่อม และรายละเอียดอาการเสีย");
    return;
  }

  const data = loadData();
  const receipt = data.find(r => r.receiptNo === receiptNo);
  const item = receipt?.items.find(i => i.id === itemId);
  if (!item) return;

  item.maintenance.push({ date: dateVal, detail: detailVal });
  saveData(data);
  renderAll();
}

function renderAlerts(data) {
  const box = document.getElementById("warrantyAlerts");
  const warnings = [];

  data.forEach(r => {
    r.items.forEach(item => {
      const rem = daysUntil(item.warrantyEnd);
      if (rem <= WARN_DAYS) {
        warnings.push({
          receiptNo: r.receiptNo,
          customerName: r.customerName,
          model: item.model,
          ip: item.ip,
          warrantyEnd: item.warrantyEnd,
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
  const data = loadData();
  const kw = document.getElementById("searchInput").value.trim().toLowerCase();
  renderAlerts(data);

  const container = document.getElementById("recordsContainer");
  const filtered = data.filter(r => {
    const matchReceipt =
      r.receiptNo.toLowerCase().includes(kw) ||
      r.customerName.toLowerCase().includes(kw) ||
      r.address.toLowerCase().includes(kw);
    const matchItem = r.items.some(i =>
      i.model.toLowerCase().includes(kw) ||
      i.ip.toLowerCase().includes(kw) ||
      i.note.toLowerCase().includes(kw)
    );
    return !kw || matchReceipt || matchItem;
  });

  container.innerHTML = filtered.map(r => `
    <div class="card">
      <div class="row-flex" style="justify-content: space-between;">
        <div>
          <h2 style="margin:0 0 4px;">เลขที่ใบเสร็จ: ${r.receiptNo} — ${r.customerName}</h2>
          <div style="color:#4b5563; font-size:14px;">ที่อยู่: ${r.address}</div>
        </div>
        <div>
          <a href="${r.diagramPdf}" target="_blank">เปิดไฟล์ Diagram (PDF)</a>
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
          ${r.items.map(item => {
            const rem = daysUntil(item.warrantyEnd);
            const statusBadge = rem <= WARN_DAYS
              ? `<span class="badge-warn">${rem < 0 ? "หมดอายุแล้ว" : `เหลือ ${rem} วัน`}</span>`
              : `<span class="badge-ok">ปกติ (เหลือ ${rem} วัน)</span>`;

            return `
              <tr>
                <td>${item.productType}</td>
                <td>${item.model}</td>
                <td><code>${item.ip}</code></td>
                <td>${item.warrantyEnd}<br/>${statusBadge}</td>
                <td>${item.price.toLocaleString()}</td>
                <td>${item.distributor}</td>
                <td>
                  <div>${item.note || "-"}</div>
                  <ul class="maint-list">
                    ${item.maintenance.length
                      ? item.maintenance.map(m => `<li><b>${m.date}:</b> ${m.detail}</li>`).join("")
                      : "<li>ยังไม่มีประวัติซ่อมบำรุง</li>"}
                  </ul>
                  <div class="row-flex" style="margin-top:8px;">
                    <input type="date" id="mDate_${item.id}" />
                    <input type="text" id="mDetail_${item.id}" placeholder="เช่น กล้องตัวที่ 1 adapter เสีย วันที่เปลี่ยน..." style="min-width:220px;" />
                    <button onclick="addMaintenance('${r.receiptNo}', '${item.id}')">+ บันทึกซ่อม</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `).join("");
}

renderAll();
