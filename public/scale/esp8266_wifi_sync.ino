// NodeMCU 1.0 (ESP-12E), HX711 by bogde. No inventory writes.
#include <ESP8266WiFi.h>
#include <WiFiClientSecureBearSSL.h>
#include <ESP8266HTTPClient.h>
#include <HX711.h>
#include <math.h>
#include <time.h>
#include "scale_secrets.h" // private staged file; never place credentials in public/

HX711 scale;
constexpr float CALIBRATION_FACTOR = -108.55f;
constexpr unsigned long SEND_INTERVAL_MS = 5000;
unsigned long lastSend = 0;
bool calibrated = false;
bool wifiConfigured = false;
bool wifiAttempt = false;
unsigned long wifiStarted = 0, lastWifiReport = 0, lastWifiRetry = 0;
int previousWifiStatus = -1;
constexpr unsigned long WIFI_TIMEOUT_MS = 20000, WIFI_RETRY_MS = 30000;

const char* wifiStatusName(int status) {
  switch (status) {
    case WL_IDLE_STATUS: return "idle";
    case WL_NO_SSID_AVAIL: return "network unavailable";
    case WL_CONNECTED: return "connected";
    case WL_CONNECT_FAILED: return "connection failed";
    case WL_CONNECTION_LOST: return "connection lost";
    case WL_DISCONNECTED: return "disconnected";
    default: return "other";
  }
}

void startWifi() {
  Serial.println("[WiFi] Starting connection attempt (20 s deadline)");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  wifiStarted = millis(); wifiAttempt = true;
}

void serviceWifi() {
  int status = WiFi.status();
  if (status != previousWifiStatus || millis() - lastWifiReport >= 5000) {
    Serial.printf("[WiFi] status=%d (%s)\n", status, wifiStatusName(status));
    if (status == WL_CONNECTED) {
      Serial.print("[WiFi] Assigned IP: "); Serial.println(WiFi.localIP());
      Serial.print("[WiFi] Gateway: "); Serial.println(WiFi.gatewayIP());
      Serial.print("[WiFi] Subnet: "); Serial.println(WiFi.subnetMask());
      Serial.printf("[WiFi] RSSI: %d dBm\n", WiFi.RSSI());
    }
    previousWifiStatus = status; lastWifiReport = millis();
  }
  if (!wifiConfigured) return;
  if (status == WL_CONNECTED) {
    wifiAttempt = false; lastWifiRetry = millis(); return;
  }
  if (wifiAttempt && millis() - wifiStarted >= WIFI_TIMEOUT_MS) {
    Serial.println("[WiFi] Connection timed out; retry in 30 s. Check 2.4 GHz network/configuration.");
    WiFi.disconnect(); wifiAttempt = false; lastWifiRetry = millis();
  } else if (!wifiAttempt && millis() - lastWifiRetry >= WIFI_RETRY_MS) startWifi();
}

bool averageRaw(long &result, byte count) {
  int64_t total = 0;
  unsigned long started = millis();
  for (byte i = 0; i < count; ++i) {
    Serial.printf("[HX711] Tare sample %u/%u: waiting (1200 ms max)\n", i + 1, count);
    if (millis() - started >= 20000 || !scale.wait_ready_timeout(1200, 10)) {
      Serial.println("[HX711] Calibration timeout / converter not ready"); return false;
    }
    total += scale.read();
    yield();
  }
  result = long(total / count);
  return true;
}

bool localEndpoint() {
  // HTTP is opt-in and restricted to a literal RFC1918 IPv4 host.
  String url(API_URL);
  if (!url.startsWith("http://")) return false;
  String host = url.substring(7);
  int end = host.indexOf('/'); if (end >= 0) host = host.substring(0, end);
  int colon = host.indexOf(':'); if (colon >= 0) host = host.substring(0, colon);
  IPAddress ip;
  if (!ip.fromString(host)) return false;
  return ip[0] == 10 || (ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31) ||
         (ip[0] == 192 && ip[1] == 168);
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[BOOT] DLOOP-SCALE-01 diagnostics; Serial 115200 baud");
  Serial.printf("[BOOT] Reset reason: %s\n", ESP.getResetReason().c_str());
  scale.begin(D5, D6); // D5=GPIO14 DT; D6=GPIO12 SCK
  scale.set_scale(CALIBRATION_FACTOR);
  Serial.println("Boot with empty permanent platform; never tare with a spool on it.");
  Serial.printf("[HX711] DT=D5 GPIO14 SCK=D6 GPIO12 factor=%.2f ready=%d\n", CALIBRATION_FACTOR, scale.is_ready());
  Serial.println("[HX711] Starting empty-platform tare (20 s deadline)");
  long offset;
  calibrated = averageRaw(offset, 15);
  if (calibrated) { scale.set_offset(offset); Serial.println("[HX711] Tare complete; sampling enabled"); }
  else Serial.println("[HX711] Sampling disabled: check wiring and reboot with empty platform. WiFi diagnostics continue.");
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false); // bounded attempts managed by serviceWifi()
  wifiConfigured = strlen(WIFI_SSID) > 0 && strlen(WIFI_PASSWORD) > 0 &&
    strstr(WIFI_SSID, "YOUR_") == nullptr && strstr(WIFI_PASSWORD, "REPLACE") == nullptr;
  if (wifiConfigured) startWifi();
  else Serial.println("[WiFi] CONFIG ERROR: SSID/password empty or placeholder; configure private scale_secrets.h and recompile");
  Serial.printf("[CONFIG] Transport=%s; token=%s (values never logged)\n", LOCAL_HTTP_TEST ? "private LAN HTTP" : "verified HTTPS", strlen(DEVICE_TOKEN) >= 24 ? "length valid" : "missing/too short");
  if (!LOCAL_HTTP_TEST) configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.println("[BOOT] Setup complete; entering nonblocking WiFi monitor");
}

