import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve('.').replaceAll('\\','/');mkdirSync('work/wifi-preview-age-tests',{recursive:true});
writeFileSync('work/wifi-preview-age-tests/test.cpp',`
#include "${root}/firmware/dloop_wifi_scale/preview_sample_timing.h"
#include "${root}/firmware/dloop_usb_scale/live_preview.h"
using namespace PreviewSampleTiming;
static_assert(age(100,244+249+257)==850&&!fresh(100,244+249+257),"reproduce expired GET; timing components are a synthetic split");
static_assert(!fresh(300,244),"queue younger than 500 does not make its sensor sample fresh");
static_assert(fresh(0,5+200+100),"fresh reacquisition avoids old queue age, without resetting timestamps");
static_assert(!fresh(0,5+483+257),"long measured-network-like delay still expires; never fabricate freshness");
static_assert(fresh(100,400)&&!fresh(100,401),"500 ms boundary unchanged");
static_assert(age(UINT32_MAX,483)==UINT32_MAX,"unknown/overflow ages saturate");
static_assert(after(51,50)&&!after(50,50)&&!after(49,50)&&after(10,UINT32_MAX-5),"new acquisition required, including millis wrap");
constexpr bool refill(){
 LivePreview::Filter f;for(unsigned i=1;i<=5;++i)f.observe(125000,i*100);
 if(!f.ready)return false;
 // Synchronous networking leaves a genuine 850 ms acquisition gap.
 f.observe(125300,1350);if(f.ready||f.size!=1)return false;
 for(unsigned i=1;i<4;++i){f.observe(125300,1350+i*100);if(f.ready)return false;}
 f.observe(125300,1750);return f.ready&&f.counts==125300;
}
static_assert(refill(),"invalid filter is silent until five actual new reads; no cached numeric reuse");
`);
const compiler=process.env.DLOOP_CXX||`${process.env.LOCALAPPDATA}/Arduino15/packages/esp8266/tools/xtensa-lx106-elf-gcc/3.1.0-gcc10.3-e5f9fec/bin/xtensa-lx106-elf-g++.exe`;
const r=spawnSync(compiler,['-std=c++17','-fsyntax-only','work/wifi-preview-age-tests/test.cpp'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.error?.message);
const wifi=readFileSync('firmware/dloop_wifi_scale/wifi_transport.h','utf8');
const core=readFileSync('firmware/dloop_usb_scale/dloop_usb_scale.ino','utf8');
for(const s of ['if(queuedWarming)return;','previewRequestedAt=now;queued[0]=0;return;','PreviewSampleTiming::after(queuedSampleAt,previewRequestedAt)',
 'if(queuedRaw&&!PreviewSampleTiming::fresh(queuedSampleAge,frameQueueMs))return;',
 'sample_age_frame_ms=','sample_age_upload_ms=','sample_age_complete_ms='])assert(wifi.includes(s),s);
assert(wifi.includes('(!queued[0]||!queuedRaw||!PreviewSampleTiming::after(queuedSampleAt,previewRequestedAt))'),'A fulfilled demand must not flood the serial queue');
assert(core.includes('wifiScale.invalidatePreview();'));
assert(core.includes('wifiScale.freshPreviewRequested(lastSample)'));
assert(core.includes('const bool warming=!calibrated&&!previewFresh&&fault&&!strcmp(fault,"CALIBRATION_REQUIRED")'));
assert(wifi.indexOf('if(queuedWarming)return;')<wifi.indexOf('http.POST('));
const php=spawnSync(process.env.DLOOP_PHP_BINARY||'.tools/php/php.exe',['backend/tests/wifi-preview-age-offline.php'],{encoding:'utf8'});
assert.equal(php.status,0,php.stderr||php.stdout);process.stdout.write(php.stdout);
console.log('PASS: compiled timing/filter tests, fresh-read demand, warmup recovery, latest-only invalidation, bounded sample-age diagnostics and unchanged freshness.');
