// Uses the sketch's real C printf format and fixture inputs, NOT a hardware emulator.
import './test-typescript-loader.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {parseScaleFrame,ScaleFrameParser,eligibleReading}=await import('../lib/scale/protocol.ts');
const header=fs.readFileSync('firmware/dloop_usb_scale/scale_config.h','utf8');
const sketch=fs.readFileSync('firmware/dloop_usb_scale/dloop_usb_scale.ino','utf8');
const fixtures=JSON.parse(fs.readFileSync('firmware/tests/protocol-fixtures.json','utf8'));
const literal=header.match(/constexpr char FRAME_FORMAT\[\] = (".*");/)[1];
const format=JSON.parse(literal);
let checks=0;
const check=(value,label)=>{assert(value,label);checks++;};
const encoder=new TextEncoder(),lines=[];
for(const f of fixtures){
  const args=[String(f.seq),f.fault?'null':f.gross.toFixed(2),String(f.stable&&!f.fault),String(f.calibrated),f.fault?`,"fault":"${f.fault}"`:''];
  const line=format.replace(/%lu|%s/g,()=>args.shift());
  check(!args.length&&line.endsWith('\n')&&line.length<256,`${f.name}: bounded complete frame`);
  const data=JSON.parse(line);check(!('uid'in data),`${f.name}: no NFC requirement`);
  const event=parseScaleFrame(line);check(event.kind===f.kind,`${f.name}: parser kind`);
  if(event.kind==='reading'){
    check(event.frame.grossG===f.gross,`${f.name}: mass preserved`);
    check(eligibleReading({...event.frame,receivedAt:1000,connectionId:'fixture',transport:'usb'},1000)===f.eligible,`${f.name}: review eligibility`);
  }else check(data.grossG===null&&data.stable===false,`${f.name}: status-only fault`);
  lines.push(line);
}
const all=lines.join('');
for(const size of [1,7,64,all.length]){
  const parser=new ScaleFrameParser();let events=[];const bytes=encoder.encode(all);
  for(let i=0;i<bytes.length;i+=size)events.push(...parser.push(bytes.slice(i,i+size)));
  check(events.length===fixtures.length&&events.every((event,i)=>event.kind===fixtures[i].kind),`chunk size ${size}`);
}
const parser=new ScaleFrameParser();parser.push(encoder.encode(lines.at(-1)));
check(parser.push(encoder.encode(lines[0]))[0].kind==='invalid','sequence wrap/reboot blocked until reconnect');
parser.reset();check(parser.push(encoder.encode(lines[0]))[0].kind==='reading','reconnect accepts new sequence');
const faults=[...sketch.matchAll(/(?:emit|commandFault)\("([A-Z_]+)"/g),...sketch.matchAll(/transientFault = "([A-Z_]+)"/g)].map(m=>m[1]);
check(faults.every(code=>fixtures.some(f=>f.fault===code)),'all emitted fault codes have parser fixtures');
check(sketch.includes('snprintf(frame, sizeof(frame), FRAME_FORMAT'),'fixtures use actual sketch formatter');
check(!/\bString\b/.test(sketch.replace(/\/\/[^\n]*/g,'')),'fixed buffers, no dynamic String loop');
check(!/WiFi\.begin|HTTPClient|WiFiClient|scale_secrets|WIFI_PASSWORD|API_TOKEN|PN532/.test(sketch),'no network or NFC client/credentials');
check(sketch.includes('WiFi.mode(WIFI_OFF)')&&sketch.includes('WiFi.forceSleepBegin()'),'radio disabled');
const setup=sketch.slice(sketch.indexOf('void setup()'),sketch.indexOf('void loop()'));
check(!/tare\(|processCommand\(|platformOffset\s*=\s*(?:lround|mean|sensor)/.test(setup),'no automatic platform zero at boot');
check(sketch.includes('if (seq == UINT32_MAX) sequenceExhausted = true'),'sequence exhaustion does not wrap');
check(!sketch.includes('-108.55'),'legacy factor not loaded as calibration');
const debugFormat=JSON.parse(sketch.match(/constexpr char DEBUG_RAW_FORMAT\[\] = (".*");/)[1]);
const diagnosticArgs=['ZERO_EMPTY','-29500','-29575','-29424','151','16','16','true','ACCEPTED','23','PASS','-29500','70','27.5','0','0.5','5','4','0','0','true','-29530','30','7','CENTRE_SPAN','1','3','true','-29530','41','41','41','40'];
const debugLine=debugFormat.replace(/%lu|%s|%u|%\.2f/g,()=>diagnosticArgs.shift());
check(!diagnosticArgs.length&&debugLine.length<768&&debugLine.endsWith('\n'),'bounded diagnostic format');
check(debugLine.includes('raw=-29500 min=-29575 max=-29424 spread=151 count=16/16'),'raw signed values and window statistics visible');
check(debugLine.includes('readyAtPoll=true poll=ACCEPTED ageMs=23 zeroCheck=PASS'),'readiness and zero failure cause visible');
check(parseScaleFrame(debugLine).kind==='invalid','monitor diagnostics cannot masquerade as measurements');
const debugParser=new ScaleFrameParser();
const mixed=debugParser.push(encoder.encode(lines[0]+debugLine+lines[1]));
check(mixed.length===2&&mixed.every(event=>event.kind==='reading')&&debugParser.diagnostics().debugLines===1,'monitor line ignored without invalidating v1 measurements');
check(sketch.includes('debugRawEnabled = false'),'diagnostics default off');
check(sketch.includes('"DEBUG RAW ON"')&&sketch.includes('"DEBUG RAW OFF"'),'explicit enable and disable commands');
check(sketch.includes('if (!rawStats(mean, spread) || !windowStats().quiet || !quietHold.settled) { commandFault("ZERO_UNSTABLE"); return; }'),'zero still requires fresh robust quiet window and temporal hold');
check(/WINDOW_SIZE = 16/.test(header)&&/SAMPLE_FRESH_MS = 500/.test(header),'window size and freshness retained');
check(debugLine.includes('pending=0/16 prevValid=true prevCentre=-29530 centreDelta=30'),'hold progress and previous centre visible');
check(debugLine.includes('resetId=7 resetReason=CENTRE_SPAN')&&debugLine.includes('resetSpan=41 resetValue=41 resetLimit=40'),'latched reset cause survives passing current window');
check(debugLine.includes('central=70')&&debugLine.includes('hold=4/4 drift=0'),'robust diagnostics visible');
check(sketch.includes('if (!quietHold.settled) verified = false;'),'motion revokes pending verification');
console.log(`PASS: ${checks} firmware formatter/parser fixture and source guard checks (${fixtures.length} fixtures). No C++ execution, electrical, calibration or physical hardware behavior is claimed.`);
