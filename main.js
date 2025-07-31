// ==== MQTT CONFIG ====
const mqtt_host = "wss://3e126851189a4b7d9ae59215d2ab14b7.s1.eu.hivemq.cloud:8884/mqtt";
const mqtt_user = "hivemq.webclient.1753534095756";
const mqtt_pass = "4?Qx<bhj:;P328EKeNJc";

const topic_status_base = "esp8266/status/";
const topic_button_base = "esp8266/button/";
const topic_control_base = "esp8266/control/";

const espList = ["esp1", "esp2", "esp3"];

// Lưu trạng thái LED
let states = { "esp1": [false, false, false], "esp2": [false, false, false], "esp3": [false, false, false] };
let sending = false;

// Lưu giá trị ADC riêng biệt cho từng ESP
let adcValues = { "esp1": 0, "esp2": 0, "esp3": 0 };

// Lưu dữ liệu adc theo từng esp (mảng dữ liệu lịch sử)
let adcData = {
  "esp1": [],
  "esp2": [],
  "esp3": [],
};
const adcMaxLength = 30;

// Lưu lịch sử nút nhấn cho từng ESP
let buttonHistory = { "esp1": [], "esp2": [], "esp3": [] };

// ==== Kết nối MQTT ====
const mqtt_client = mqtt.connect(mqtt_host, { username: mqtt_user, password: mqtt_pass });

mqtt_client.on('connect', function () {
  document.getElementById('mqtt-status').textContent = "Đã kết nối";
  espList.forEach(espId => {
    mqtt_client.subscribe(topic_status_base + espId);
    mqtt_client.subscribe(topic_button_base + espId);
  });
  updateStatus("Đã kết nối MQTT, chờ thiết bị phản hồi...");
});

mqtt_client.on('close', function () {
  document.getElementById('mqtt-status').textContent = "Mất kết nối!";
  updateStatus("Mất kết nối MQTT...");
});

mqtt_client.on('error', function () {
  document.getElementById('mqtt-status').textContent = "Lỗi Broker!";
  updateStatus("Có lỗi Broker MQTT.");
});

// Cập nhật thời gian liên tục
setInterval(() => {
  const now = new Date();
  document.getElementById('mqtt-time').textContent = now.toLocaleTimeString('vi-VN', { hour12: false });
}, 1000);

mqtt_client.on('message', function (topic, message) {
  const msgStr = message.toString();
  if (topic.startsWith(topic_status_base)) {
    const deviceId = topic.split("/")[2];
    if (!espList.includes(deviceId)) return;
    let data;
    try { data = JSON.parse(msgStr); } catch { return; }

    // Cập nhật trạng thái LED
    if (Array.isArray(data.leds)) {
      states[deviceId] = data.leds.map(x => !!x);
      for (let i = 1; i <= 3; i++) {
        const idx = deviceId === "esp1" ? i : (deviceId === "esp2" ? i + 3 : i + 6);
        const stateEl = document.getElementById(`state${idx}`);
        if (stateEl) {
          stateEl.textContent = states[deviceId][i - 1] ? "ON" : "OFF";
          stateEl.className = "state-indicator " + (states[deviceId][i - 1] ? "on" : "off");
        }
      }
    }

    // Cập nhật giá trị ADC riêng từng ESP
    if (data.adc !== undefined) {
      adcValues[deviceId] = data.adc;
      updateAdcAll();
    }
  } else if (topic.startsWith(topic_button_base)) {

    // ==== THAY ĐỔI BẮT ĐẦU ====
    const deviceId = topic.split("/")[2];
    if (!espList.includes(deviceId)) return;
    let parsed = {};
    try { parsed = JSON.parse(msgStr); } catch { return; }
    const now = new Date();

    buttonHistory[deviceId].unshift({
      time: now.toLocaleTimeString("vi-VN", { hour12: false }),
      millis: parsed.millis || 0
    });
    if (buttonHistory[deviceId].length > 10) buttonHistory[deviceId].pop();

    // Gán timestamp thực và textTime (dùng cho thống kê 30s & note)
    let nowTS = now.getTime();
    let timeStrVN = now.toLocaleTimeString('vi-VN', { hour12: false }) + " " + now.toLocaleDateString('vi-VN');
    buttonHistory[deviceId][0].ts = nowTS;
    buttonHistory[deviceId][0].textTime = timeStrVN;

    logPress(deviceId, timeStrVN);
    renderPressTotalLine();
    renderPress30sSummary();
    renderButtonHistoryTable();
    // ==== THAY ĐỔI KẾT THÚC ====
  }
});
// Biến lưu tổng số lần bấm & thời gian lần đầu từng ESP
let pressTotalInfo = {
  esp1: { total: 0, firstTime: null },
  esp2: { total: 0, firstTime: null },
  esp3: { total: 0, firstTime: null }
};

