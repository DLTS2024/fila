#pragma once
#include <stddef.h>

// Deliberately accepts only the API's flat string-valued JSON error envelope.
// No response-derived text ever escapes this parser; malformed/unknown is silent.
namespace ScaleHttpDiagnostic {
enum class Code { None, InvalidFrame, InvalidPreview, StaleUpload };
constexpr int writable(size_t used,bool failed,unsigned long elapsed) {
  return failed||used>=512||elapsed>1000?0:int(512-used);
}
constexpr bool equal(const char* p,size_t n,const char* literal) {
  size_t i=0;for(;i<n;++i)if(!literal[i]||p[i]!=literal[i])return false;
  return literal[i]==0;
}
constexpr void space(const char* p,size_t n,size_t& i) {
  while(i<n&&(p[i]==' '||p[i]=='\r'||p[i]=='\n'||p[i]=='\t'))++i;
}
constexpr bool string(const char* p,size_t n,size_t& i,size_t& start,size_t& length,bool& escaped) {
  if(i>=n||p[i++]!='"')return false;
  start=i;escaped=false;
  while(i<n){
    const unsigned char c=p[i++];
    if(c=='"'){length=i-start-1;return true;}
    if(c<32)return false;
    if(c=='\\'){
      escaped=true;if(i>=n)return false;const char e=p[i++];
      if(e=='u'){for(unsigned k=0;k<4;++k){if(i>=n)return false;const char h=p[i++];if(!((h>='0'&&h<='9')||(h>='a'&&h<='f')||(h>='A'&&h<='F')))return false;}}
      else if(e!='"'&&e!='\\'&&e!='/'&&e!='b'&&e!='f'&&e!='n'&&e!='r'&&e!='t')return false;
    }
  }
  return false;
}
constexpr Code parse(const char* p,size_t n) {
  if(!p||n>512)return Code::None;
  size_t i=0;space(p,n,i);if(i>=n||p[i++]!='{')return Code::None;
  Code result=Code::None;bool haveCode=false;
  space(p,n,i);if(i<n&&p[i]=='}')return Code::None;
  for(unsigned fields=0;fields<8;++fields){
    size_t key=0,kn=0,value=0,vn=0;bool ke=false,ve=false;
    space(p,n,i);if(!string(p,n,i,key,kn,ke))return Code::None;
    space(p,n,i);if(i>=n||p[i++]!=':')return Code::None;
    space(p,n,i);if(!string(p,n,i,value,vn,ve))return Code::None;
    if(ke)return Code::None; // Reject ambiguous escaped keys.
    if(equal(p+key,kn,"code")){
      if(haveCode||ve)return Code::None;haveCode=true;
      if(equal(p+value,vn,"invalid_frame"))result=Code::InvalidFrame;
      else if(equal(p+value,vn,"invalid_preview"))result=Code::InvalidPreview;
      else if(equal(p+value,vn,"stale_upload"))result=Code::StaleUpload;
    }
    space(p,n,i);if(i>=n)return Code::None;
    if(p[i]=='}'){++i;space(p,n,i);return i==n?result:Code::None;}
    if(p[i++]!=',')return Code::None;
  }
  return Code::None;
}
constexpr const char* label(Code code) {
  return code==Code::InvalidFrame?"invalid_frame":code==Code::InvalidPreview?"invalid_preview":code==Code::StaleUpload?"stale_upload":nullptr;
}
}
