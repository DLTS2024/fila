#pragma once
#include <math.h>
#include <stdint.h>

// Display only. Never supplies rawStats, Hold, calibration or inventory values.
namespace LivePreview {
struct Filter {
  double values[5] = {}, counts = 0;
  unsigned size = 0, next = 0;
  bool ready = false, spike = false;
  uint32_t lastMs = 0;
  constexpr void reset() { size=next=0;ready=spike=false; }
  static constexpr double absolute(double x){return x<0?-x:x;}
  constexpr void observe(long raw, uint32_t ms) {
    if(size && uint32_t(ms-lastMs)>500) reset();
    lastMs=ms;values[next]=raw;next=(next+1)%5;if(size<5)++size;
    if(size<5)return;
    double sorted[5]={}, deviations[5]={};
    for(unsigned i=0;i<5;++i)sorted[i]=values[i];
    sort(sorted);const double median=sorted[2];
    for(unsigned i=0;i<5;++i)deviations[i]=absolute(values[i]-median);
    sort(deviations);
    // A one/two-conversion impulse cannot move the median. A sustained load
    // step becomes the majority in three conversions, without a frozen display.
    const double band=8*deviations[2]>400?8*deviations[2]:400;
    spike=absolute(double(raw)-median)>band;
    if(!ready){counts=median;ready=true;}
    else counts+=0.4*(median-counts);
  }
  static constexpr void sort(double* a){for(unsigned i=1;i<5;++i){double v=a[i];unsigned j=i;while(j&&a[j-1]>v){a[j]=a[j-1];--j;}a[j]=v;}}
};
}
