// Formatter/parser regression, not C++ runtime or a physical serial test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import './test-typescript-loader.mjs';
const {ScaleFrameParser}=await import('../lib/scale/protocol.ts');
const reporter=fs.readFileSync('firmware/dloop_usb_scale/diagnostic_reporter.h','utf8');
const sketch=fs.readFileSync('firmware/dloop_usb_scale/dloop_usb_scale.ino','utf8');
let checks=0;
function check(value,label){assert(value,label);checks++;}
const template=name=>JSON.parse(reporter.match(new RegExp('constexpr char '+name+'\\[\\] = (".*");'))[1]);
function format(fmt,args){let index=0;const out=fmt.replace(/%llu|%lu|%ld|%u|%s|%\.3f|%\.6f/g,token=>{
 const a=args[index++];return token==='%.3f'?Number(a).toFixed(3):token==='%.6f'?Number(a).toFixed(6):String(a);
});assert.equal(index,args.length);return out;}
function fields(line){
 assert.match(line,/^#DIAG (RESET|SNAPSHOT|WINDOW|STATUS|BEGIN|END) /);
 return Object.fromEntries([...line.matchAll(/([A-Za-z][A-Za-z0-9]*)=(\[[^\]]*\]|[^\s]+)/g)].map(m=>[m[1],m[2]]));
}
function reconstruct(f){
 const raw=JSON.parse(f.raw),time=JSON.parse(f.times);
 assert.equal(raw.length,Number(f.count));assert.equal(time.length,raw.length);assert(raw.length<=16);
 const first=BigInt(f.firstId),accepted=BigInt(f.accepted);
 if(raw.length)assert.equal(first+BigInt(raw.length)-1n,accepted);
 const dt=time.slice(1).map((t,i)=>(t-time[i])>>>0);
 assert(dt.every(t=>t<=0x7fffffff),'backwards or ambiguous timestamps');
 assert.equal(Number(f.intervals),dt.length);
 assert.equal(Number(f.dtMin),dt.length?Math.min(...dt):0);
 assert.equal(Number(f.dtMax),dt.length?Math.max(...dt):0);
 const average=dt.length?dt.reduce((a,b)=>a+b,0)/dt.length:0;
 assert(Math.abs(Number(f.dtAvg)-average)<=0.000501);
 return raw.map((v,i)=>({id:first+BigInt(i),raw:v,ms:time[i]}));
}
const raw=Array.from({length:16},(_,i)=>-29530+i),time=Array.from({length:16},(_,i)=>1000+i*100);
const stats=format(template('STATS_FORMAT'),[-29522.5,11,4,8,1,7.5,15,0,0]);
const base=(kind,accepted=16n,first=1n)=>format(template('TIMING_FORMAT'),[kind,2500,accepted,16,first,2500,100,15,100,100,100]);
const reset=format(template('RESET_FORMAT'),[351,'SLOPE',2.001470588,2,4,0,'false',0,0,0]);
const arrays=` raw=${JSON.stringify(raw)} times=${JSON.stringify(time)}`;
const line=base('RESET')+stats+reset+arrays+'\n';
const parsed=fields(line),samples=reconstruct(parsed);
check(samples.length===16&&samples[0].id===1n&&samples.at(-1).ms===2500,'chronological raw/time/sample ID reconstruction');
check(parsed.reason==='SLOPE'&&parsed.discardedPending==='4'&&parsed.discardedHold==='0','reset reason and discarded progress');
check(parsed.value==='2.001471'&&parsed.limit==='2.000000','six decimal failed-value evidence exposes threshold crossing');
check(line.endsWith('\n')&&line.length<1280,'bounded full reset record');
const largeBase=base('SNAPSHOT',18446744073709551615n,18446744073709551600n);
check(reconstruct(fields(largeBase+stats+arrays+'\n')).at(-1).id===18446744073709551615n,'uint64 IDs retain precision in log reconstruction');
const wrapped=[...Array(16)].map((_,i)=>(0xffffffcd+i*100)>>>0);
check(reconstruct(fields(base('WINDOW')+stats+` raw=${JSON.stringify(raw)} times=${JSON.stringify(wrapped)}\n`)).length===16,'millis rollover preserves modular ordering');
assert.throws(()=>reconstruct({...parsed,times:JSON.stringify([...time.slice(0,15),100])}));checks++;
assert.throws(()=>reconstruct({...parsed,count:'15'}));checks++;
assert.throws(()=>reconstruct({...parsed,firstId:'2'}));checks++;
assert.throws(()=>reconstruct({...parsed,dtMax:'200'}));checks++;
const protocol=seq=>JSON.stringify({v:1,deviceId:'DLOOP-SCALE-01',seq,grossG:275,stable:true,calibrated:true})+'\n';
const encoder=new TextEncoder();
for(const chunkSize of [1,13,128,4096]){
 const bytes=encoder.encode(protocol(1)+line+protocol(2)),parser=new ScaleFrameParser();let events=[];
 for(let i=0;i<bytes.length;i+=chunkSize)events.push(...parser.push(bytes.slice(i,i+chunkSize)));
 check(events.length===3&&events[0].kind==='reading'&&events[1].kind==='invalid'&&events[2].kind==='reading','diagnostic cannot masquerade as v1, parser recovers at chunk size '+chunkSize);
}
const extremeRaw=Array(16).fill(-8388599),extremeMs=Array(16).fill(4294967295);
const extreme=largeBase+stats+reset+` observed=true observedRaw=-8388608 observedMs=4294967295 raw=${JSON.stringify(extremeRaw)} times=${JSON.stringify(extremeMs)}\n`;
check(extreme.length<1280,'worst-width device timestamps, raw values and IDs fit one bounded line');
check(sketch.includes('diagnostics.samples.accept(raw, lastSample);'),'device timestamp from actual accepted branch');
check(sketch.includes('Serial.availableForWrite()')&&sketch.includes('32U'),'serial writes bounded by free hardware capacity and per-loop budget');
check(!sketch.includes('Serial.print('),'all serial lines use atomic bounded scheduler');
check(reporter.includes('if (!resets.take(h.resetId) || !enabled) return;'),'each new reset ID logged at most once');
check(reporter.includes('OUTPUT_OVERFLOW')&&reporter.includes('recordsLost=')&&reporter.includes('protocolLost='),'capture stops visibly if output cannot keep up');
check(sketch.includes('"DEBUG TRACE ON"')&&sketch.includes('"DEBUG TRACE FULL"')&&sketch.includes('"DEBUG TRACE OFF"')&&sketch.includes('"DEBUG SNAPSHOT"'),'capture and optional full snapshot commands present');
console.log(`PASS: ${checks} sampling log formatter, reconstruction, counter precision, timing, reset evidence, bounded output and protocol compatibility checks. C++ collector/queue assertions run during Arduino compile; no physical hardware claimed.`);
