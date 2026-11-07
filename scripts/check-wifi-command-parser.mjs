import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Compile-time execution of the actual UART parser with a fake serial source.
// Extract the actual Wi-Fi handler too; stub its reporting side effect so no
// hardware, EEPROM or calibration command is executed by this offline test.
const source=readFileSync('firmware/dloop_usb_scale/dloop_usb_scale.ino','utf8').replaceAll('\r\n','\n');
const generated=readFileSync('firmware/dloop_wifi_scale/scale_core.generated.h','utf8').replaceAll('\r\n','\n');
const parser=source.slice(source.indexOf('void readCommands() {'),source.indexOf('\nvoid setup()'));
const handler=source.match(/if \(!strcmp\(text,"DEBUG CALIBRATION"\)\) \{reportWifiCalibration\(\);return;\}/)[0];
assert(generated.includes(parser.replaceAll('\r\n','\n')));
assert(generated.includes(handler));
const cases=[
 ['DEBUG CALIBRATION\n',64,1,0],
 ['DEBUG CALIBRATION\r\n',64,1,0],
 ['DEBUG CALIBRATION\n',1,1,0],
 ['DEBUG CALIBRATION\n',5,1,0],
 ['DEBUG CALIBRATION\nDEBUG CALIBRATION\n',64,2,0],
 ['DEBUG CALIBRATION\r',64,0,0],
 ['debug calibration\n',64,0,1],
 [' DEBUG CALIBRATION\n',64,0,1],
 ['DEBUG CALIBRATION \n',64,0,1],
 ['DEBUG\tCALIBRATION\n',64,0,1],
 ['\n',64,0,1],
 ['x'.repeat(63)+'\nDEBUG CALIBRATION\n',64,1,1],
 ['x'.repeat(64)+'\nDEBUG CALIBRATION\n',64,1,1],
 ['DEBUG CALIBRATION\n\n',64,1,1],
];
const cpp=`#include <stdint.h>
#include <stddef.h>
struct Input {const char* p="";size_t at=0,end=0;constexpr int available(){return at<end;}constexpr char read(){return p[at++];}};
struct Test {
 Input Serial;char command[64]={};uint8_t commandLength=0;bool discardCommand=false;
 unsigned reports=0,faults=0;
 constexpr int strcmp(const char* a,const char* b){while(*a&&*a==*b){++a;++b;}return *a-*b;}
 constexpr void reportWifiCalibration(){++reports;}
 constexpr void commandFault(const char*){++faults;}
 constexpr void processCommand(const char* text){${handler}commandFault("COMMAND_REJECTED");}
 constexpr ${parser}
};
constexpr bool run(const char* input,size_t n,size_t chunk,unsigned reports,unsigned faults){
 Test t;t.Serial.p=input;
 while(t.Serial.end<n){t.Serial.end+=chunk;if(t.Serial.end>n)t.Serial.end=n;
  while(t.Serial.available())t.readCommands();
 }
 return t.reports==reports&&t.faults==faults;
}
`+cases.map(([s,c,r,f],i)=>`static_assert(run(${JSON.stringify(s)},${s.length},${c},${r},${f}),"UART case ${i}");`).join('\n');
mkdirSync('work/wifi-command-parser',{recursive:true});
writeFileSync('work/wifi-command-parser/tests.cpp',cpp);
const compiler=process.env.DLOOP_CXX||`${process.env.LOCALAPPDATA}/Arduino15/packages/esp8266/tools/xtensa-lx106-elf-gcc/3.1.0-gcc10.3-e5f9fec/bin/xtensa-lx106-elf-g++.exe`;
const result=spawnSync(compiler,['-std=c++17','-fsyntax-only','work/wifi-command-parser/tests.cpp'],{encoding:'utf8'});
assert.equal(result.status,0,result.stderr||result.error?.message);
console.log(`PASS: ${cases.length} C++ compile-time UART parser/real-handler cases: exact LF/CRLF, fragmented input, whitespace/case rejection, length overflow recovery and extra blank line. Report action is stubbed; no device or EEPROM access.`);
