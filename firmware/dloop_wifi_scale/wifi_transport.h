#pragma once
#include <WiFiClientSecureBearSSL.h>
#include <ESP8266HTTPClient.h>
#include "tls_checked_client.h"
#include "http_error_diagnostic.h"
#include "preview_sample_timing.h"
#include <umm_malloc/umm_heap_select.h>
#include <time.h>
#include <sys/time.h>
extern "C" {
#include <user_interface.h>
}
#if __has_include("wifi_private.h")
#include "wifi_private.h"
#else
#include "wifi_private.example.h"
#endif

// X509List supports flash-backed PEM. Avoid retaining this large public literal
// in scarce DRAM alongside the full-size TLS receive buffer.
static const char DLOOP_WIFI_CA_PEM_FLASH[] PROGMEM = DLOOP_TLS_CA_PEM;

// Reuse the completed request buffer. Bounded memory, no String/getString(),
// no logging or forwarding of response bytes, including unexpected responses.
class ScaleErrorCapture : public Print {
 char* data;size_t used=0;bool overflow=false;uint32_t started;
 public:
 explicit ScaleErrorCapture(char* buffer):data(buffer),started(millis()){}
 // Core 3.1.2 sendSize() uses the TLS peek-buffer path and will not call
 // write() unless this sink advertises capacity (Print defaults to zero).
 int availableForWrite() override {
  return ScaleHttpDiagnostic::writable(used,overflow,uint32_t(millis()-started));
 }
 bool outputCanTimeout() override {return false;} // Full/expired is terminal.
 size_t write(uint8_t c) override {return write(&c,1);}
 size_t write(const uint8_t* p,size_t n) override {
  if(overflow||n>512-used||uint32_t(millis()-started)>1000){overflow=true;return 0;}
  memcpy(data+used,p,n);used+=n;return n;
 }
 ScaleHttpDiagnostic::Code code(int transferred)const {
  return complete(transferred)?ScaleHttpDiagnostic::parse(data,used):ScaleHttpDiagnostic::Code::None;
 }
 bool complete(int transferred)const{return !overflow&&transferred>=0&&size_t(transferred)==used;}
};

