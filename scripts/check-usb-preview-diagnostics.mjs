import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './test-typescript-loader.mjs';
const {ScaleFrameParser,parseScaleFrame,eligibleReading}=await import('../lib/scale/protocol.ts');
const {SerialScaleConnection}=await import('../lib/scale/serial.ts');
const evidence=JSON.parse(readFileSync('scripts/fixtures/usb-preview-upload-evidence.json','utf8'));
const encoder=new TextEncoder();
for(const frame of evidence.frames){const parsed=parseScaleFrame(JSON.stringify(frame));assert.equal(parsed.kind,'fault');assert.equal(parsed.live.raw,frame.live.raw);assert.equal(parsed.live.calibrated,false);assert.equal(parsed.live.grams,null);}
const parser=new ScaleFrameParser();let events=[];
const wire=evidence.frames.map(f=>JSON.stringify(f)+'\n#DEBUG RAW raw=999999 hold=0/4\n').join('');
for(const byte of encoder.encode(wire))events.push(...parser.push(new Uint8Array([byte])));
assert.equal(events.length,3);assert.equal(parser.diagnostics().frames,3);assert.equal(parser.diagnostics().debugLines,3);assert.equal(parser.diagnostics().rejected,0);
assert.deepEqual(parser.push(encoder.encode('#DEBUG RAW '+ 'x'.repeat(3000)+'\n')),[]);assert.equal(parser.diagnostics().lastLine.length,240);
assert.equal(parser.push(encoder.encode('{"v":2}\n'))[0].kind,'invalid');
assert.equal(parser.push(encoder.encode(JSON.stringify(evidence.frames[0])+'\n'))[0].kind,'invalid'); // no reboot/sequence bypass
let controller;const writes=[];
const port={readable:null,writable:new WritableStream({write:b=>writes.push(b)}),async open(){this.readable=new ReadableStream({start:c=>controller=c})},async close(){}};
const connection=new SerialScaleConnection(()=>1000);await connection.connect({requestPort:async()=>port});
const send=async text=>{controller.enqueue(encoder.encode(text));await new Promise(r=>setTimeout(r,0))};
await send(JSON.stringify(evidence.frames[0])+'\n');const live=connection.getState().preview;assert(live&&live.raw!==null);assert.equal(connection.getState().reading,null);assert.equal(eligibleReading(connection.getState().reading,1000),false);
await send('#DEBUG RAW raw=100000 hold=1/4\n');assert.deepEqual(connection.getState().preview,live);assert.equal(connection.getState().serialDiagnostics.debugLines,1);assert.equal(writes.length,0);
await send('{"v":2}\n');assert.equal(connection.getState().preview,null);assert(connection.getState().serialDiagnostics.lastError);
await connection.disconnect();
console.log('PASS: saved COM3 v1 preview evidence accepted; byte chunks, interleaved/oversized DEBUG ignored; malformed JSON and reboot sequence remain rejected; diagnostic text never produces mass; monitor lines preserve fresh preview; no commands sent. No current hardware capture claimed.');
