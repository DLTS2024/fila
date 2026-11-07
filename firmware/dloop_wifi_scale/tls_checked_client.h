#pragma once
#include <WiFiClientSecureBearSSL.h>
#if !defined(MMU_IRAM_HEAP)
#error "Wi-Fi TLS requires MMU: 16KB cache + 48KB IRAM and 2nd Heap (shared), mmu=4816H"
#endif

// The staging server does not negotiate MFLN. Keep the full TLS record buffer;
// core 3.1.2 allocates its I/O buffers from the enabled IRAM heap first.
// HTTPClient clones its client: preserve connect-time diagnostics in the clone.
class CheckedScaleTlsClient : public BearSSL::WiFiClientSecure {
 int* errorCode;
 int* fragmentStatus;
 uint32_t* connectDuration=nullptr;
 bool establishedOnly=false;
 public:
 CheckedScaleTlsClient(int& error,int& fragment):errorCode(&error),fragmentStatus(&fragment){
  setBufferSizes(16384,512);
 }
 void measureConnect(uint32_t& duration){connectDuration=&duration;duration=0;}
 void requireEstablished(bool required){establishedOnly=required;}
 std::unique_ptr<WiFiClient> clone() const override {
  return std::unique_ptr<WiFiClient>(new CheckedScaleTlsClient(*this));
 }
 int connect(const char* host,uint16_t port) override {
  // HTTPClient clones this flag and the verified TLS context. Never spend a
  // second handshake aging a frame already selected for transmission.
  if(establishedOnly)return connected()?1:0;
  *errorCode=0;*fragmentStatus=-1;
  const uint32_t started=millis();
  const int connected=BearSSL::WiFiClientSecure::connect(host,port);
  if(connectDuration)*connectDuration=millis()-started;
  *errorCode=getLastSSLError(); // Before HTTPClient can stop/free the context.
  if(!connected)return 0;
  *fragmentStatus=getMFLNStatus()?1:0;
  // MFLN is optional with a full-size receive buffer. Base connect() already
  // completed CA, hostname and certificate-time validation before returning 1.
  return 1;
 }
 int connect(const String& host,uint16_t port) override {return connect(host.c_str(),port);}
 // A hostname is mandatory for SNI and certificate-name validation.
 int connect(IPAddress,uint16_t) override {return 0;}
};