// Đếm số lần bấm ESP trong 30 giây
function getPressCount30s(esp) {
  let now = Date.now();
  return (buttonHistory[esp] || []).filter(item => now - (item.ts || 0) < 30000).length;
}

// Ghi nhận mỗi lần bấm
function logPress(esp, timeStr) {
  pressTotalInfo[esp].total += 1;
  if (!pressTotalInfo[esp].firstTime) pressTotalInfo[esp].firstTime = timeStr;
}

// Hiển thị dòng tổng số lần bấm
function renderPressTotalLine() {
  // Tính tổng mọi ESP
  let totalAll = 0;
  let arr = ["esp1", "esp2", "esp3"].map((e, idx) => {
    totalAll += pressTotalInfo[e].total;
    return `ESP${idx+1}: <b>${pressTotalInfo[e].total} (lần) &nbsp; </b>`;
  });

  // Xuất ra: tổng số lần bấm ở trên, các ESP ở dưới cùng dòng, chia |
  document.getElementById("pressTotalLine").innerHTML = `
    <span style="font-weight:bold;">Tổng số lần bấm: </span> <b>${totalAll} (lần) &nbsp; || </b>
    &nbsp;&nbsp;&nbsp;${arr.join(' | ')}
  `;
}


// Lấy thứ tự ESP theo lượt bấm 30s giảm dần
function getPress30sRank() {
  return ["esp1", "esp2", "esp3"].map(e => ({ esp: e, count: getPressCount30s(e) })).sort((a, b) => b.count - a.count);
}

// Hiển thị thống kê lượt bấm 30s
function renderPress30sSummary() {
  let rankArr = getPress30sRank();
  // Xác định theme hiện tại
  const isDark = isDarkMode();

  // Chọn màu chữ tổng thể cho block này
  const blockColor = isDark ? '#c5ed00ff' : '#0b1f7aff';
  // Chọn màu cho từng số (nếu >3 thì đỏ, còn lại xanh nổi bật trên theme)
  const colorIfOk  = isDark ? '#1bd107ff' : '#005b1bff';
  const colorIfWarn = isDark ? '#f01010ff'   : '#86031dff';

  const htmlArr = rankArr.map(x => {
    const color = x.count > 3 ? colorIfWarn : colorIfOk;
    return `<span style="color:${color};margin:0 8px;">
      ${x.esp.toUpperCase()} : <b>${x.count} lần</b>
    </span>`;
  });

  document.getElementById('press30sSummary').innerHTML =
    `<span style="font-weight:bold;color:${blockColor}">Số lần bấm trong 30s:</span> ${htmlArr.join('|')}`;
}


// Gom lịch sử bấm từng ESP thành các slot 30s (window 30s nào có ít nhất 1 lần bấm thì thành 1 dòng)
function groupPressesBy30s() {
  let slotList = [];
  for (const esp of espList) {
    // lịch sử cho thiết bị này, sắp xếp tăng dần theo thời gian thực
    const hist = buttonHistory[esp].slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    let windowStart = null, windowItems = [];
    for (let press of hist) {
      if (!windowStart || (press.ts - windowStart >= 30000)) {
        if (windowItems.length > 0) {
          // Kết thúc 1 slot
          slotList.push({
            esp,
            time: windowItems[0].textTime || windowItems[0].time, // thời điểm bấm đầu tiên trong slot
            count: windowItems.length,
          });
        }
        windowStart = press.ts;
        windowItems = [];
      }
      windowItems.push(press);
    }
    // còn sót slot cuối cùng
    if (windowItems.length > 0) {
      slotList.push({
        esp,
        time: windowItems[0].textTime || windowItems[0].time,
        count: windowItems.length,
      });
    }
  }
  // Sắp xếp mới nhất lên đầu
  slotList.sort((a, b) => (b.time > a.time ? 1 : -1));
  return slotList;
}

