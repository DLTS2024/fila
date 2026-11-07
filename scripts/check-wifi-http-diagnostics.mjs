import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const cases=[
 ['{"code":"invalid_frame"}','InvalidFrame'],
 ['{"error":"not logged","code":"invalid_preview","requestId":"not logged"}','InvalidPreview'],
 [' \n{"code" : "stale_upload"}\t','StaleUpload'],
 ['{"code":"unknown_secret"}','None'],
 ['{"error":"invalid_frame"}','None'],
 ['{"code":"invalid_frame","code":"stale_upload"}','None'],
 ['{"code":"invalid_frame"} trailing','None'],
 ['{"code":"invalid_frame"','None'],
 ['{"nested":{"code":"invalid_frame"}}','None'],
 ['{"code":null}','None'],
 ['{"code":"invalid_frame\\nsecret"}','None'],
 ['{"co\\u0064e":"invalid_frame"}','None'],
 ['{"error":"escaped \\" quote","code":"stale_upload"}','StaleUpload'],
 ['{"error":"bad\\q","code":"stale_upload"}','None'],
 ['{"code":"invalid_frame",}','None'],
 ['{"code":"invalid_frame","error":"'+ 'x'.repeat(512)+'"}','None'],
 ['', 'None'],['[]','None'],
];
mkdirSync('work/wifi-http-diagnostics',{recursive:true});
const header=resolve('firmware/dloop_wifi_scale/http_error_diagnostic.h').replaceAll('\\','/');
const capacityCases=[[0,false,0,512],[100,false,1,412],[511,false,1000,1],[512,false,0,0],[513,false,0,0],[0,true,0,0],[0,false,1001,0]];
const source=`#include "${header}"\nusing namespace ScaleHttpDiagnostic;\n`+cases.map(([s,w],i)=>`static_assert(parse(${JSON.stringify(s)},${Buffer.byteLength(s)})==Code::${w},"case ${i}");`).join('\n')+'\n'+capacityCases.map(([used,failed,elapsed,w],i)=>`static_assert(writable(${used},${failed},${elapsed})==${w},"capacity ${i}");`).join('\n');
writeFileSync('work/wifi-http-diagnostics/parser-tests.cpp',source);
const compiler=process.env.DLOOP_CXX || `${process.env.LOCALAPPDATA}/Arduino15/packages/esp8266/tools/xtensa-lx106-elf-gcc/3.1.0-gcc10.3-e5f9fec/bin/xtensa-lx106-elf-g++.exe`;
const r=spawnSync(compiler,['-std=c++17','-fsyntax-only','work/wifi-http-diagnostics/parser-tests.cpp'],{encoding:'utf8'});
assert.equal(r.status,0,r.stderr||r.error?.message);
const wifi=readFileSync('firmware/dloop_wifi_scale/wifi_transport.h','utf8');
assert(wifi.includes('int availableForWrite() override'));
assert(wifi.includes('return ScaleHttpDiagnostic::writable(used,overflow,uint32_t(millis()-started));'));
assert(wifi.includes('bool outputCanTimeout() override {return false;}'));
// Verify the installed core path responsible for the original no-write timeout.
const coreRoot=`${process.env.LOCALAPPDATA}/Arduino15/packages/esp8266/hardware/esp8266/3.1.2`;
const stream=readFileSync(`${coreRoot}/cores/esp8266/StreamSend.cpp`,'utf8');
const peek=stream.slice(stream.indexOf('Stream::SendGenericPeekBuffer'),stream.indexOf('Stream::SendGenericRegularUntil'));
assert(peek.includes('size_t w = to->availableForWrite();'));
assert(peek.includes('w = std::min(w, avpk)'));
assert(peek.includes('to->write(directbuf, w)'));
const bearssl=readFileSync(`${coreRoot}/libraries/ESP8266WiFi/src/WiFiClientSecureBearSSL.h`,'utf8');
assert(bearssl.includes('hasPeekBufferAPI'));
for(const s of ['code==422','http.getSize()<=512','http.writeToPrint(&capture)','n>512-used','millis()-started)>1000','client.measureConnect(tlsConnectMs)','frame_queue_ms=','tls_connect_ms=','http_response_ms=','response_read_ms=','frame_response_ms='])assert(wifi.includes(s),s);
for(const s of ['http.getString(', 'Serial.', 'setInsecure('])assert(!wifi.includes(s),s);
assert(wifi.includes('queuedAt=millis();sentAt=wallMs();'));
assert(wifi.includes('uint32_t(now-queuedAt)>500'));
const log=wifi.slice(wifi.indexOf(' bool diagnostics('),wifi.indexOf(' uint64_t sentAt'));
for(const s of ['DLOOP_DEVICE_TOKEN','DLOOP_WIFI_PASSWORD','body','headers'])assert(!log.includes(s));
const tls=readFileSync('firmware/dloop_wifi_scale/tls_checked_client.h','utf8');
assert(tls.includes('if(connectDuration)*connectDuration=millis()-started;'));
assert(tls.includes('new CheckedScaleTlsClient(*this)'));
console.log(`PASS: ${cases.length} compiled C++ parser cases, ${capacityCases.length} compiled capacity cases; installed BearSSL/core peek-path integration guards; bounded response capture, allowlisted output, unchanged timestamps/freshness.`);
