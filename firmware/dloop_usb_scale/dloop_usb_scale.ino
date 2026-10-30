// NodeMCU 1.0 ESP-12E. USB only; no credentials or inventory/network client.
// See docs/PHASE-5B-FIRMWARE.md before upload/calibration. Never auto-zero.
#include <Arduino.h>
#include <ESP8266WiFi.h> // Used ONLY to disable the radio/persistent Wi-Fi state.
#include <EEPROM.h>
#include <HX711.h>
#include <math.h>
#include <stddef.h>
#include "scale_config.h"

HX711 sensor;
struct CalibrationRecord {
  uint32_t magic, version;
  int32_t offset;
  float factor;
  uint32_t checksum;
};
static_assert(sizeof(CalibrationRecord) == 20, "EEPROM record layout changed");
CalibrationRecord saved = {};
long rawWindow[WINDOW_SIZE] = {};
uint8_t sampleCount = 0, cursor = 0;
uint32_t lastSample = 0, lastPoll = 0, lastEmit = 0, seq = 0;
bool sequenceExhausted = false, calibrated = false, zeroed = false;
bool verified = false, eepromReady = false;
bool zeroCapturedThisSession = false;
float factor = 0, calibrationMass = 0, verificationMass = 0;
long platformOffset = 0;
char command[64] = {};
uint8_t commandLength = 0;
bool discardCommand = false;
const char* transientFault = nullptr;
uint32_t transientUntil = 0;

uint32_t recordChecksum(const CalibrationRecord& record) {
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&record);
  uint32_t hash = 2166136261UL;
  for (size_t i = 0; i < offsetof(CalibrationRecord, checksum); ++i) {
    hash ^= bytes[i]; hash *= 16777619UL;
  }
  return hash;
}

bool validFactor(float value) {
  return isfinite(value) && fabsf(value) >= MIN_FACTOR && fabsf(value) <= MAX_FACTOR;
}

void resetWindow() { sampleCount = 0; cursor = 0; }

// No runtime String concatenation. Every application output line is v1 JSON.
void emit(const char* fault, float gross, bool stable) {
  if (sequenceExhausted) return; // Do not wrap into duplicate sequence IDs.
  char mass[24], frame[256];
  if (fault) strcpy(mass, "null");
  else snprintf(mass, sizeof(mass), "%.2f", static_cast<double>(gross));
  char faultField[80] = {};
  if (fault) snprintf(faultField, sizeof(faultField), ",\"fault\":\"%s\"", fault);
  snprintf(frame, sizeof(frame), FRAME_FORMAT,
    static_cast<unsigned long>(seq), mass, stable && !fault ? "true" : "false",
    calibrated ? "true" : "false", faultField);
  Serial.print(frame);
  if (seq == UINT32_MAX) sequenceExhausted = true;
  else ++seq;
}

void commandFault(const char* code) {
  transientFault = code; transientUntil = millis() + 2000;
  emit(code, 0, false);
}

bool rawStats(double& mean, long& spread) {
  if (sampleCount != WINDOW_SIZE || uint32_t(millis() - lastSample) > SAMPLE_FRESH_MS) return false;
  long sorted[WINDOW_SIZE];
  memcpy(sorted, rawWindow, sizeof(sorted));
  // Small fixed window; insertion sort costs no heap allocation.
  for (uint8_t i = 1; i < WINDOW_SIZE; ++i) {
    long value = sorted[i]; int j = i - 1;
    while (j >= 0 && sorted[j] > value) { sorted[j + 1] = sorted[j]; --j; }
    sorted[j + 1] = value;
  }
  spread = sorted[WINDOW_SIZE - 1] - sorted[0];
  int64_t sum = 0;
  for (uint8_t i = 2; i < WINDOW_SIZE - 2; ++i) sum += sorted[i];
  mean = double(sum) / (WINDOW_SIZE - 4);
  return true;
}

bool stableWindow(double mean, long spread, float countsPerGram) {
  if (!validFactor(countsPerGram) || spread / fabsf(countsPerGram) > STABLE_SPREAD_G) return false;
  double first = 0, second = 0;
  for (uint8_t i = 0; i < WINDOW_SIZE; ++i) {
    long raw = rawWindow[(cursor + i) % WINDOW_SIZE];
    if (i < WINDOW_SIZE / 2) first += raw; else second += raw;
    double grams = (double(raw) - platformOffset) / countsPerGram;
    if (!isfinite(grams) || grams < -ZERO_TOLERANCE_G || grams > MAX_GROSS_G) return false;
  }
  double trend = fabs(first - second) / (WINDOW_SIZE / 2) / fabsf(countsPerGram);
  double latest = rawWindow[(cursor + WINDOW_SIZE - 1) % WINDOW_SIZE];
  return trend <= STABLE_TREND_G && fabs(latest - mean) / fabsf(countsPerGram) <= LATEST_TOLERANCE_G;
}

