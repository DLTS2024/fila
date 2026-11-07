import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const core=readFileSync('firmware/dloop_usb_scale/dloop_usb_scale.ino','utf8').replaceAll('\r\n','\n');
const module=readFileSync('firmware/dloop_wifi_scale/single_point_calibration.h','utf8');
assert(module.includes('STEP_TIMEOUT_MS=120000'));
assert(module.includes('else if(uint32_t(ms-stepMs)>STEP_TIMEOUT_MS)'));
assert(module.indexOf('timeout={true,previousState,state,stepMs,ms')<module.indexOf('fail("STEP_TIMEOUT")'));
assert(module.includes('previousState=state;state=s;stepMs=ms;count=0;reason="NONE";'));
const commands=core.slice(core.indexOf('bool singlePointCommand('),core.indexOf('\nvoid processCommand('));
assert(commands.indexOf('singlePointCalibration.tick(now)')<commands.indexOf('accepted=singlePointCalibration.load(mass,now)'));
assert(commands.includes('if(!singlePointCalibration.active()){note(false);reportSinglePoint();return true;}'));
assert(commands.includes('note(accepted);reportSinglePoint();'));
assert(commands.indexOf('if(!strcmp(action,"STATUS"))')<commands.indexOf('singlePointCalibration.tick(now)'));
const formats=[...core.matchAll(/PSTR\(("#DEBUG SINGLE_(?:TIMEOUT|COMMAND).*?")\)/g)].map(x=>JSON.parse(x[1]));
assert.equal(formats.length,2);
for(const format of formats){
 const worst=format.replace(/%lu|%u/g,'4294967295').replace(/%s/g,'READY_TO_ACCEPT');
 assert(worst.length<(format.includes('SINGLE_TIMEOUT')?384:320));
 assert(worst.endsWith('\n'));
 assert(!format.includes('password')&&!format.includes('token'));
}
const result=spawnSync(process.execPath,['scripts/check-single-point-calibration.mjs'],{encoding:'utf8'});
assert.equal(result.status,0,result.stderr||result.stdout);process.stdout.write(result.stdout);
console.log('PASS: operator-wait/collection timeout latches, exact 120-second boundary, LOAD deadline reset, expired LOAD refusal, freshness precedence, wraparound and bounded nonsecret diagnostic formats. STATUS does not change deadlines.');