// Hàm render bảng thống kê chung 3 esp
function renderButtonHistoryTable() {
  const slots = groupPressesBy30s();

  let table = `<tr>
    <th>STT</th>
    <th>Tên thiết bị</th>
    <th>Thời gian lần nhấn đầu (trong 30s)</th>
    <th>Số lần bấm (trong 30s đó)</th>
  </tr>`;

  slots.forEach((row, idx) => {
    const tdClass = row.count > 3 ? " style='background:#d74949;color:#ffeeee;font-weight:bold;'" : "";
    table += `<tr>
      <td>${idx + 1}</td>
      <td${tdClass}>${row.esp.toUpperCase()}</td>
      <td>${row.time}</td>
      <td${tdClass}>${row.count}</td>
    </tr>`;
  });

  document.getElementById("button-history-table").innerHTML = table;
}



function updateStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

// ==== Điều khiển nút bấm ====
function toggleButton(index) {
  if (sending) return;
  let deviceId, ledIdx;
  if (index <= 2) { deviceId = "esp1"; ledIdx = index; }
  else if (index <= 5) { deviceId = "esp2"; ledIdx = index - 3; }
  else { deviceId = "esp3"; ledIdx = index - 6; }
  states[deviceId][ledIdx] = !states[deviceId][ledIdx];
  updateButtons();
  sendCommand(deviceId);
}

function sendCommand(deviceId) {
  sending = true;
  updateButtons();
  const topic = topic_control_base + deviceId;
  mqtt_client.publish(topic, JSON.stringify({ leds: states[deviceId].map(x => x ? 1 : 0) }), {}, () => {
    sending = false;
    updateButtons();
  });
}

function updateButtons() {
  for (let i = 0; i < 9; i++) {
    let deviceId, ledIdx;
    if (i <= 2) { deviceId = "esp1"; ledIdx = i; }
    else if (i <= 5) { deviceId = "esp2"; ledIdx = i - 3; }
    else { deviceId = "esp3"; ledIdx = i - 6; }
    const btn = document.getElementById(`btn${i + 1}`);
    if (!btn) continue;
    btn.disabled = sending;
    btn.className = states[deviceId][ledIdx] ? "btn btn-tat" : "btn btn-bat";
    btn.textContent = (states[deviceId][ledIdx] ? "TẮT" : "BẬT") + ` LED ${i + 1}`;
  }
}

// ==== ADC đồ hoạ ====
// Lấy context các canvas
const adcLineCtx1 = document.getElementById('adcLineChart1').getContext('2d');
const adcLineCtx2 = document.getElementById('adcLineChart2').getContext('2d');
const adcLineCtx3 = document.getElementById('adcLineChart3').getContext('2d');

const adcGaugeCtx1 = document.getElementById('adcGauge1').getContext('2d');
const adcGaugeCtx2 = document.getElementById('adcGauge2').getContext('2d');
const adcGaugeCtx3 = document.getElementById('adcGauge3').getContext('2d');

const espCharts = {};

// Hàm tạo line chart cho từng esp, trả về đối tượng chart
function createLineChart(ctx, label) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: label,
        backgroundColor: 'rgba(241,74,52,.10)',
        borderColor: '#e22929',
        borderWidth: 2,
        data: [],
        pointRadius: 4,
        pointBackgroundColor: '#e22929',
        tension: 0
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: label, color: '#fff', font: { size: 18, weight: 'bold' } }
      },
      scales: {
        x: { grid: { color: '#888' }, ticks: { color: '#888', font: { size: 13 } } },
        y: { grid: { color: '#888' }, ticks: { color: '#888', font: { size: 13 } } }
      }
    }
  });
}

// Khởi tạo 3 biểu đồ line + gauge cho từng esp
espCharts["esp1"] = {
  lineChart: createLineChart(adcLineCtx1, "ADC esp1"),
  gaugeCtx: adcGaugeCtx1,
  gaugeValueEl: document.getElementById('adcGaugeValue1')
};

