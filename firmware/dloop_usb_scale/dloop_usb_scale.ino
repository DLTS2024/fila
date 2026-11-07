// NodeMCU 1.0 ESP-12E. USB only; no credentials or inventory/network client.
// See docs/PHASE-5B-FIRMWARE.md before upload/calibration. Never auto-zero.
#include <Arduino.h>
#include <ESP8266WiFi.h> // Used ONLY to disable the radio/persistent Wi-Fi state.
#include <EEPROM.h>
#include <HX711.h>
#include <math.h>
#include <stddef.h>
#include "scale_config.h"
#include "raw_stability.h"
#include "diagnostic_reporter.h"
#include "approximate_weighing.h"
#include "approximate_calibration.h"
#include "live_preview.h"
#ifdef DLOOP_WIFI_ENABLED
#include "../dloop_wifi_scale/wifi_transport.h"
#include "../dloop_wifi_scale/single_point_calibration.h"
#endif

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
RawStability::Hold quietHold;
LivePreview::Filter livePreview;
ApproximateWeighing::Filter approximateFilter;
bool approximateMode = false, approximateReferenceVerified = false;
ApproximateCalibration::Session approximateCalibration;
ApproximateCalibration::Record approximateSaved;
uint32_t calibrationRecordsLost=0, calibrationProtocolLost=0;
SamplingDiagnostics::Reporter diagnostics;
#ifdef DLOOP_WIFI_ENABLED
bool singlePointMode=false;
bool singlePointInstalled=false;
SinglePointCalibration::Session singlePointCalibration{approximateCalibration.raw,approximateCalibration.times,approximateCalibration.scratch};
SinglePointCalibration::Record singlePointSaved;
uint32_t singleRecordsLost=0,singleProtocolLost=0,singleDiagnosticLost=0,singleFormatLost=0;
void emitSinglePoint(const char* fault);
bool wifiCalibrationRequested = false;
bool queueWifiDiagnostic(const char* text) {
  if (!text) { ++diagnostics.formatLost; diagnostics.overflow(); return false; }
  return diagnostics.queueDiagnostic(text);
}
#endif
uint32_t lastLegacyReport = 0;

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
// Temporary, opt-in Serial Monitor diagnostics. Never used by calibration logic.
bool debugRawEnabled = false, rawObserved = false, readyAtPoll = false;
long lastRaw = 0;
const char* lastPollResult = "NOT_SAMPLED";
ApproximateCalibration::PollContext acquisitionPoll;
bool haveAcquisitionPoll=false;
constexpr char DEBUG_RAW_FORMAT[] = "#DEBUG RAW event=%s raw=%s min=%s max=%s spread=%s count=%u/%u readyAtPoll=%s poll=%s ageMs=%s zeroCheck=%s centre=%.2f central=%.2f mad=%.2f half=%.2f slope=%.2f latest=%.2f hold=%u/4 drift=%.2f pending=%u/16 prevValid=%s prevCentre=%.2f centreDelta=%.2f resetId=%lu resetReason=%s resetHold=%u resetPending=%u resetPrevValid=%s resetPrev=%.2f resetDelta=%.2f resetSpan=%.2f resetValue=%.2f resetLimit=%.2f\n";

RawStability::Stats windowStats() {
  long ordered[WINDOW_SIZE];
  for (uint8_t i = 0; i < WINDOW_SIZE; ++i) ordered[i] = rawWindow[(cursor + i) % WINDOW_SIZE];
  return RawStability::analyse(ordered);
}
void reportDebugRaw(const char* event) {
  if (!debugRawEnabled) return;
  if (!strcmp(event, "POLL")) {
    if (uint32_t(millis() - lastLegacyReport) < 1000) return;
    lastLegacyReport = millis();
  }
  char raw[16] = "NA", low[16] = "NA", high[16] = "NA";
  char range[16] = "NA", age[16] = "NA", output[768];
  uint32_t ageMs = uint32_t(millis() - lastSample);
  if (rawObserved) {
    snprintf(raw, sizeof(raw), "%ld", lastRaw);
    snprintf(age, sizeof(age), "%lu", static_cast<unsigned long>(ageMs));
  }
  long spread = 0;
  if (sampleCount) {
    long minimum = rawWindow[0], maximum = rawWindow[0];
    for (uint8_t i = 1; i < sampleCount; ++i) {
      if (rawWindow[i] < minimum) minimum = rawWindow[i];
      if (rawWindow[i] > maximum) maximum = rawWindow[i];
    }
    spread = maximum - minimum;
    snprintf(low, sizeof(low), "%ld", minimum);
    snprintf(high, sizeof(high), "%ld", maximum);
    snprintf(range, sizeof(range), "%ld", spread);
  }
  RawStability::Stats stats;
  if (sampleCount == WINDOW_SIZE) stats = windowStats();
  const char* zeroCheck = sampleCount != WINDOW_SIZE ? "WAIT_WINDOW" :
    ageMs > SAMPLE_FRESH_MS ? "STALE" : !stats.quiet ? RawStability::reason(stats) :
    !quietHold.settled ? "SETTLING" : "PASS";
  snprintf(output, sizeof(output), DEBUG_RAW_FORMAT, event, raw, low, high, range,
    static_cast<unsigned>(sampleCount), static_cast<unsigned>(WINDOW_SIZE),
    readyAtPoll ? "true" : "false", lastPollResult, age, zeroCheck, stats.centre, stats.centralRange, stats.mad,
    stats.halfShift, stats.slope, stats.latestDelta, quietHold.count, quietHold.drift(stats.centre),
    quietHold.pending, quietHold.previousValid ? "true" : "false", quietHold.previousCentre, quietHold.centreDelta,
    static_cast<unsigned long>(quietHold.resetId), RawStability::Hold::resetName(quietHold.lastReset),
    quietHold.resetCount, quietHold.resetPending, quietHold.resetPreviousValid ? "true" : "false",
    quietHold.resetPrevious, quietHold.resetDelta, quietHold.resetSpan, quietHold.resetValue, quietHold.resetLimit);
  diagnostics.queueDiagnostic(output);
}

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