void invalidateCalibration() {
  calibrated = false; verified = false; verificationMass = 0;
}

// Must be committed before altering zero/factor. A failed flash write blocks commands.
bool invalidateSavedRecord() {
  if (!eepromReady) return false;
  CalibrationRecord invalid = {};
  EEPROM.put(0, invalid);
  return EEPROM.commit();
}

bool parseMass(const char* text, float& result) {
  if (!text[0]) return false;
  // Deliberately accept only unsigned decimal grams, no exponent/NaN/trailing text.
  bool dot = false, digit = false;
  for (const char* p = text; *p; ++p) {
    if (*p == '.' && !dot) { dot = true; continue; }
    if (*p < '0' || *p > '9') return false;
    digit = true;
  }
  result = strtof(text, nullptr);
  return digit && isfinite(result) && result >= MIN_REFERENCE_G && result <= MAX_GROSS_G;
}

void processCommand(const char* text) {
  double mean = 0; long spread = 0;
  if (!strcmp(text, "CANCEL")) {
    invalidateCalibration(); factor = 0; zeroed = false; zeroCapturedThisSession = false;
    if (!invalidateSavedRecord()) commandFault("STORAGE_ERROR");
    else commandFault("CALIBRATION_REQUIRED");
    resetWindow(); return;
  }
  if (!strcmp(text, "ZERO EMPTY")) {
    // Explicit operator assertion: firmware cannot detect a spool on the platform.
    if (!rawStats(mean, spread) || spread > ZERO_RAW_SPREAD) { commandFault("ZERO_UNSTABLE"); return; }
    invalidateCalibration();
    if (!invalidateSavedRecord()) { commandFault("STORAGE_ERROR"); return; }
    platformOffset = lround(mean); zeroed = true; zeroCapturedThisSession = true;
    factor = 0; calibrationMass = 0;
    resetWindow(); commandFault("CALIBRATION_REQUIRED"); return;
  }
  if (!strncmp(text, "CAL ", 4)) {
    float grams;
    // A new calibration attempt always revokes previous approval before validation.
    invalidateCalibration();
    if (!invalidateSavedRecord()) { commandFault("STORAGE_ERROR"); return; }
    if (!zeroCapturedThisSession || !zeroed || !parseMass(text + 4, grams) || !rawStats(mean, spread)) {
      factor = 0; commandFault("CALIBRATION_REQUIRED"); return;
    }
    float candidate = (mean - platformOffset) / grams;
    if (!validFactor(candidate) || !stableWindow(mean, spread, candidate)) {
      factor = 0; commandFault("CALIBRATION_UNSTABLE"); return;
    }
    factor = candidate; calibrationMass = grams;
    resetWindow(); emit(nullptr, grams, false); return;
  }
  if (!strncmp(text, "VERIFY ", 7)) {
    float grams; verified = false;
    if (calibrated || !zeroed || !validFactor(factor) || !parseMass(text + 7, grams) ||
        fabsf(grams - calibrationMass) < fmaxf(20, calibrationMass * 0.1f) ||
        !rawStats(mean, spread) || !stableWindow(mean, spread, factor)) {
      commandFault("VERIFICATION_FAILED"); return;
    }
    double measured = (mean - platformOffset) / factor;
    if (fabs(measured - grams) > fmaxf(VERIFY_ABS_G, grams * VERIFY_RELATIVE)) {
      commandFault("VERIFICATION_FAILED"); return;
    }
    verificationMass = grams; verified = true; emit(nullptr, measured, true); return;
  }
  if (!strcmp(text, "ACCEPT")) {
    if (!verified || !rawStats(mean, spread) || !stableWindow(mean, spread, factor) ||
        fabs((mean - platformOffset) / factor - verificationMass) >
          fmaxf(VERIFY_ABS_G, verificationMass * VERIFY_RELATIVE)) {
      commandFault("VERIFICATION_FAILED"); return;
    }
    CalibrationRecord record = {RECORD_MAGIC, 1, static_cast<int32_t>(platformOffset), factor, 0};
    record.checksum = recordChecksum(record);
    EEPROM.put(0, record);
    if (!EEPROM.commit()) { invalidateCalibration(); commandFault("STORAGE_ERROR"); return; }
    saved = record; calibrated = true; verified = false; transientFault = nullptr;
    resetWindow(); return;
  }
  commandFault("COMMAND_REJECTED");
}

