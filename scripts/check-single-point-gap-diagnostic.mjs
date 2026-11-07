// Actual format literal and integration regression; C++ latch tests run at Verify.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import './test-typescript-loader.mjs';
import {parseScaleFrame} from '../lib/scale/protocol.ts';
const header=fs.readFileSync('firmware/dloop_wifi_scale/single_point_calibration.h','utf8');
const sketch=fs.readFileSync('firmware/dloop_usb_scale/dloop_usb_scale.ino','utf8');
const format=JSON.parse(header.match(/constexpr char GAP_FORMAT\[\] = (".*");/)[1]);
const args=['ID_GAP','true','false','true','18446744073709551613','18446744073709551615',
 '4294967295','199','200','199','CHECK_REFERENCE','true','true','199','true','false','99','100',
 '199','199','0','1','true','99'];
const line=format.replace(/%llu|%lu|%u|%s/g,()=>args.shift());
assert.equal(args.length,0);assert(line.endsWith('\n'));assert(line.length<768);
assert(line.includes('prevId=18446744073709551613 currentId=18446744073709551615'));
assert(line.includes('idGap=true tooFast=false tooSlow=true'));
assert(line.includes('samplesBeforeClear=199 phase=CHECK_REFERENCE'));
assert(line.includes('notReadySinceAccepted=1 haveNotReady=true lastNotReadyMs=99'));
assert.equal(parseScaleFrame(line).kind,'invalid'); // Never a measurement frame.
assert(header.indexOf('notify(gap);')<header.indexOf('fail("ACQUISITION_GAP")'));
assert(header.includes('MIN_DT_MS=75, MAX_DT_MS=150'));
assert(header.includes('uint32_t(ms-lastMs)>MAX_DT_MS||uint32_t(ms-lastMs)<MIN_DT_MS'));
assert(sketch.includes('singlePointCalibration.observe(raw,lastSample,diagnostics.samples.accepted,reportSinglePointGap)'));
assert(sketch.includes('singlePointCalibration.pollContext.pollDeltaMs=acquisitionPoll.pollDeltaMs'));
assert(sketch.includes('singlePointCalibration.pollContext.notReadySinceAccepted=acquisitionPoll.notReadySinceAccepted'));
assert(sketch.includes('if(singlePointCalibration.gap.valid){reportSinglePointGap(singlePointCalibration.gap);reportSinglePointCommand();return;}'));
assert(sketch.includes('queueWifiDiagnostic(written>=0&&size_t(written)<sizeof(line)?line:nullptr)'));
assert(sketch.includes('old!=singlePointCalibration.state && !singlePointCalibration.gap.valid'));
assert.equal((sketch.match(/sensor\.is_ready\(\)/g)||[]).length,1);
assert.equal((sketch.match(/sensor\.read\(\)/g)||[]).length,1);
console.log('PASS: SINGLE_POINT actual gap formatter retains uint64 IDs, simultaneous conditions, pre-clear count and poll evidence; bounded/non-protocol output, unchanged gap predicate, notify-before-clear and single automatic gap line integration.');