void resetWindow(RawStability::Hold::ResetReason why) {
#ifdef DLOOP_WIFI_ENABLED
  wifiScale.invalidatePreview();
  if(singlePointCalibration.active() && (why==RawStability::Hold::ResetReason::STALE || why==RawStability::Hold::ResetReason::RAW_RANGE))singlePointCalibration.fail("SENSOR_FAULT");
#endif
  livePreview.reset();
  if (approximateCalibration.active() && (why==RawStability::Hold::ResetReason::STALE ||
      why==RawStability::Hold::ResetReason::RAW_RANGE)) {
    approximateCalibration.fail("SENSOR_FAULT");reportApproximateCalibration();
  }
  approximateFilter.reset();
  sampleCount = 0; cursor = 0; quietHold.reset(why);
  // Mirror still holds the pre-clear raw window, including partial/stale windows.
  diagnostics.reset(quietHold, millis(), lastRaw, lastSample, rawObserved);
  diagnostics.samples.clearWindow();
}

void serviceSerialOutput() {
  diagnostics.tick(millis(), quietHold);
#ifdef DLOOP_WIFI_ENABLED
  const uint32_t started = micros();
  for (unsigned sent = 0; sent < 256 && uint32_t(micros()-started) < 500;) {
    unsigned remaining = 0;
    const char* data = diagnostics.output.peek(remaining);
    const int freeBytes = Serial.availableForWrite();
    if (!data || freeBytes <= 0) break;
    const unsigned count = min(remaining, min(unsigned(freeBytes), 256U-sent));
    const unsigned written = Serial.write(reinterpret_cast<const uint8_t*>(data), count);
    if (!written) break;
    diagnostics.output.consume(written); sent += written;
  }
#else
  unsigned remaining = 0;
  const char* data = diagnostics.output.peek(remaining);
  int freeBytes = Serial.availableForWrite();
  if (!data || freeBytes <= 0) return;
  unsigned count = min(remaining, min(unsigned(freeBytes), 32U));
  diagnostics.output.consume(Serial.write(reinterpret_cast<const uint8_t*>(data), count));
#endif
}

// No runtime String concatenation. Measurement/status output remains v1 JSON.
// Opt-in #DEBUG RAW lines are monitor-only, never measurement frames.
void emit(const char* fault, float gross, bool stable) {
#ifdef DLOOP_WIFI_ENABLED
  if(singlePointMode){emitSinglePoint(fault);return;}
#endif
  if (sequenceExhausted) return; // Do not wrap into duplicate sequence IDs.
  if (approximateCalibration.pending()) { if (!fault) fault = "NOT_READY"; stable = false; calibrated = false; }
  char mass[24], frame[512];
  if (fault) strcpy(mass, "null");
  else snprintf(mass, sizeof(mass), "%.2f", static_cast<double>(gross));
  char faultField[320] = {};
  if (fault) snprintf(faultField, sizeof(faultField), ",\"fault\":\"%s\"", fault);
  if (approximateMode) strncat(faultField, ",\"mode\":\"APPROXIMATE\"", sizeof(faultField)-strlen(faultField)-1);
  const uint32_t previewAge=rawObserved?uint32_t(millis()-lastSample):UINT32_MAX;
  const bool previewFresh=livePreview.ready&&previewAge<=SAMPLE_FRESH_MS;
  const bool strictCalibrated=calibrated&&!approximateMode&&validFactor(factor);
  char previewRaw[24]="null",previewGrams[24]="null";
  if(previewFresh)snprintf(previewRaw,sizeof(previewRaw),"%.2f",livePreview.counts);
  if(previewFresh&&strictCalibrated)snprintf(previewGrams,sizeof(previewGrams),"%.2f",(livePreview.counts-platformOffset)/factor);
  const char* stage=approximateMode?"STRICT_REQUIRED":strictCalibrated?"DONE":verified?"ACCEPT":
    zeroCapturedThisSession&&validFactor(factor)?"VERIFY":zeroCapturedThisSession?"LOAD":"EMPTY";
  const size_t used=strlen(faultField);
  snprintf(faultField+used,sizeof(faultField)-used,
    ",\"live\":{\"raw\":%s,\"grams\":%s,\"ageMs\":%lu,\"calibrated\":%s,\"strictStable\":%s,\"hold\":%u,\"pending\":%u,\"stage\":\"%s\",\"spike\":%s}",
    previewRaw,previewGrams,static_cast<unsigned long>(previewAge),strictCalibrated?"true":"false",
    quietHold.settled?"true":"false",quietHold.count,quietHold.pending,stage,livePreview.spike?"true":"false");
  snprintf(frame, sizeof(frame), FRAME_FORMAT,
    static_cast<unsigned long>(seq), mass, stable && !fault ? "true" : "false",
    calibrated ? "true" : "false", faultField);
  diagnostics.protocol(frame);
#ifdef DLOOP_WIFI_ENABLED
  const bool warming=!calibrated&&!previewFresh&&fault&&!strcmp(fault,"CALIBRATION_REQUIRED");
  wifiScale.queue(frame,!calibrated,previewAge,previewFresh,lastSample,warming);
#endif
  if (seq == UINT32_MAX) sequenceExhausted = true;
  else ++seq;
}

void commandFault(const char* code) {
  transientFault = code; transientUntil = millis() + 2000;
  emit(code, 0, false);
}

bool rawStats(double& mean, long& spread) {
  if (sampleCount != WINDOW_SIZE || uint32_t(millis() - lastSample) > SAMPLE_FRESH_MS) return false;
  const auto stats = windowStats();
  spread = stats.spread; mean = stats.centre;
  return true;
}