espCharts["esp2"] = {
  lineChart: createLineChart(adcLineCtx2, "ADC esp2"),
  gaugeCtx: adcGaugeCtx2,
  gaugeValueEl: document.getElementById('adcGaugeValue2')
};

espCharts["esp3"] = {
  lineChart: createLineChart(adcLineCtx3, "ADC esp3"),
  gaugeCtx: adcGaugeCtx3,
  gaugeValueEl: document.getElementById('adcGaugeValue3')
};

// Hàm vẽ đồng hồ gauge dùng chung
function drawAdcGauge(ctx, value) {
  ctx.clearRect(0, 0, 220, 220);
  const centerX = 110, centerY = 110, radius = 85;
  ctx.save();
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.strokeStyle = i < 3 ? "#1ad525" : (i < 7 ? "#1a87e9" : "#ed3d3d");
    ctx.lineWidth = 15;
    const startA = Math.PI * (1 + i * 1.9 / 10);
    const endA = Math.PI * (1 + (i + 1) * 1.9 / 10);
    ctx.arc(centerX, centerY, radius, startA, endA, false);
    ctx.stroke();
  }
  const percent = Math.max(0, Math.min(1, value / 1024));
  const angle = Math.PI * (1 + 1.9 * percent);
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(radius - 12, 0);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#e22929";
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
  ctx.fillStyle = "#4a475a";
  ctx.fill();
  ctx.restore();
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let v = 0; v <= 1024; v += 128) {
    const a = Math.PI * (1 + 1.9 * v / 1024);
    const tx = centerX + Math.cos(a) * (radius - 20);
    const ty = centerY + Math.sin(a) * (radius - 20);
    ctx.fillStyle = isDarkMode() ? "#0cededff" : "#412561";  // đổi màu cho số trong đồng hồ ở đây
    ctx.fillText(v, tx, ty);
  }
}

// Hàm cập nhật adc riêng cho từng esp (cập nhật cả biểu đồ line và gauge)
function updateAdcEsp(espId, newVal) {
  const now = new Date();
  const label = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  adcData[espId].push({ x: label, y: newVal });
  if (adcData[espId].length > adcMaxLength) adcData[espId].shift();

  const chartObj = espCharts[espId];
  if (chartObj) {
    chartObj.lineChart.data.labels = adcData[espId].map(v => v.x);
    chartObj.lineChart.data.datasets[0].data = adcData[espId].map(v => v.y);
    chartObj.lineChart.update();
    drawAdcGauge(chartObj.gaugeCtx, newVal);
    if (chartObj.gaugeValueEl) chartObj.gaugeValueEl.textContent = newVal;
  }
}

// Hàm cập nhật adc cho tất cả esp
function updateAdcAll() {
  updateAdcEsp("esp1", adcValues["esp1"]);
  updateAdcEsp("esp2", adcValues["esp2"]);
  updateAdcEsp("esp3", adcValues["esp3"]);
}

// ==== Khởi tạo ====
window.onload = function () {
  updateButtons();
  renderButtonHistoryTable(); // Hiển thị bảng thống kê tổng hợp chung 3 esp
};


// Kết nối sự kiện nút bấm với toggleButton
for (let i = 1; i <= 9; i++) {
  const btn = document.getElementById(`btn${i}`);
  if (btn) btn.onclick = function () { toggleButton(i - 1); };
}



