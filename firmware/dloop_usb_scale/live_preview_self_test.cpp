#include "live_preview.h"
namespace {
constexpr bool spikeAndStep(){
  LivePreview::Filter f;
  for(unsigned i=0;i<10;++i)f.observe(125000,i*100);
  f.observe(-8131,1000);if(!f.spike||f.counts!=125000)return false;
  f.observe(3817471,1100);if(!f.spike||f.counts!=125000)return false;
  for(unsigned i=12;i<20;++i){f.observe(125000,i*100);if(f.counts!=125000)return false;}
  for(unsigned i=20;i<32;++i)f.observe(155000,i*100);
  if(f.counts<154800||f.counts>155000)return false;
  for(unsigned i=32;i<44;++i)f.observe(125000,i*100);
  return f.counts>125000&&f.counts<125200;
}
static_assert(spikeAndStep(),"recorded adjacent extreme spikes excluded; sustained load and removal remain responsive");
constexpr bool stale(){LivePreview::Filter f;for(unsigned i=0;i<6;++i)f.observe(500,i*100);f.observe(1000,1200);return !f.ready&&f.size==1;}
static_assert(stale(),"gap resets preview and requires five new samples");
constexpr bool rawNotGrams(){LivePreview::Filter f;for(unsigned i=0;i<10;++i)f.observe(-125000,i*100);return f.counts==-125000;}
static_assert(rawNotGrams(),"signed raw preview never assumes a calibration factor or clamps zero");
}