bool stableWindow(double mean, long spread, float countsPerGram) {
  (void)spread;
  if (!validFactor(countsPerGram) || !quietHold.settled) return false;
  const auto stats = windowStats();
  double magnitude = fabsf(countsPerGram);
  double grams = (mean - platformOffset) / countsPerGram;
  return stats.quiet && isfinite(grams) && grams >= -ZERO_TOLERANCE_G && grams <= MAX_GROSS_G &&
    stats.centralRange / magnitude <= STABLE_CENTRAL_G && stats.mad / magnitude <= STABLE_MAD_G &&
    quietHold.drift(stats.centre) / magnitude <= STABLE_HOLD_G;
}

void invalidateCalibration() {
  approximateReferenceVerified = false; approximateFilter.reset();
  calibrated = false; verified = false; verificationMass = 0;
}

// Must be committed before altering zero/factor. A failed flash write blocks commands.
bool invalidateSavedRecord() {
  saved = {}; // Mode selection must not resurrect a strict record invalidated in this boot.
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

bool validStrictSaved() {
  return saved.magic==RECORD_MAGIC && saved.version==1 && saved.checksum==recordChecksum(saved) &&
    validFactor(saved.factor) && saved.offset>-8388600 && saved.offset<8388600;
}

#ifdef DLOOP_WIFI_ENABLED
// Inspect the existing EEPROM mirror into local copies; never begin, put,
// commit, select a mode, or alter an in-progress calibration session.
void reportWifiCalibration() {
  CalibrationRecord strictRecord = {};
  ApproximateCalibration::Record approximateRecord = {};
  if (eepromReady) {
    EEPROM.get(0, strictRecord);
    EEPROM.get(ApproximateCalibration::EEPROM_ADDRESS, approximateRecord);
  }
  const bool strictValid = eepromReady && strictRecord.magic==RECORD_MAGIC && strictRecord.version==1 &&
    strictRecord.checksum==recordChecksum(strictRecord) && validFactor(strictRecord.factor) &&
    strictRecord.offset>-8388600 && strictRecord.offset<8388600;
  char line[224];
  snprintf_P(line,sizeof(line),PSTR("#DEBUG WIFI_CALIBRATION eeprom_ready=%u strict_valid=%u approximate_valid=%u active_mode=%s factor_active=%u\n"),
    unsigned(eepromReady),unsigned(strictValid),
    unsigned(eepromReady&&ApproximateCalibration::validRecord(approximateRecord)),
    singlePointMode?"SINGLE_POINT":approximateMode?"APPROX":"STRICT",unsigned(singlePointMode?singlePointInstalled:calibrated&&zeroed&&validFactor(factor)));
  queueWifiDiagnostic(line);
}
#endif

void selectWeighingMode(bool approximate) {
  approximateCalibration.abort(); invalidateCalibration();
  approximateMode=approximate; zeroed=false;zeroCapturedThisSession=false;factor=0;
  if (approximate && ApproximateCalibration::validRecord(approximateSaved)) {
    platformOffset=approximateSaved.offset;factor=ApproximateCalibration::recordFactor(approximateSaved);
    zeroed=calibrated=true;
  } else if (validStrictSaved()) {
    platformOffset=saved.offset;factor=saved.factor;zeroed=calibrated=true;
  }
}

void reportAcquisitionGap(const ApproximateCalibration::AcquisitionGap& g) {
  char line[768];const auto& p=g.poll;
  snprintf(line,sizeof(line),ApproximateCalibration::GAP_FORMAT,g.condition(),
    g.idGap?"true":"false",g.tooFast?"true":"false",g.tooSlow?"true":"false",
    static_cast<unsigned long long>(g.previousId),static_cast<unsigned long long>(g.currentId),
    static_cast<unsigned long>(g.previousMs),static_cast<unsigned long>(g.currentMs),static_cast<unsigned long>(g.deltaMs),
    g.retainedSamples,ApproximateCalibration::name(g.previousState),p.available?"true":"false",p.ready?"true":"false",
    static_cast<unsigned long>(p.pollMs),p.previousAvailable?"true":"false",p.previousReady?"true":"false",
    static_cast<unsigned long>(p.previousPollMs),static_cast<unsigned long>(p.pollDeltaMs),
    static_cast<unsigned long>(p.readStartMs),static_cast<unsigned long>(p.readEndMs),
    static_cast<unsigned long>(uint32_t(p.readEndMs-p.readStartMs)),
    static_cast<unsigned long>(p.notReadySinceAccepted),p.haveNotReady?"true":"false",static_cast<unsigned long>(p.lastNotReadyMs));
  diagnostics.queueDiagnostic(line);
}

void reportApproximateCalibration() {
  if(approximateCalibration.gap.valid){reportAcquisitionGap(approximateCalibration.gap);return;}
  char line[512];
  snprintf(line,sizeof(line),"#ACAL state=%s reason=%s samples=%u/200 cycles=%u/3 candidate=%s centreRaw=%.3f measuredCandidateG=%.3f rawMad=%.3f rawSlope=%.3f rawBlockSpan=%.3f\n",
    ApproximateCalibration::name(approximateCalibration.state),approximateCalibration.reason,
    approximateCalibration.count,approximateCalibration.cycles,approximateCalibration.factor?"FROZEN":"NONE",
    approximateCalibration.last.centre,approximateCalibration.lastMeasured,approximateCalibration.last.mad,
    approximateCalibration.last.slope,approximateCalibration.last.span);
  diagnostics.queueDiagnostic(line);
}

bool approximateCalibrationCommand(const char* text) {
  if (strncmp(text,"APPROX CAL ",11)) return false;
  const char* action=text+11;
  if (!strcmp(action,"STATUS")) {reportApproximateCalibration();return true;}
  if (!strcmp(action,"ABORT")) {
    approximateCalibration.abort();invalidateCalibration();zeroed=false;factor=0;
    reportApproximateCalibration();return true;
  }
  if (!strcmp(action,"BEGIN")) {
    approximateCalibration.abort();
    approximateMode=true;invalidateCalibration();zeroed=false;factor=0;zeroCapturedThisSession=false;
    approximateSaved=ApproximateCalibration::Record{};
    if (!eepromReady) {approximateCalibration.fail("STORAGE_UNAVAILABLE");reportApproximateCalibration();commandFault("STORAGE_ERROR");return true;}
    EEPROM.put(ApproximateCalibration::EEPROM_ADDRESS,approximateSaved);
    if (!EEPROM.commit()) {approximateCalibration.fail("STORAGE_INVALIDATION");reportApproximateCalibration();commandFault("STORAGE_ERROR");return true;}
    resetWindow(RawStability::Hold::ResetReason::MANUAL);
    calibrationRecordsLost=diagnostics.recordsLost;calibrationProtocolLost=diagnostics.protocolLost;
    approximateCalibration.begin(millis());reportApproximateCalibration();return true;
  }
  if (!strcmp(action,"ACCEPT")) {
    if (approximateCalibration.active() && (diagnostics.recordsLost!=calibrationRecordsLost ||
        diagnostics.protocolLost!=calibrationProtocolLost)) approximateCalibration.fail("LOG_OUTPUT_LOSS");
    approximateCalibration.tick(millis());
    if (!approximateCalibration.canAccept(millis())) {reportApproximateCalibration();commandFault("NOT_READY");return true;}
    const auto record=approximateCalibration.record();
    if (!ApproximateCalibration::validRecord(record) || !eepromReady) {approximateCalibration.fail("STORAGE_RECORD");commandFault("STORAGE_ERROR");return true;}
    EEPROM.put(ApproximateCalibration::EEPROM_ADDRESS,record);
    if (!EEPROM.commit()) {approximateCalibration.fail("STORAGE_COMMIT");commandFault("STORAGE_ERROR");return true;}
    approximateSaved=record;
    selectWeighingMode(true); // Install only from the validated approximate slot.
    approximateReferenceVerified=true;transientFault=nullptr;
#ifdef DLOOP_WIFI_ENABLED
    wifiCalibrationRequested=false;
#endif
    resetWindow(RawStability::Hold::ResetReason::MANUAL);
    diagnostics.queueDiagnostic("#ACAL state=ACCEPTED reason=NONE cycles=3 persisted=true\n");return true;
  }
  // Check existing freshness/expiry before a command can start another stage.
  // Use the same timestamp for validation and transition: resetting stepMs must
  // never revive an expired operator wait. Accepted samples still feed all waits.
  const uint32_t commandMs=millis();
  approximateCalibration.tick(commandMs);
  if (!approximateMode || !approximateCalibration.active()) {
    reportApproximateCalibration();
    commandFault("NOT_READY");return true;
  }
  float mass=0;
  if (!strcmp(action,"EMPTY")) approximateCalibration.empty(commandMs);
  else if (!strncmp(action,"LOAD ",5) && parseMass(action+5,mass)) approximateCalibration.load(mass,commandMs);
  else if (!strncmp(action,"CHECK ",6) && parseMass(action+6,mass)) approximateCalibration.check(mass,commandMs);
  else approximateCalibration.fail("COMMAND_REFERENCE_OR_ORDER");
  reportApproximateCalibration();return true;
}

#ifdef DLOOP_WIFI_ENABLED
void reportSinglePointGap(const SinglePointCalibration::AcquisitionGap& g) {
  char line[768];const auto& p=g.poll;
  const int written=snprintf(line,sizeof(line),SinglePointCalibration::GAP_FORMAT,g.condition(),
    g.idGap?"true":"false",g.tooFast?"true":"false",g.tooSlow?"true":"false",
    static_cast<unsigned long long>(g.previousId),static_cast<unsigned long long>(g.currentId),
    static_cast<unsigned long>(g.previousMs),static_cast<unsigned long>(g.currentMs),static_cast<unsigned long>(g.deltaMs),
    g.retainedSamples,SinglePointCalibration::name(g.previousState),p.available?"true":"false",p.ready?"true":"false",
    static_cast<unsigned long>(p.pollMs),p.previousAvailable?"true":"false",p.previousReady?"true":"false",
    static_cast<unsigned long>(p.previousPollMs),static_cast<unsigned long>(p.pollDeltaMs),
    static_cast<unsigned long>(p.readStartMs),static_cast<unsigned long>(p.readEndMs),
    static_cast<unsigned long>(uint32_t(p.readEndMs-p.readStartMs)),
    static_cast<unsigned long>(p.notReadySinceAccepted),p.haveNotReady?"true":"false",static_cast<unsigned long>(p.lastNotReadyMs));
  queueWifiDiagnostic(written>=0&&size_t(written)<sizeof(line)?line:nullptr);
}

void reportSinglePointCommand() {
  const auto& c=singlePointCalibration.command;if(!c.valid)return;
  char line[320];
  const int written=snprintf_P(line,sizeof(line),PSTR("#DEBUG SINGLE_COMMAND command=%s accepted=%u previous_state=%s result_state=%s at_ms=%lu previous_stage_elapsed_ms=%lu samples_before_command=%u\n"),
    SinglePointCalibration::commandName(c.kind),unsigned(c.accepted),SinglePointCalibration::name(c.before),SinglePointCalibration::name(c.after),
    static_cast<unsigned long>(c.at),static_cast<unsigned long>(c.elapsed),c.samples);
  queueWifiDiagnostic(written>=0&&size_t(written)<sizeof(line)?line:nullptr);
}
void reportSinglePoint() {
  if(singlePointCalibration.gap.valid){reportSinglePointGap(singlePointCalibration.gap);reportSinglePointCommand();return;}
  const auto& timeout=singlePointCalibration.timeout;
  if(timeout.valid){
    char line[384];
    const int written=snprintf_P(line,sizeof(line),PSTR("#DEBUG SINGLE_TIMEOUT state=FAILED reason=STEP_TIMEOUT previous_state=%s timeout_stage=%s stage_start_ms=%lu at_ms=%lu elapsed_ms=%lu limit_ms=120000 deadline_ms=%lu samples_before_failure=%u cycles_before_failure=%u\n"),
      SinglePointCalibration::name(timeout.previous),SinglePointCalibration::name(timeout.stage),
      static_cast<unsigned long>(timeout.start),static_cast<unsigned long>(timeout.at),static_cast<unsigned long>(timeout.elapsed),
      static_cast<unsigned long>(timeout.deadline),timeout.samples,timeout.cycles);
    queueWifiDiagnostic(written>=0&&size_t(written)<sizeof(line)?line:nullptr);
    reportSinglePointCommand();return;
  }
  char line[240];
  snprintf_P(line,sizeof(line),PSTR("#DEBUG SINGLE_CAL state=%s reason=%s samples=%u/200 cycles=%u/3 saved_valid=%u reference_based=1 independent_accuracy_verified=0\n"),
    SinglePointCalibration::name(singlePointCalibration.state),singlePointCalibration.reason,singlePointCalibration.count,singlePointCalibration.cycles,
    unsigned(eepromReady&&SinglePointCalibration::validRecord(singlePointSaved)));
  queueWifiDiagnostic(line);
  reportSinglePointCommand();
}
void emitSinglePoint(const char* fault) {
  const bool installed=singlePointInstalled&&SinglePointCalibration::validRecord(singlePointSaved)&&!singlePointCalibration.pending();
  const bool fresh=rawObserved&&uint32_t(millis()-lastSample)<=SAMPLE_FRESH_MS;
  const bool ready=installed&&fresh&&approximateFilter.qualified&&approximateFilter.grams>=0&&approximateFilter.grams<=MAX_GROSS_G&&
    (!fault||!strcmp(fault,"CALIBRATION_REQUIRED"));
  char mass[24]="null",line[256];
  if(ready)snprintf(mass,sizeof(mass),"%.2f",approximateFilter.grams);
  snprintf_P(line,sizeof(line),PSTR("#DEBUG SINGLE_POINT mode=SINGLE_POINT reference_based=1 independent_accuracy_verified=0 calibrated=%u stable=%u gross_g=%s state=%s\n"),
    unsigned(installed),unsigned(ready),mass,SinglePointCalibration::name(singlePointCalibration.state));
  queueWifiDiagnostic(line); // Deliberately not a v1 API/inventory measurement.
}
bool singlePointCommand(const char* text) {
  if(!strcmp(text,"MODE SINGLE_POINT")) {
    approximateCalibration.abort();singlePointCalibration.abort();invalidateCalibration();factor=0;zeroed=false;
    singlePointMode=true;singlePointInstalled=eepromReady&&SinglePointCalibration::validRecord(singlePointSaved);
    approximateFilter.reset();wifiScale.clearQueued();reportSinglePoint();return true;
  }
  if(strncmp(text,"SINGLE CAL ",11))return false;
  const char* action=text+11;
  if(!strcmp(action,"STATUS")){reportSinglePoint();return true;}
  if(!strcmp(action,"ABORT")){
    singlePointCalibration.abort();singlePointInstalled=false;singlePointMode=false;
    wifiCalibrationRequested=false;selectWeighingMode(false);wifiScale.clearQueued();reportSinglePoint();return true;
  }
  if(!strcmp(action,"BEGIN")){
    if(approximateCalibration.pending()){queueWifiDiagnostic("#DEBUG SINGLE_CAL reason=OTHER_CALIBRATION_ACTIVE\n");return true;}
    singlePointInstalled=false;singlePointMode=true;invalidateCalibration();factor=0;zeroed=false;zeroCapturedThisSession=false;
    wifiScale.clearQueued();resetWindow(RawStability::Hold::ResetReason::MANUAL);
    singleRecordsLost=diagnostics.recordsLost;singleProtocolLost=diagnostics.protocolLost;
    singleDiagnosticLost=diagnostics.diagnosticLost;singleFormatLost=diagnostics.formatLost;
    singlePointCalibration.begin(millis());reportSinglePoint();return true;
  }
  if(!singlePointMode){queueWifiDiagnostic("#DEBUG SINGLE_CAL reason=MODE_REQUIRED\n");return true;}
  const uint32_t now=millis();
  const auto before=singlePointCalibration.state;const uint32_t elapsed=now-singlePointCalibration.stepMs;
  const unsigned samplesBefore=singlePointCalibration.count;
  const auto kind=!strncmp(action,"LOAD ",5)?SinglePointCalibration::Command::Load:
    !strcmp(action,"EMPTY")?SinglePointCalibration::Command::Empty:
    !strncmp(action,"CHECK ",6)?SinglePointCalibration::Command::Check:
    !strcmp(action,"ACCEPT")?SinglePointCalibration::Command::Accept:SinglePointCalibration::Command::None;
  const auto note=[&](bool accepted){singlePointCalibration.noteCommand(kind,now,before,elapsed,samplesBefore,accepted);};
  singlePointCalibration.tick(now);
  if(!strcmp(action,"ACCEPT")){
    if(diagnostics.recordsLost!=singleRecordsLost||diagnostics.protocolLost!=singleProtocolLost||
       diagnostics.diagnosticLost!=singleDiagnosticLost||diagnostics.formatLost!=singleFormatLost)singlePointCalibration.fail("LOG_OUTPUT_LOSS");
    if(!singlePointCalibration.canAccept(now)){note(false);reportSinglePoint();return true;}
    const auto record=singlePointCalibration.record();
    if(!eepromReady||!SinglePointCalibration::validRecord(record)){singlePointCalibration.fail("STORAGE_RECORD");note(false);reportSinglePoint();return true;}
    EEPROM.put(SinglePointCalibration::EEPROM_ADDRESS,record);
    if(!EEPROM.commit()){singlePointCalibration.fail("STORAGE_COMMIT");note(false);reportSinglePoint();return true;}
    singlePointSaved=record;singlePointInstalled=true;singlePointCalibration.abort();approximateFilter.reset();
    transientFault=nullptr;wifiCalibrationRequested=false;
    note(true);queueWifiDiagnostic("#DEBUG SINGLE_CAL state=ACCEPTED persisted=1 reference_based=1 independent_accuracy_verified=0\n");reportSinglePointCommand();return true;
  }
  if(!singlePointCalibration.active()){note(false);reportSinglePoint();return true;}
  float mass=0;bool accepted=false;
  if(!strcmp(action,"EMPTY"))accepted=singlePointCalibration.empty(now);
  else if(!strncmp(action,"LOAD ",5)&&parseMass(action+5,mass))accepted=singlePointCalibration.load(mass,now);
  else if(!strncmp(action,"CHECK ",6)&&parseMass(action+6,mass))accepted=singlePointCalibration.check(mass,now);
  else singlePointCalibration.fail("COMMAND_REFERENCE_OR_ORDER");
  note(accepted);reportSinglePoint();return true;
}
#endif

void processCommand(const char* text) {
#ifdef DLOOP_WIFI_ENABLED
  if (!strcmp(text,"DEBUG CALIBRATION")) {reportWifiCalibration();return;}
  if(singlePointCommand(text))return;
  if(!strcmp(text,"MODE STRICT")||!strcmp(text,"MODE APPROX")){
    singlePointMode=false;singlePointInstalled=false;singlePointCalibration.abort();wifiScale.clearQueued();
  }
  if(singlePointMode&&strncmp(text,"DEBUG ",6)){
    queueWifiDiagnostic("#DEBUG SINGLE_CAL reason=EXIT_SINGLE_POINT_MODE_FIRST\n");return;
  }
  // Pause before accepting a calibration attempt, including an unstable ZERO.
  if (!strcmp(text,"ZERO EMPTY") || !strncmp(text,"CAL ",4) ||
      !strncmp(text,"VERIFY ",7) || !strcmp(text,"APPROX CAL BEGIN")) wifiCalibrationRequested=true;
  if (!strcmp(text,"CANCEL") || !strcmp(text,"APPROX CAL ABORT") ||
      !strcmp(text,"MODE STRICT") || !strcmp(text,"MODE APPROX")) wifiCalibrationRequested=false;
#endif
  double mean = 0; long spread = 0;
  if (approximateCalibrationCommand(text)) return;
  if (!strcmp(text, "MODE STRICT") || !strcmp(text, "MODE APPROX")) {
    selectWeighingMode(!strcmp(text,"MODE APPROX"));
    return;
  }
  if (approximateCalibration.pending() && strncmp(text,"DEBUG ",6)) {
    approximateCalibration.fail("INTERRUPTED_COMMAND");reportApproximateCalibration();commandFault("NOT_READY");return;
  }
  // Operator assertion: place an independently known 1000 g mass, then verify.
  // This checks existing calibration; it never changes offset/factor/EEPROM.
  if (!strcmp(text, "APPROX VERIFY 1000")) {
    approximateReferenceVerified = false;
    if (!approximateMode || !calibrated || !validFactor(factor)) { commandFault("CALIBRATION_REQUIRED"); return; }
    if (!ApproximateWeighing::canVerifyReference(approximateFilter,approximateMode,calibrated&&validFactor(factor),
        uint32_t(millis()-lastSample)<=SAMPLE_FRESH_MS)) { commandFault("NOT_READY"); return; }
    approximateReferenceVerified = true;
    return;
  }
  if (!strcmp(text, "DEBUG TRACE ON") || !strcmp(text, "DEBUG TRACE FULL")) {
    debugRawEnabled = false;
    diagnostics.begin(!strcmp(text, "DEBUG TRACE FULL"), millis(), quietHold); return;
  }
  if (!strcmp(text, "DEBUG TRACE OFF")) { diagnostics.stop("USER"); return; }
  if (!strcmp(text, "DEBUG SNAPSHOT")) { diagnostics.snapshot(millis(), quietHold); return; }
  if (!strcmp(text, "DEBUG RAW") || !strcmp(text, "DEBUG RAW ON")) {
    diagnostics.stop("LEGACY_RAW");
    debugRawEnabled = true; reportDebugRaw("ENABLED"); return;
  }
  if (!strcmp(text, "DEBUG RAW OFF")) {
    if (debugRawEnabled) reportDebugRaw("DISABLED");
    debugRawEnabled = false; return;
  }
  if (!strcmp(text, "CANCEL")) {
    invalidateCalibration(); factor = 0; zeroed = false; zeroCapturedThisSession = false;
    if (!invalidateSavedRecord()) commandFault("STORAGE_ERROR");
    else commandFault("CALIBRATION_REQUIRED");
    resetWindow(RawStability::Hold::ResetReason::CANCEL); return;
  }
  if (!strcmp(text, "ZERO EMPTY")) {
    // Explicit operator assertion: firmware cannot detect a spool on the platform.
    reportDebugRaw("ZERO_EMPTY"); // Snapshot of the same window before any reset.
    if (!rawStats(mean, spread) || !windowStats().quiet || !quietHold.settled) { commandFault("ZERO_UNSTABLE"); return; }
    invalidateCalibration();
    if (!invalidateSavedRecord()) { commandFault("STORAGE_ERROR"); return; }
    platformOffset = lround(mean); zeroed = true; zeroCapturedThisSession = true;
    factor = 0; calibrationMass = 0;
    resetWindow(RawStability::Hold::ResetReason::ZERO_ACCEPTED); commandFault("CALIBRATION_REQUIRED"); return;
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
    resetWindow(RawStability::Hold::ResetReason::CAL_ACCEPTED); emit(nullptr, grams, false); return;
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
#ifdef DLOOP_WIFI_ENABLED
    wifiCalibrationRequested=false;
#endif
    resetWindow(RawStability::Hold::ResetReason::CALIBRATION_ACCEPTED); return;
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
#ifndef DLOOP_WIFI_ENABLED
  WiFi.mode(WIFI_OFF);
  WiFi.forceSleepBegin(); // No begin/association, SSID, token, HTTP, NFC or network loop.
#endif
  delay(1);
  sensor.begin(D5, D6, 128); // DT GPIO14, SCK GPIO12; channel A gain 128.
  EEPROM.begin(ApproximateCalibration::EEPROM_BYTES); // Preserve strict bytes 0..19; approximate slot starts at 32.
  eepromReady = EEPROM.getDataPtr() != nullptr;
  if (eepromReady) EEPROM.get(0, saved);
  if (eepromReady) EEPROM.get(ApproximateCalibration::EEPROM_ADDRESS,approximateSaved);
#ifdef DLOOP_WIFI_ENABLED
  if(eepromReady)EEPROM.get(SinglePointCalibration::EEPROM_ADDRESS,singlePointSaved);
#endif
  if (saved.magic == RECORD_MAGIC && saved.version == 1 &&
      saved.checksum == recordChecksum(saved) && validFactor(saved.factor) &&
      saved.offset > -8388600 && saved.offset < 8388600) {
    platformOffset = saved.offset; factor = saved.factor; calibrated = true; zeroed = true;
  }
  lastSample = millis(); lastEmit = millis();
  emit("HX711_NOT_READY", 0, false);
#ifdef DLOOP_WIFI_ENABLED
  char startup[224];
  snprintf_P(startup,sizeof(startup),PSTR("#DEBUG WIFI_STARTUP eeprom_ready=%u strict_valid=%u approximate_valid=%u active_mode=%s factor_restored=%u\n"),
    unsigned(eepromReady),unsigned(eepromReady&&validStrictSaved()),
    unsigned(eepromReady&&ApproximateCalibration::validRecord(approximateSaved)),
    approximateMode?"APPROX":"STRICT",unsigned(calibrated&&zeroed&&validFactor(factor)));
  queueWifiDiagnostic(startup);
  wifiScale.begin(queueWifiDiagnostic,diagnostics.line.text,sizeof(diagnostics.line.text));
#endif
}

void loop() {
#ifdef DLOOP_WIFI_ENABLED
  // HTTPS can block on ESP8266. Enforce the existing stale-window rule before
  // accepting another conversion after a network pause; never reuse a quiet hold.
  if(rawObserved&&uint32_t(millis()-lastSample)>SAMPLE_FRESH_MS)resetWindow(RawStability::Hold::ResetReason::STALE);
#endif
  uint32_t now = millis();
  bool pollDue;
#ifdef DLOOP_WIFI_ENABLED
  if(singlePointMode)pollDue=SinglePointAcquisition::due(now,lastPoll,lastSample,rawObserved);
  else
#endif
  pollDue=uint32_t(now-lastPoll)>=SAMPLE_INTERVAL_MS;
  if (pollDue) {
    acquisitionPoll.previousPollMs=lastPoll;acquisitionPoll.pollMs=now;
    acquisitionPoll.pollDeltaMs=uint32_t(now-lastPoll);
    acquisitionPoll.previousAvailable=haveAcquisitionPoll;acquisitionPoll.previousReady=readyAtPoll;
    acquisitionPoll.available=true;haveAcquisitionPoll=true;
    lastPoll = now;
    readyAtPoll = sensor.is_ready();
    acquisitionPoll.ready=readyAtPoll;
    if (readyAtPoll) {
      acquisitionPoll.readStartMs=millis();
      long raw = sensor.read(); // Single owner, only called after ready; no long averaging waits.
      lastRaw = raw; rawObserved = true;
      lastSample = millis();
      acquisitionPoll.readEndMs=lastSample;
      double rawGrams = validFactor(factor) ? (double(raw) - platformOffset) / factor : 0;
      // Single noisy samples may cross zero. Preserve them for the robust window;
      // raw rails/extreme range still fault immediately, mean bounds remain strict.
      double noiseGuard = validFactor(factor) ? fmax(ZERO_TOLERANCE_G, RAW_HARD_RANGE / fabsf(factor)) : 0;
      if (raw <= -8388600L || raw >= 8388600L ||
          (validFactor(factor) && (!isfinite(rawGrams) || rawGrams > MAX_GROSS_G + noiseGuard ||
            rawGrams < -noiseGuard))) {
        resetWindow(RawStability::Hold::ResetReason::RAW_RANGE); verified = false; transientFault = "OUT_OF_RANGE"; transientUntil = millis() + 2000;
        lastPollResult = "OUT_OF_RANGE";
      } else {
        rawWindow[cursor] = raw; cursor = (cursor + 1) % WINDOW_SIZE;
        if (sampleCount < WINDOW_SIZE) ++sampleCount;
        RawStability::Stats stats;
        if (sampleCount == WINDOW_SIZE) stats = windowStats();
        // Timestamp is conversion completion time, not host receipt time.
        // Only the same accepted branch that fills rawWindow advances this mirror.
        diagnostics.samples.accept(raw, lastSample);
        livePreview.observe(raw,lastSample);
#ifdef DLOOP_WIFI_ENABLED
        if(!livePreview.ready)wifiScale.invalidatePreview();
#endif
        const auto oldCalibrationState=approximateCalibration.state;
        approximateCalibration.pollContext=acquisitionPoll;
        approximateCalibration.observe(raw,lastSample,diagnostics.samples.accepted,reportAcquisitionGap);
#ifdef DLOOP_WIFI_ENABLED
        if(singlePointMode){
          const auto old=singlePointCalibration.state;
          singlePointCalibration.pollContext.available=acquisitionPoll.available;
          singlePointCalibration.pollContext.ready=acquisitionPoll.ready;
          singlePointCalibration.pollContext.previousAvailable=acquisitionPoll.previousAvailable;
          singlePointCalibration.pollContext.previousReady=acquisitionPoll.previousReady;
          singlePointCalibration.pollContext.haveNotReady=acquisitionPoll.haveNotReady;
          singlePointCalibration.pollContext.pollMs=acquisitionPoll.pollMs;
          singlePointCalibration.pollContext.previousPollMs=acquisitionPoll.previousPollMs;
          singlePointCalibration.pollContext.pollDeltaMs=acquisitionPoll.pollDeltaMs;
          singlePointCalibration.pollContext.readStartMs=acquisitionPoll.readStartMs;
          singlePointCalibration.pollContext.readEndMs=acquisitionPoll.readEndMs;
          singlePointCalibration.pollContext.notReadySinceAccepted=acquisitionPoll.notReadySinceAccepted;
          singlePointCalibration.pollContext.lastNotReadyMs=acquisitionPoll.lastNotReadyMs;
          singlePointCalibration.observe(raw,lastSample,diagnostics.samples.accepted,reportSinglePointGap);
          if(old!=singlePointCalibration.state && !singlePointCalibration.gap.valid)reportSinglePoint();
          if(singlePointInstalled&&!singlePointCalibration.pending())approximateFilter.observe(
            (double(raw)-singlePointSaved.offset)/SinglePointCalibration::recordFactor(singlePointSaved),lastSample,true);
        }
#endif
        if (oldCalibrationState!=approximateCalibration.state && !approximateCalibration.gap.valid) reportApproximateCalibration();
        acquisitionPoll.notReadySinceAccepted=0;
        quietHold.observe(stats, sampleCount == WINDOW_SIZE);
        diagnostics.reset(quietHold, millis(), lastRaw, lastSample, rawObserved);
        diagnostics.accepted(millis(), quietHold);
        if (approximateMode) {
          approximateFilter.observe((double(raw)-platformOffset)/
            (validFactor(factor)?factor:1),lastSample,calibrated&&validFactor(factor));
          if (approximateFilter.driftFault) approximateReferenceVerified = false;
        }
        if (!quietHold.settled) verified = false;
        lastPollResult = "ACCEPTED";
      }
    } else {
      lastPollResult = "NOT_READY";
      if(acquisitionPoll.notReadySinceAccepted!=UINT32_MAX)++acquisitionPoll.notReadySinceAccepted;
      acquisitionPoll.haveNotReady=true;acquisitionPoll.lastNotReadyMs=now;
    }
    reportDebugRaw("POLL");
  }
  readCommands();
#ifdef DLOOP_WIFI_ENABLED
  if(singlePointMode&&singlePointCalibration.active()){
    const auto old=singlePointCalibration.state;singlePointCalibration.tick(millis());
    if(diagnostics.recordsLost!=singleRecordsLost||diagnostics.protocolLost!=singleProtocolLost||
       diagnostics.diagnosticLost!=singleDiagnosticLost||diagnostics.formatLost!=singleFormatLost)singlePointCalibration.fail("LOG_OUTPUT_LOSS");
    if(old!=singlePointCalibration.state && !singlePointCalibration.gap.valid)reportSinglePoint();
  }
#endif
  now = millis();
  if (approximateCalibration.active()) {
    const auto oldState=approximateCalibration.state;
    approximateCalibration.tick(now);
    if (diagnostics.recordsLost!=calibrationRecordsLost || diagnostics.protocolLost!=calibrationProtocolLost)
      approximateCalibration.fail("LOG_OUTPUT_LOSS");
    if (oldState!=approximateCalibration.state) reportApproximateCalibration();
  }
  if (uint32_t(now - lastSample) > SAMPLE_FRESH_MS) { resetWindow(RawStability::Hold::ResetReason::STALE); verified = false; }
  bool emitDue=uint32_t(now-lastEmit)>=EMIT_INTERVAL_MS;
#ifdef DLOOP_WIFI_ENABLED
  if(!calibrated&&livePreview.ready&&rawObserved&&uint32_t(now-lastSample)<=SAMPLE_FRESH_MS&&wifiScale.freshPreviewRequested(lastSample))emitDue=true;
#endif
  if (emitDue) {
    lastEmit = now;
    double mean = 0; long spread = 0;
    if (uint32_t(now - lastSample) > SENSOR_TIMEOUT_MS) emit("HX711_TIMEOUT", 0, false);
    else if (uint32_t(now - lastSample) > SAMPLE_FRESH_MS) emit("HX711_NOT_READY", 0, false);
    else if (transientFault && int32_t(transientUntil - now) > 0) emit(transientFault, 0, false);
    else if (approximateCalibration.pending()) emit("NOT_READY",0,false);
    else if (!zeroed || !validFactor(factor)) emit("CALIBRATION_REQUIRED", 0, false);
    else if (approximateMode && !calibrated) emit("CALIBRATION_REQUIRED", 0, false);
    else if (!rawStats(mean, spread)) emit("HX711_NOT_READY", 0, false);
    else if (approximateMode) {
      if (!approximateFilter.qualified || approximateFilter.grams < 0) emit("NOT_READY",0,false);
      else if (!approximateReferenceVerified) emit("REFERENCE_REQUIRED",0,false);
      else emit(nullptr,approximateFilter.grams,approximateFilter.qualified);
    }
    else {
      double gross = (mean - platformOffset) / factor;
      if (!isfinite(gross) || gross < (calibrated ? -ZERO_TOLERANCE_G : 0) || gross > MAX_GROSS_G)
        emit("OUT_OF_RANGE", 0, false);
      else emit(nullptr, fabs(gross) <= ZERO_TOLERANCE_G && calibrated ? 0 : fmax(0, gross),
                stableWindow(mean, spread, factor) && gross >= -ZERO_TOLERANCE_G);
    }
  }
  serviceSerialOutput();
#ifdef DLOOP_WIFI_ENABLED
  const bool pauseNetwork = wifiCalibrationRequested || approximateCalibration.pending() || singlePointMode ||
    (diagnostics.enabled&&diagnostics.full) || diagnostics.endPending ||
    diagnostics.output.protocol.count || diagnostics.output.diagnostics.count;
  wifiScale.tick(pauseNetwork,diagnostics.protocolLost,diagnostics.diagnosticLost,diagnostics.formatLost);
#endif
  delay(1); // ESP8266 watchdog cooperation; no network work.
}