// ==== Theme (Day/Night button with image bg) ====
function isDarkMode() {
  return document.body.classList.contains('dark-mode');
}
function setTheme(dark) {
  if(dark){
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
    document.getElementById('toggleContainer').classList.remove('checked');
    document.getElementById('note-block').style.color = "#fff";
  } else {
    document.body.classList.remove('dark-mode');
    document.body.classList.add('light-mode');
    document.getElementById('toggleContainer').classList.add('checked');
    document.getElementById('note-block').style.color = "#121212";
  }
  // Đổi màu ADC label, các chữ trên biểu đồ, gauge...
  const adcLabels = document.querySelectorAll('.adcChartLabel');
  adcLabels.forEach(el => {
    el.style.color = dark ? '#b2c7ed' : '#236bc9';
  });
  // đổi màu biêu
   updateChartColors(dark);
   // VẼ LẠI gauge ADC để số đổi đúng màu theo theme mới
  ["esp1", "esp2", "esp3"].forEach(id => {
    drawAdcGauge(espCharts[id].gaugeCtx, adcValues[id]);
  });

}
function updateChartColors(isDark) {
  const colorLine = isDark ? "#09f179" : "#8d0694";
  Object.values(espCharts).forEach(chartObj => {
    const lineChart = chartObj.lineChart;
    if (!lineChart) return;
    lineChart.options.plugins.title.color = colorLine;
    lineChart.options.scales.x.grid.color = colorLine;
    lineChart.options.scales.x.ticks.color = colorLine;
    lineChart.options.scales.y.grid.color = colorLine;
    lineChart.options.scales.y.ticks.color = colorLine;
    lineChart.update();
  });
}
const THEME_KEY = "darkMode";
function saveTheme(dark) { localStorage.setItem(THEME_KEY, dark ? "on" : "off"); }
function restoreTheme() {
  let isDark = true;
  if (localStorage.getItem(THEME_KEY) === "off") isDark = false;
  setTheme(isDark);
  document.getElementById('toggle-theme-checkbox').checked = !isDark;
}
document.addEventListener('DOMContentLoaded', function () {
  restoreTheme();
  document.getElementById('toggle-theme-checkbox').addEventListener('change', function () {
    let dark = !this.checked;
    setTheme(dark);
    saveTheme(dark);
  });
});
// ==== BỔ SUNG: Header co lại khi cuộn (CÓ THỂ XÓA NGUYÊN ĐOẠN NÀY BẤT KỲ LÚC NÀO) ====
(function() {
  const header = document.querySelector('.thanh_header');
  if (!header) return;
  function onScroll() {
    if (window.scrollY > 0) header.classList.add('shrink');
    else header.classList.remove('shrink');
  }
  window.addEventListener('scroll', onScroll);
  // Khi muốn bỏ hoàn toàn chỉ việc xóa khối này
})();
// ==== Hết hiệu ứng header co lại ====



setInterval(() => {
  renderPress30sSummary();
  renderButtonHistoryTable();
}, 1100);

// Hàm ẩn tất cả zone
function hideAllZones() {
  document.querySelectorAll('.zone_esp1, .zone_esp2, .zone_esp3').forEach(zone => {
    zone.classList.remove('show');
  });
}

// Hàm hiển thị 1 zone theo class tương ứng
// Hàm hiển thị 1 zone theo class tương ứng
function showZone(zoneClass) {
  hideAllZones();
  if (zoneClass === 'all') {
    // Hiện hết
    document.querySelectorAll('.zone_esp1, .zone_esp2, .zone_esp3').forEach(zone => {
      zone.classList.add('show');
    });
  } else {
    // ✅ Sử dụng querySelectorAll để lấy TẤT CẢ các phần tử có cùng class
    const zones = document.querySelectorAll(`.${zoneClass}`);
    zones.forEach(zone => {
      zone.classList.add('show');
    });
  }
}


// Gán sự kiện click từng menu
document.getElementById('house1').addEventListener('click', () => {
  showZone('zone_esp1');
});
document.getElementById('house2').addEventListener('click', () => {
  showZone('zone_esp2');
});
document.getElementById('house3').addEventListener('click', () => {
  showZone('zone_esp3');
});
document.getElementById('houseA').addEventListener('click', () => {
  showZone('all');
});
// Khi vừa load trang: hiện tất cả zone
window.addEventListener('DOMContentLoaded', function() {
  showZone('all');
});




document.addEventListener('DOMContentLoaded', function() {
  // Chỉ áp dụng khi màn hình nhỏ hơn 1000px
  if (window.innerWidth <= 1000) {
    var inforBox = document.querySelector('.infor_container');
    if (inforBox) {
      inforBox.addEventListener('click', function(e) {
        // Toggle class active
        inforBox.classList.toggle('active');
        // Nếu lỡ bấm từ <i> hoặc con bên trong thì tránh bubble
        e.stopPropagation();
      });
      // Bấm ra ngoài thì ẩn đi (option tốt hơn UX)
      document.addEventListener('click', function(e){
        if (!inforBox.contains(e.target)) {
          inforBox.classList.remove('active');
        }
      });
    }
  }
});


