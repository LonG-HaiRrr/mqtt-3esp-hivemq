#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// WiFi info
// const char* ssid = "TP-LINK_6B6C";
// const char* password = "07567902";

const char* ssid = "cuongbeo155";
const char* password = "123456789";

// MQTT info (HiveMQ Cloud)
const char* mqtt_server = "3e126851189a4b7d9ae59215d2ab14b7.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "hivemq.webclient.1753534095756";
const char* mqtt_pass = "4?Qx<bhj:;P328EKeNJc";

// MQTT topics
const char* mqtt_pub_topic = "esp8266/status/esp1";
const char* mqtt_sub_topic = "esp8266/control/esp1";
const char* mqtt_button_topic = "esp8266/button/esp1";

// Chân LED/Nút trên board
#define LED1_PIN D1
#define LED2_PIN D5
#define LED3_PIN D6
#define BUTTON_PIN D2   // I/O4, nút nhấn vật lý

WiFiClientSecure espClient;
PubSubClient client(espClient);

bool lastBtnState = LOW;

void callback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<128> doc;
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  DeserializationError err = deserializeJson(doc, msg);
  if (!err && strcmp(topic, mqtt_sub_topic) == 0) {
    if (doc.containsKey("leds")) {
      JsonArray arr = doc["leds"];
      if (arr.size() >= 3) {
        digitalWrite(LED1_PIN, arr[0]?HIGH:LOW);
        digitalWrite(LED2_PIN, arr[1]?HIGH:LOW);
        digitalWrite(LED3_PIN, arr[2]?HIGH:LOW);
      }
    }
  }
}

void setup_wifi() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(200);
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect("esp8266client", mqtt_user, mqtt_pass)) {
      client.subscribe(mqtt_sub_topic);
    } else {
      delay(2000);
    }
  }
}

void setup() {
  pinMode(LED1_PIN, OUTPUT); digitalWrite(LED1_PIN, LOW);
  pinMode(LED2_PIN, OUTPUT); digitalWrite(LED2_PIN, LOW);
  pinMode(LED3_PIN, OUTPUT); digitalWrite(LED3_PIN, LOW);
  pinMode(BUTTON_PIN, INPUT);   // cần có R pull-down vật lý để ổn định

  Serial.begin(115200);
  setup_wifi();
  espClient.setInsecure();  // Không kiểm tra CA (demo/dev)
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  static unsigned long t = 0;
  if (millis() - t > 50) {
    t = millis();
    StaticJsonDocument<128> doc;
    JsonArray arr = doc.createNestedArray("leds");
    arr.add(digitalRead(LED1_PIN));
    arr.add(digitalRead(LED2_PIN));
    arr.add(digitalRead(LED3_PIN));
    doc["adc"] = analogRead(A0);

    String payload;
    serializeJson(doc, payload);
    client.publish(mqtt_pub_topic, payload.c_str());
  }

  // Xử lý nút nhấn vật lý, gửi sự kiện MQtt
  static unsigned long lastDebounce = 0;  
  bool btnState = digitalRead(BUTTON_PIN);
  if (btnState == HIGH && lastBtnState == LOW && millis() - lastDebounce > 200) {
    lastDebounce = millis();
    StaticJsonDocument<96> doc;
    doc["button"] = 1;
    doc["millis"] = millis();
    String msg;
    serializeJson(doc, msg);
    client.publish(mqtt_button_topic, msg.c_str());
    Serial.println("nút đã nhận, mess đã gửi");
  }
  lastBtnState = btnState;
}
