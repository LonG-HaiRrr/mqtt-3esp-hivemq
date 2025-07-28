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
}, 100);

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
        const idx = deviceId === "esp1" ? i : (deviceId === "esp2" ? i+3 : i+6);
        const stateEl = document.getElementById(`state${idx}`);
        if (stateEl) {
          stateEl.textContent = states[deviceId][i-1] ? "ON" : "OFF";
          stateEl.className = "state-indicator " + (states[deviceId][i-1] ? "on" : "off");
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
    try { parsed = JSON.parse(msgStr);} catch { return; }
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
  if(el) el.innerHTML = table;
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
  for(let i = 0; i < 9; i++) {
    let deviceId, ledIdx;
    if (i <= 2) { deviceId = "esp1"; ledIdx = i; } 
    else if (i <= 5) { deviceId = "esp2"; ledIdx = i - 3; } 
    else { deviceId = "esp3"; ledIdx = i - 6; }
    const btn = document.getElementById(`btn${i+1}`);
    if(!btn) continue;
    btn.disabled = sending;
    btn.className = states[deviceId][ledIdx] ? "btn btn-tat" : "btn btn-bat";
    btn.textContent = (states[deviceId][ledIdx] ? "TẮT" : "BẬT") + ` LED ${i+1}`;
  }
}

// ==== ADC đồ hoạ ====
let adcData = [];
const adcMaxLength = 30;
const adcLineCtx = document.getElementById('adcLineChart').getContext('2d');
const adcGaugeCtx = document.getElementById('adcGauge').getContext('2d');

let adcLineChart = new Chart(adcLineCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'ADC',
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
      title: { display: true, text: 'ADC Value', color: '#fff', font: { size: 18, weight: 'bold' } }
    },
    scales: {
      x: { grid: { color: '#888' }, ticks: { color: '#888', font: { size: 13 } } },
      y: { grid: { color: '#888' }, ticks: { color: '#888', font: { size: 13 } } }
    }
  }
});

function drawAdcGauge(value) {
  const ctx = adcGaugeCtx;
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

function updateAdc(newVal) {
  const now = new Date();
  const label = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  adcData.push({ x: label, y: newVal });
  if (adcData.length > adcMaxLength) adcData.shift();
  adcLineChart.data.labels = adcData.map(v => v.x);
  adcLineChart.data.datasets[0].data = adcData.map(v => v.y);
  adcLineChart.update();
  drawAdcGauge(newVal);
}

function updateAdcAll() {
  const val1 = adcValues["esp1"];
  const val2 = adcValues["esp2"];
  const val3 = adcValues["esp3"];

  updateAdc(val1);  // Vẽ biểu đồ và gauge cho esp1

  // Cập nhật giá trị hiển thị cho 3 ADC theo từng ESP
  const el1 = document.getElementById('adcGaugeValue');
  const el2 = document.getElementById('adcGaugeValue2');
  const el3 = document.getElementById('adcGaugeValue3');
  if(el1) el1.textContent = val1;
  if(el2) el2.textContent = val2;
  if(el3) el3.textContent = val3;
}

// ==== Khởi tạo ====
window.onload = function () {
  updateButtons();
  espList.forEach(deviceId => renderButtonHistory(deviceId));
};

// Kết nối sự kiện nút bấm với toggleButton
for(let i=1; i<=9; i++) {
  const btn = document.getElementById(`btn${i}`);
  if(btn) btn.onclick = function() { toggleButton(i-1); };
}