void readCommands() {
  // Bound work each loop so serial spam cannot starve sensor/heartbeat processing.
  for (uint8_t budget = 0; budget < 64 && Serial.available(); ++budget) {
    char c = Serial.read();
    if (c == '\n') {
      if (discardCommand) commandFault("COMMAND_REJECTED");
      else { command[commandLength] = 0; processCommand(command); }
      commandLength = 0; discardCommand = false;
    } else if (c != '\r' && !discardCommand) {
      if (c < 32 || c > 126 || commandLength >= sizeof(command) - 1) discardCommand = true;
      else command[commandLength++] = c;
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(false);
  WiFi.persistent(false);
  WiFi.mode(WIFI_OFF);
  WiFi.forceSleepBegin(); // No begin/association, SSID, token, HTTP, NFC or network loop.
  delay(1);
  sensor.begin(D5, D6, 128); // DT GPIO14, SCK GPIO12; channel A gain 128.
  EEPROM.begin(64); // ESP8266 API returns void. Allocation is checked via getDataPtr.
  eepromReady = EEPROM.getDataPtr() != nullptr;
  if (eepromReady) EEPROM.get(0, saved);
  if (saved.magic == RECORD_MAGIC && saved.version == 1 &&
      saved.checksum == recordChecksum(saved) && validFactor(saved.factor) &&
      saved.offset > -8388600 && saved.offset < 8388600) {
    platformOffset = saved.offset; factor = saved.factor; calibrated = true; zeroed = true;
  }
  lastSample = millis(); lastEmit = millis();
  emit("HX711_NOT_READY", 0, false);
}

void loop() {
  uint32_t now = millis();
  if (uint32_t(now - lastPoll) >= SAMPLE_INTERVAL_MS) {
    lastPoll = now;
    if (sensor.is_ready()) {
      long raw = sensor.read(); // Single owner, only called after ready; no long averaging waits.
      lastSample = millis();
      double rawGrams = validFactor(factor) ? (double(raw) - platformOffset) / factor : 0;
      if (raw <= -8388600L || raw >= 8388600L ||
          (validFactor(factor) && (!isfinite(rawGrams) || rawGrams > MAX_GROSS_G ||
            rawGrams < (calibrated ? -ZERO_TOLERANCE_G : 0)))) {
        resetWindow(); verified = false; transientFault = "OUT_OF_RANGE"; transientUntil = millis() + 2000;
      } else {
        rawWindow[cursor] = raw; cursor = (cursor + 1) % WINDOW_SIZE;
        if (sampleCount < WINDOW_SIZE) ++sampleCount;
      }
    }
  }
  readCommands();
  now = millis();
  if (uint32_t(now - lastSample) > SAMPLE_FRESH_MS) { resetWindow(); verified = false; }
  if (uint32_t(now - lastEmit) >= EMIT_INTERVAL_MS) {
    lastEmit = now;
    double mean = 0; long spread = 0;
    if (uint32_t(now - lastSample) > SENSOR_TIMEOUT_MS) emit("HX711_TIMEOUT", 0, false);
    else if (uint32_t(now - lastSample) > SAMPLE_FRESH_MS) emit("HX711_NOT_READY", 0, false);
    else if (transientFault && int32_t(transientUntil - now) > 0) emit(transientFault, 0, false);
    else if (!zeroed || !validFactor(factor)) emit("CALIBRATION_REQUIRED", 0, false);
    else if (!rawStats(mean, spread)) emit("HX711_NOT_READY", 0, false);
    else {
      double gross = (mean - platformOffset) / factor;
      if (!isfinite(gross) || gross < (calibrated ? -ZERO_TOLERANCE_G : 0) || gross > MAX_GROSS_G)
        emit("OUT_OF_RANGE", 0, false);
      else emit(nullptr, fabs(gross) <= ZERO_TOLERANCE_G && calibrated ? 0 : fmax(0, gross),
                stableWindow(mean, spread, factor) && gross >= -ZERO_TOLERANCE_G);
    }
  }
  delay(1); // ESP8266 watchdog cooperation; no network work.
}
