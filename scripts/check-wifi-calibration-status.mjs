import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const core=readFileSync('firmware/dloop_usb_scale/dloop_usb_scale.ino','utf8');
const begin=core.indexOf('void reportWifiCalibration()');
const end=core.indexOf('\n#endif',begin);
const report=core.slice(begin,end);
assert(core.slice(0,begin).trimEnd().endsWith('// commit, select a mode, or alter an in-progress calibration session.'));
assert(core.lastIndexOf('#ifdef DLOOP_WIFI_ENABLED',begin)>core.lastIndexOf('#endif',begin));
for(const s of ['EEPROM.get(0, strictRecord)','EEPROM.get(ApproximateCalibration::EEPROM_ADDRESS, approximateRecord)',
 'strictRecord.magic==RECORD_MAGIC','strictRecord.version==1','strictRecord.checksum==recordChecksum(strictRecord)',
 'validFactor(strictRecord.factor)','strictRecord.offset>-8388600','strictRecord.offset<8388600',
 'ApproximateCalibration::validRecord(approximateRecord)','queueWifiDiagnostic(line)'])assert(report.includes(s),s);
for(const s of ['EEPROM.put','EEPROM.commit','EEPROM.begin','selectWeighingMode','invalidateCalibration','resetWindow','commandFault','Serial.',
 'DLOOP_DEVICE_TOKEN','DLOOP_WIFI_PASSWORD','saved =','factor =','zeroed =','calibrated ='])assert(!report.includes(s),s);
const dispatch=core.slice(core.indexOf('void processCommand('));
const handler='if (!strcmp(text,"DEBUG CALIBRATION")) {reportWifiCalibration();return;}';
assert(dispatch.indexOf(handler)>0);
assert(dispatch.indexOf(handler)<dispatch.indexOf('wifiCalibrationRequested=true'));
assert(dispatch.indexOf(handler)<dispatch.indexOf('approximateCalibrationCommand(text)'));
assert(dispatch.indexOf(handler)<dispatch.indexOf('approximateCalibration.pending()'));
assert(dispatch.lastIndexOf('#ifdef DLOOP_WIFI_ENABLED',dispatch.indexOf(handler))>=0);
for(const field of ['eeprom_ready=%u','strict_valid=%u','approximate_valid=%u','active_mode=%s','factor_active=%u'])assert(report.includes(field));
const format=JSON.parse(report.match(/PSTR\((".*")\)/)[1]);
assert(format.replace(/%u/g,'1').replace('%s','STRICT').length<224);
assert(!/%[fg]/.test(format),'No calibration factor or offset values emitted');
assert(core.includes('#DEBUG WIFI_STARTUP'));
const sketch=readFileSync('firmware/dloop_wifi_scale/dloop_wifi_scale.ino','utf8');
assert(sketch.includes('#define DLOOP_WIFI_ENABLED 1'));
console.log('PASS: Wi-Fi-only read-only EEPROM status command, complete validity checks, bounded nonsecret queued flags; dispatch bypasses calibration mutations; startup diagnostic enabled.');