void loop() {
  delay(10);
  serviceWifi();
  if (!calibrated || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastSend < SEND_INTERVAL_MS) return;
  lastSend = millis();
  Serial.println("[HX711] Sampling gross weight");
  float sum = 0, lo = 1e9f, hi = -1e9f;
  for (byte i = 0; i < 8; ++i) {
    if (!scale.wait_ready_timeout(1200, 10)) { Serial.println("HX711 timeout"); return; }
    float value = (scale.read() - scale.get_offset()) / CALIBRATION_FACTOR;
    sum += value; lo = min(lo, value); hi = max(hi, value);
    delay(70);
  }
  float gross = sum / 8.0f;
  if (!isfinite(gross) || gross < 0 || gross > 20000) { Serial.println("[HX711] Invalid/out-of-range gross weight; upload skipped"); return; }
  Serial.printf("[HX711] Gross=%.1f g spread=%.2f g\n", gross, hi-lo);
  if (hi - lo > 2.0f) { Serial.println("Unstable: waiting"); return; }
  if (strlen(DEVICE_TOKEN) < 24) { Serial.println("Device token configuration missing"); return; }

  WiFiClient plain;
  BearSSL::WiFiClientSecure tls;
  plain.setTimeout(5000);
  tls.setTimeout(5000);
  BearSSL::X509List cert(ROOT_CA);
  HTTPClient http;
  http.setTimeout(5000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  bool started = false;
  if (LOCAL_HTTP_TEST) {
    if (!localEndpoint()) { Serial.println("Local HTTP requires a private IPv4 endpoint"); return; }
    // Log only a validated numeric target, never the raw URL or headers.
    String authority = String(API_URL).substring(7);
    int slash = authority.indexOf('/');
    if (slash >= 0) authority = authority.substring(0, slash);
    int colon = authority.indexOf(':');
    uint16_t port = colon >= 0 ? authority.substring(colon + 1).toInt() : 80;
    String host = colon >= 0 ? authority.substring(0, colon) : authority;
    IPAddress target; target.fromString(host);
    Serial.printf("[TARGET] LAN HTTP host=%s port=%u\n", target.toString().c_str(), port);
    IPAddress mask = WiFi.subnetMask(), local = WiFi.localIP();
    bool sameSubnet = true;
    for (byte i = 0; i < 4; ++i) if ((target[i] & mask[i]) != (local[i] & mask[i])) sameSubnet = false;
    Serial.printf("[TCP] Target on same subnet=%s; starting probe (3 s timeout)\n", sameSubnet ? "yes" : "no");
    WiFiClient probe;
    probe.setTimeout(3000);
    unsigned long probeStarted = millis();
    bool reachable = probe.connect(target, port);
    Serial.printf("[TCP] Probe %s after %lu ms\n", reachable ? "connected" : "FAILED", millis()-probeStarted);
    probe.stop();
    if (!reachable) {
      Serial.println("[TCP] No HTTP sent. Check listener, Windows active firewall profile, and AP/client isolation.");
      return;
    }
    Serial.println("[HTTP] Parsing endpoint with plain WiFiClient (no TLS/DNS)");
    started = http.begin(plain, API_URL);
  } else {
    if (!String(API_URL).startsWith("https://")) { Serial.println("HTTPS required"); return; }
    if (time(nullptr) < 1700000000) { Serial.println("Waiting for TLS clock sync"); return; }
    tls.setTrustAnchors(&cert); // Never setInsecure().
    started = http.begin(tls, API_URL);
  }
  if (!started) { Serial.println("HTTP setup failed"); return; }
  Serial.println("[HTTP] Endpoint parsed; preparing request (headers not logged)");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  String json = String("{\"deviceId\":\"DLOOP-SCALE-01\",\"grossG\":") + String(gross, 1) + ",\"stable\":true}";
  Serial.println("[HTTP] POST starting; client/connect/read timeout configured to 5 s");
  unsigned long uploadStarted = millis();
  int code = http.POST(json);
  Serial.printf("[HTTP] Completed in %lu ms; response code=%d\n", millis()-uploadStarted, code);
  if (code < 0) Serial.printf("[HTTP] Transport error: %s\n", HTTPClient::errorToString(code).c_str());
  else if (code == 401) Serial.println("[HTTP] Unauthorized: check device token privately");
  else if (code == 400) Serial.println("[HTTP] Backend rejected reading");
  else if (code == 503) Serial.println("[HTTP] Backend unavailable/configuration missing");
  Serial.printf("Gross %.1f g stable=1 API HTTP %d\n", gross, code);
  http.end();
}
