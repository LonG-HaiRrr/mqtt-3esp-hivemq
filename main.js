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
    const deviceId = topic.split("/")[2];
    if (!espList.includes(deviceId)) return;
    let parsed = {};
    try { parsed = JSON.parse(msgStr); } catch { return; }
    const now = new Date();

    buttonHistory[deviceId].unshift({
      time: now.toLocaleTimeString("vi-VN", { hour12: false }),
      millis: parsed.millis || 0,
    });
    if (buttonHistory[deviceId].length > 10) buttonHistory[deviceId].pop();
    renderButtonHistory(deviceId);
  }
});

function renderButtonHistory(deviceId) {
  let table = "<tr><th>#</th><th>Giờ nhấn</th></tr>";
  buttonHistory[deviceId].forEach((item, idx) => {
    table += `<tr><td>${idx + 1}</td><td>${item.time}</td></tr>`;
  });
  const elemId = { "esp1": "button-history-esp1", "esp2": "button-history-esp2", "esp3": "button-history-esp3" };
  const el = document.getElementById(elemId[deviceId]);
  if (el) el.innerHTML = table;
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
    ctx.fillStyle = "#fff";
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
  espList.forEach(deviceId => renderButtonHistory(deviceId));
};

// Kết nối sự kiện nút bấm với toggleButton
for (let i = 1; i <= 9; i++) {
  const btn = document.getElementById(`btn${i}`);
  if (btn) btn.onclick = function () { toggleButton(i - 1); };
}



// ==== Theme (Day/Night button with image bg) ====
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
