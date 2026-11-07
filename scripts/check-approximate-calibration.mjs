// Integration/source guards only. Actual numerical state-machine assertions are
// compiled from approximate_calibration_self_test.cpp by Arduino Verify.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const sketch=fs.readFileSync('firmware/dloop_usb_scale/dloop_usb_scale.ino','utf8');
const config=fs.readFileSync('firmware/dloop_usb_scale/scale_config.h','utf8');
const header=fs.readFileSync('firmware/dloop_usb_scale/approximate_calibration.h','utf8');
const between=(a,b)=>sketch.slice(sketch.indexOf(a),sketch.indexOf(b,sketch.indexOf(a)));
assert(sketch.includes('static_assert(sizeof(CalibrationRecord) == 20'));
assert(config.includes('RAW_HALF_SHIFT = 35, RAW_SLOPE = 2'));
assert(config.includes('RAW_HARD_RANGE = 400, RAW_CENTRAL_RANGE = 220'));
assert(sketch.includes('if (!rawStats(mean, spread) || !windowStats().quiet || !quietHold.settled) { commandFault("ZERO_UNSTABLE"); return; }'));
assert(header.includes('EEPROM_ADDRESS=32, EEPROM_BYTES=128'));
assert(header.includes('r.magic==MAGIC&&r.version==VERSION&&r.profile==PROFILE&&r.cycles==3'));
assert(sketch.includes('EEPROM.put(ApproximateCalibration::EEPROM_ADDRESS,record)'));
assert(sketch.includes('EEPROM.put(0, record)')); // strict record remains separate
const commands=between('bool approximateCalibrationCommand','void processCommand');
assert(commands.indexOf('canAccept(millis())')<commands.indexOf('EEPROM.put(ApproximateCalibration::EEPROM_ADDRESS,record)'));
assert(commands.indexOf('EEPROM.commit()',commands.indexOf('const auto record='))<commands.indexOf('approximateReferenceVerified=true'));
const setup=between('void setup()','void loop()');
assert(setup.includes('EEPROM.get(ApproximateCalibration::EEPROM_ADDRESS,approximateSaved)'));
assert(!setup.includes('selectWeighingMode(true)')); // reboot does not silently activate approximation
assert(sketch.includes('approximateCalibration.pending()) { if (!fault) fault = "NOT_READY"; stable = false; calibrated = false; }'));
assert(sketch.includes('approximateCalibration.observe(raw,lastSample,diagnostics.samples.accepted,reportAcquisitionGap)'));
assert(sketch.includes('approximateCalibration.fail("LOG_OUTPUT_LOSS")'));
assert(commands.includes('parseMass(action+6,mass)'));
assert(header.includes('state!=State::NeedLoad||mass!=1000'));
assert(header.includes('FINAL_LOAD_DISTURBANCE'));
assert(between('bool invalidateSavedRecord()','bool parseMass').includes('saved = {}'));
assert(commands.includes('approximateCalibration.tick(commandMs);\n  if (!approximateMode || !approximateCalibration.active())'));
for(const method of ['empty','load','check'])assert(commands.includes(`approximateCalibration.${method}(${method==='empty'?'':'mass,'}commandMs)`));
assert(header.includes('if(continuityRequired()&&haveSample&&'));
assert(header.includes('if(collecting()||operatorWaiting())haveSample=false;'));
console.log('PASS: approximate calibration integration/source guards: strict gates/storage preserved, explicit commit gate, provenance, reboot/cache isolation, pending/fault protection, state-aware anchors and shared-timestamp pre-command freshness/expiry. C++ state-machine assertions require Arduino compilation.');