document.addEventListener('DOMContentLoaded', function () {
  const modal = document.getElementById('myModal');
  const openBtn = document.getElementById('openDialog');
  const closeBtn = document.getElementById('closeModal');
  const copyBtn = document.getElementById('copyCodeBtn');
  const codeBlock = document.getElementById('codeBlock');

  const btnEsp32 = document.getElementById('btn_esp32');
  const btnEsp8266 = document.getElementById('btn_esp8266');

  // Hai đoạn code ví dụ
  const code_esp8266 = `// Ví dụ bật tắt LED ESP8266
#define LED  LED_BUILTIN

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  digitalWrite(LED, LOW);   // Bật LED
  delay(100);
  digitalWrite(LED, HIGH);  // Tắt LED
  delay(100);
}
`;
  const code_esp32 = `// Ví dụ bật tắt LED ESP32
#define LED  2

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  digitalWrite(LED, HIGH);  // Bật LED
  delay(100);
  digitalWrite(LED, LOW);   // Tắt LED
  delay(100);
}
`;

  // Mở modal
  openBtn.addEventListener('click', function(event) {
    event.preventDefault();
    modal.classList.add('show');
  });

  // Đóng modal
  closeBtn.addEventListener('click', function() {
    modal.classList.remove('show');
  });

  // Đóng khi click ngoài nội dung modal
  modal.addEventListener('click', function(event) {
    if (event.target === modal) {
      modal.classList.remove('show');
    }
  });

  // Copy code
  copyBtn.addEventListener('click', function() {
    const code = codeBlock.innerText;
    navigator.clipboard.writeText(code).then(function() {
      copyBtn.innerText = "✅ Đã copy!";
    }).catch(function() {
      copyBtn.innerText = "Lỗi copy!";
    });
    setTimeout(()=>{
      copyBtn.innerText = "📋 Sao chép";
    }, 1500);
  });

  // Nút chọn ESP8266
  btnEsp8266.addEventListener('click', function() {
    codeBlock.innerText = code_esp8266;
    btnEsp8266.classList.add('active');
    btnEsp32.classList.remove('active');
  });

  // Nút chọn ESP32
  btnEsp32.addEventListener('click', function() {
    codeBlock.innerText = code_esp32;
    btnEsp32.classList.add('active');
    btnEsp8266.classList.remove('active');
  });

});



document.addEventListener('DOMContentLoaded', function () {
  const modalMQTT = document.getElementById('modalMQTT');
  const openBtn2 = document.getElementById('openDialog2');
  const closeBtn2 = document.getElementById('closeModalMQTT');
  const codeBlock2 = document.getElementById('codeBlock2');
  const btn_mqtt = document.getElementById('btn_mqtt');
  const btn_websever = document.getElementById('btn_websever');
    const thongtin_mqtt = `// Ví dụ bật tắt LED ESP8266
#define LED  LED_BUILTIN

void setup() {
  pinMode(LED, OUTPUT);
}

cai lon 
ghihi
 gi
}
`;
  const thongtin_websever = `// Ví dụ bật tắt LED ESP32
#define LED  2

void setup() {
có cái lòn web
}
`;
  if (openBtn2 && modalMQTT) {
    openBtn2.addEventListener('click', function(event) {
      event.preventDefault();
      modalMQTT.classList.add('show');
    });
  }

  if (closeBtn2 && modalMQTT) {
    closeBtn2.addEventListener('click', function() {
      modalMQTT.classList.remove('show');
    });
  }

  // Đóng khi click ngoài vùng modal-content-mqtt
  if (modalMQTT) {
    modalMQTT.addEventListener('click', function(event) {
      if (event.target === modalMQTT) {
        modalMQTT.classList.remove('show');
      }
    });
  }

  btn_mqtt.addEventListener('click', function() {
    codeBlock2.innerText = thongtin_mqtt;
    btn_mqtt.classList.add('active');
    btn_websever.classList.remove('active');
  });
  btn_websever.addEventListener('click', function() {
    codeBlock2.innerText = thongtin_websever;
    btn_websever.classList.add('active');
    btn_mqtt.classList.remove('active');
  });

});