// Latest-only bounded queue. Failed uploads never qualify weight or touch EEPROM.
class WifiScaleTransport {
 char queued[512]={},boot[33]={};uint32_t queuedAt=0,nextAttempt=0,nextUpload=0;uint8_t attempts=0;
 uint32_t lastDiagnostic=0,uploadMs=0,uploadOk=0,uploadFailed=0,reconnects=0;int uploadCode=0,lastStatus=-1;bool diagnosticPending=true;
 // Probe values: -1 not attempted, -2 unsupported authority, 0 failed, 1 passed.
 // utc_ready is the existing minimum-time gate, not proof of accurate SNTP sync.
 uint32_t lastProbe=0,dnsMs=0,tcpMs=0;int dnsResult=-1,tcp443=-1,tlsError=0;bool hasProbed=false;
 uint32_t tlsHeapBefore=0,tlsBlockBefore=0,tlsHeapAfter=0;int tlsMfln=-1;
 bool (*diagnosticSink)(const char*)=nullptr;char* diagnosticBuffer=nullptr;size_t diagnosticCapacity=0;
 uint32_t networkBlockMs=0,networkBlockMaxMs=0,serialProtocolLost=0,serialDiagnosticLost=0,serialFormatLost=0;
 bool networkPaused=false;
 bool queuedPreview=false;
 bool queuedRaw=false,queuedWarming=false,needPreview=false;
 uint32_t queuedSampleAge=UINT32_MAX,queuedSampleAt=0,previewRequestedAt=0;
 uint32_t sampleAgeFrame=UINT32_MAX,sampleAgeStart=UINT32_MAX,sampleAgeComplete=UINT32_MAX;
 bool connectionUsed=false,lastResponseComplete=false;
 uint32_t tlsConnectCount=0,tlsReuseCount=0;
 uint32_t frameQueueMs=0,tlsConnectMs=0,httpResponseMs=0,responseReadMs=0,frameResponseMs=0;
 ScaleHttpDiagnostic::Code apiError=ScaleHttpDiagnostic::Code::None;
 void recordBlocking(uint32_t started){networkBlockMs=millis()-started;if(networkBlockMs>networkBlockMaxMs)networkBlockMaxMs=networkBlockMs;diagnosticPending=true;}
 bool diagnostics(uint32_t now){
  if(!diagnosticPending&&uint32_t(now-lastDiagnostic)<30000)return false;
  if(lastDiagnostic&&uint32_t(now-lastDiagnostic)<5000)return false;
  diagnosticPending=false;lastDiagnostic=now;
  uint32_t iramHeap=0,iramBlock=0;
  {HeapSelectIram heap;iramHeap=ESP.getFreeHeap();iramBlock=ESP.getMaxFreeBlockSize();}
  const int formatted=snprintf_P(diagnosticBuffer,diagnosticCapacity,PSTR("#DEBUG WIFI uptime_ms=%lu reset_reason=%u heap=%lu fragmentation_pct=%u max_block=%lu status=%d reconnects=%lu utc_s=%lu utc_ready=%u dns=%d dns_ms=%lu tcp443=%d tcp_ms=%lu probe_age_ms=%lu tls_error=%d tls_heap_before=%lu tls_block_before=%lu tls_heap_after=%lu ca_count=%u tls_mfln=%d iram_heap=%lu iram_block=%lu net_paused=%u net_block_ms=%lu net_block_max_ms=%lu serial_protocol_lost=%lu serial_diagnostic_lost=%lu serial_format_lost=%lu upload_ms=%lu upload_code=%d http_status=%d ok=%lu failed=%lu\n"),
   (unsigned long)now,(unsigned)ESP.getResetInfoPtr()->reason,(unsigned long)ESP.getFreeHeap(),(unsigned)ESP.getHeapFragmentation(),(unsigned long)ESP.getMaxFreeBlockSize(),lastStatus,(unsigned long)reconnects,
   (unsigned long)time(nullptr),unsigned(time(nullptr)>=1700000000),dnsResult,(unsigned long)dnsMs,tcp443,(unsigned long)tcpMs,(unsigned long)(hasProbed?uint32_t(now-lastProbe):0),tlsError,
   (unsigned long)tlsHeapBefore,(unsigned long)tlsBlockBefore,(unsigned long)tlsHeapAfter,unsigned(trust.getCount()),tlsMfln,(unsigned long)iramHeap,(unsigned long)iramBlock,
   unsigned(networkPaused),(unsigned long)networkBlockMs,(unsigned long)networkBlockMaxMs,(unsigned long)serialProtocolLost,(unsigned long)serialDiagnosticLost,(unsigned long)serialFormatLost,
   (unsigned long)uploadMs,uploadCode,uploadCode>0?uploadCode:0,(unsigned long)uploadOk,(unsigned long)uploadFailed);
  diagnosticSink(formatted>=0&&size_t(formatted)<diagnosticCapacity?diagnosticBuffer:nullptr);
  // Connection time describes the preceding warmup tick (DNS/TCP/TLS and
  // certificate validation). HTTP time covers only this fresh frame's POST.
  const char* allowed=ScaleHttpDiagnostic::label(apiError);
  const int timing=snprintf_P(diagnosticBuffer,diagnosticCapacity,PSTR("#DEBUG WIFI_HTTP frame_queue_ms=%lu tls_connect_ms=%lu http_response_ms=%lu response_read_ms=%lu frame_response_ms=%lu tls_connect_count=%lu tls_reuse_count=%lu response_complete=%u%s%s\n"),
   (unsigned long)frameQueueMs,(unsigned long)tlsConnectMs,(unsigned long)httpResponseMs,(unsigned long)responseReadMs,(unsigned long)frameResponseMs,
   (unsigned long)tlsConnectCount,(unsigned long)tlsReuseCount,unsigned(lastResponseComplete),
   allowed?" api_error=":"",allowed?allowed:"");
  diagnosticSink(timing>=0&&size_t(timing)<diagnosticCapacity?diagnosticBuffer:nullptr);
  const int ages=snprintf_P(diagnosticBuffer,diagnosticCapacity,PSTR("#DEBUG WIFI_SAMPLE sample_age_frame_ms=%lu sample_age_upload_ms=%lu sample_age_complete_ms=%lu waiting_fresh=%u warming=%u\n"),
    (unsigned long)sampleAgeFrame,(unsigned long)sampleAgeStart,(unsigned long)sampleAgeComplete,unsigned(needPreview),unsigned(queuedWarming));
  diagnosticSink(ages>=0&&size_t(ages)<diagnosticCapacity?diagnosticBuffer:nullptr);
  return true; // Let the queued serial writer drain before networking.
 }
 uint64_t sentAt=0;bool configured=false;BearSSL::Session session;
 BearSSL::X509List trust{DLOOP_WIFI_CA_PEM_FLASH};
 CheckedScaleTlsClient client{tlsError,tlsMfln};
 static uint64_t wallMs(){timeval t;gettimeofday(&t,nullptr);return uint64_t(t.tv_sec)*1000+t.tv_usec/1000;}
 void probeConnection(){
  // At most once per 30 seconds, only before the first upload or after failure.
  // Separate raw TCP probe sends NO application data, headers or credentials.
  hasProbed=true;lastProbe=millis();dnsMs=0;tcpMs=0;dnsResult=-2;tcp443=-1;
  const char* authority=DLOOP_SCALE_ENDPOINT+8;char host[254];
  const size_t length=strcspn(authority,"/:?#");
  if(!length||length>=sizeof(host)||memchr(authority,'@',length))return;
  // Only the actual default HTTPS port is probed; do not misreport other ports.
  if(authority[length]==':'&&strncmp(authority+length,":443/",5)!=0)return;
  memcpy(host,authority,length);host[length]=0;
  IPAddress address;uint32_t started=millis();
  dnsResult=WiFi.hostByName(host,address,500)==1?1:0;dnsMs=millis()-started;
  if(dnsResult!=1)return;
  WiFiClient probe;probe.setTimeout(500);started=millis();
  tcp443=probe.connect(address,443)==1?1:0;tcpMs=millis()-started;probe.stop(0);
 }
 public:
 void clearQueued(){queued[0]=0;needPreview=false;connectionUsed=false;client.stop();}
 bool freshPreviewRequested(uint32_t sampleAt)const{return needPreview&&PreviewSampleTiming::after(sampleAt,previewRequestedAt)&&
   (!queued[0]||!queuedRaw||!PreviewSampleTiming::after(queuedSampleAt,previewRequestedAt));}
 void invalidatePreview(){if(queuedPreview&&queuedRaw)queued[0]=0;needPreview=false;}
 void begin(bool (*sink)(const char*),char* buffer,size_t capacity){
  diagnosticSink=sink;diagnosticBuffer=buffer;diagnosticCapacity=capacity;
  configured=diagnosticSink&&diagnosticBuffer&&diagnosticCapacity&&strlen(DLOOP_WIFI_SSID)>0&&strlen(DLOOP_DEVICE_TOKEN)==64&&strlen(DLOOP_TLS_CA_PEM)>32&&strncmp(DLOOP_SCALE_ENDPOINT,"https://",8)==0;
  if(!configured){if(diagnosticSink)diagnosticSink("#DEBUG WIFI disabled: private SSID/token/CA configuration required\n");return;}
  uint8_t random[16];os_get_random(random,sizeof(random));for(unsigned i=0;i<16;i++)snprintf(boot+i*2,3,"%02x",random[i]);
  WiFi.persistent(false);WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(false);WiFi.setAutoConnect(false);
  const uint32_t started=millis();
  WiFi.begin(DLOOP_WIFI_SSID,DLOOP_WIFI_PASSWORD);attempts=1;nextAttempt=millis()+15000;
  configTime(0,0,"pool.ntp.org","time.google.com"); // No HTTPS before time is usable.
  recordBlocking(started);
 }
 void queue(const char* frame,bool uncalibratedPreview=false,uint32_t sampleAge=UINT32_MAX,bool rawPresent=false,uint32_t sampleAt=0,bool warming=false){
  if(!configured||strlen(frame)>=sizeof(queued)||time(nullptr)<1700000000)return;
  // Preserve the frame creation timestamp. live.ageMs separately records
  // sensor age at creation; the API adds transport/receipt age to that value.
  strncpy(queued,frame,sizeof(queued)-1);queuedAt=millis();sentAt=wallMs();queuedPreview=uncalibratedPreview;
  queuedSampleAge=sampleAge;queuedRaw=rawPresent;queuedSampleAt=sampleAt;queuedWarming=warming;
 }
 void tick(bool pauseNetwork,uint32_t protocolDrops,uint32_t diagnosticDrops,uint32_t formatDrops){
  if(!configured)return;const uint32_t now=millis();
  if(networkPaused!=pauseNetwork)diagnosticPending=true;
  networkPaused=pauseNetwork;serialProtocolLost=protocolDrops;serialDiagnosticLost=diagnosticDrops;serialFormatLost=formatDrops;
  const int status=WiFi.status();if(status!=lastStatus){lastStatus=status;diagnosticPending=true;}
  if(diagnostics(now))return;
  if(networkPaused)return; // Defer networking; queued frames still expire at 500 ms.
  if(WiFi.status()!=WL_CONNECTED){
   if(int32_t(now-nextAttempt)>=0){
    if(attempts>=8){attempts=0;nextAttempt=now+300000;return;}
    const uint32_t started=millis();
    ++reconnects;diagnosticPending=true;WiFi.disconnect();WiFi.begin(DLOOP_WIFI_SSID,DLOOP_WIFI_PASSWORD);
    ++attempts;nextAttempt=now+min(30000UL,1000UL<<min(unsigned(attempts),5U));recordBlocking(started);
   }return;
  }
  attempts=0;
  if(uploadCode<=0&&(!hasProbed||uint32_t(now-lastProbe)>=30000)){
   const uint32_t started=millis();probeConnection();recordBlocking(started);
   return; // Never upload a queued sample aged by the diagnostic probe.
  }
  if(!queued[0]||uint32_t(now-queuedAt)>500||time(nullptr)<1700000000||int32_t(now-nextUpload)<0)return;
  if(!client.connected()){
   // Establish authenticated TLS before selecting the frame to POST. The main
   // loop must regain control and acquire new sensor data after this blocking
   // operation; the pre-handshake frame is never retimestamped or transmitted.
   const char* authority=DLOOP_SCALE_ENDPOINT+8;char host[254];
   const size_t length=strcspn(authority,"/:?#");
   if(!length||length>=sizeof(host)||memchr(authority,'@',length)||
      (authority[length]==':'&&strncmp(authority+length,":443/",5)!=0))return;
   memcpy(host,authority,length);host[length]=0;
   queued[0]=0;apiError=ScaleHttpDiagnostic::Code::None;
   client.requireEstablished(false);client.setTrustAnchors(&trust);client.setX509Time(time(nullptr));client.setSession(&session);client.setTimeout(1000);
   client.measureConnect(tlsConnectMs);
   tlsHeapBefore=ESP.getFreeHeap();tlsBlockBefore=ESP.getMaxFreeBlockSize();
   connectionUsed=false;++tlsConnectCount;
   const uint32_t started=millis();const int connected=client.connect(host,443);
   tlsHeapAfter=ESP.getFreeHeap();recordBlocking(started);
   client.requireEstablished(true);
   if(!connected){client.stop();uploadCode=-1;++uploadFailed;nextUpload=millis()+2000;}
   return; // Even a successful handshake cannot send its old queued frame.
  }
  if(queuedPreview){
   if(queuedWarming)return; // Give acquisition five real samples; do not POST warmup nulls.
   if(queuedRaw){
    if(!PreviewSampleTiming::fresh(queuedSampleAge,uint32_t(now-queuedAt))){queued[0]=0;return;}
    if(!needPreview){needPreview=true;previewRequestedAt=now;queued[0]=0;return;}
    if(!PreviewSampleTiming::after(queuedSampleAt,previewRequestedAt))return;
   }
   // Explicit sensor-fault null frames remain eligible and invalidate old data.
  }
  nextUpload=now+1000;char body[768];
  int n=snprintf(body,sizeof(body),"{\"bootId\":\"%s\",\"sentAtMs\":%llu,\"frame\":%s}",boot,(unsigned long long)sentAt,queued);
  queued[0]=0;if(n<0||size_t(n)>=sizeof(body))return;
  const bool previewUpload=queuedPreview;
  HTTPClient http;http.setTimeout(1000);http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);http.setReuse(true);
  const uint32_t uploadStarted=millis();
  frameQueueMs=uploadStarted-queuedAt;httpResponseMs=responseReadMs=frameResponseMs=0;
  sampleAgeFrame=queuedSampleAge;sampleAgeStart=PreviewSampleTiming::age(queuedSampleAge,frameQueueMs);sampleAgeComplete=UINT32_MAX;
  if(queuedRaw&&!PreviewSampleTiming::fresh(queuedSampleAge,frameQueueMs))return;
  needPreview=false;
  apiError=ScaleHttpDiagnostic::Code::None;
  if(!http.begin(client,DLOOP_SCALE_ENDPOINT)){uploadCode=-100;tlsError=0;uploadMs=millis()-uploadStarted;++uploadFailed;recordBlocking(uploadStarted);return;}
  http.addHeader("Content-Type","application/json");http.addHeader("Authorization",String("Bearer ")+DLOOP_DEVICE_TOKEN);
  tlsHeapBefore=ESP.getFreeHeap();tlsBlockBefore=ESP.getMaxFreeBlockSize();
  if(connectionUsed)++tlsReuseCount;
  const int code=http.POST(reinterpret_cast<uint8_t*>(body),size_t(n));
  const uint32_t headersAt=millis();
  const uint32_t postMs=headersAt-uploadStarted;
  httpResponseMs=postMs; // Handshake completed in an earlier tick, before this frame existed.
  frameResponseMs=headersAt-queuedAt;
  bool responseComplete=false;
  if(((code>=200&&code<300)||code==422)&&(http.getSize()<0||http.getSize()<=512)){
   const uint32_t readStarted=millis();ScaleErrorCapture capture(body);
   // The API always returns JSON. Unexpected empty responses close the socket;
   // do not infer reusable framing from a zero-size response alone.
   const int transferred=http.getSize()==0?-1:http.writeToPrint(&capture);
   responseComplete=capture.complete(transferred);
   if(code==422)apiError=capture.code(transferred);
   responseReadMs=millis()-readStarted;
  }
  if(tlsError==0)tlsError=client.getLastSSLError(); // Preserve connect-time error captured by the clone.
  tlsHeapAfter=ESP.getFreeHeap();
  http.end();
  // Core HTTPClient honors Connection: close; incomplete bodies cannot be reused.
  if(!responseComplete||code<200||code>=300)client.stop();
  lastResponseComplete=responseComplete;connectionUsed=responseComplete&&code>=200&&code<300&&client.connected();
  sampleAgeComplete=PreviewSampleTiming::age(sampleAgeStart,uint32_t(millis()-uploadStarted));
  uploadCode=code;uploadMs=millis()-uploadStarted;recordBlocking(uploadStarted);
  if(previewUpload)nextUpload=millis()+250; // Latest-only UNVERIFIED preview, at most 4 Hz.
  else nextUpload=millis()+1000; // Preserve calibrated upload cadence.
  if(code>=200&&code<300)++uploadOk;else ++uploadFailed;diagnosticPending=true;
  // Never retry an old sample. The next fresh frame replaces it.
  if(code<=0||code>=400)nextUpload=millis()+2000; // Bounded pause, no secret/body logging.
 }
};
WifiScaleTransport wifiScale;
