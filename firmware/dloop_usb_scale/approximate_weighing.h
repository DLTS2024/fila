#pragma once
#include <math.h>
#include <stdint.h>
#include "scale_config.h"

// Gram-domain qualifier only: caller must supply a valid calibrated conversion.
// No tare, zero tracking, invented reference values, or output clamping.
namespace ApproximateWeighing {
static_assert(APPROX_WINDOW>=16 && APPROX_WINDOW%2==0 && APPROX_TRIM>0 &&
  2*APPROX_TRIM<APPROX_WINDOW,"Approximate window must be even, with valid trimming");
struct Filter {
  double values[APPROX_WINDOW] = {};
  unsigned count = 0, next = 0;
  uint32_t lastMs = 0, passingSince = 0;
  bool passing = false, qualified = false, anchored = false, driftFault = false;
  double grams = 0, anchor = 0;
  constexpr void reset() { count = next = 0; passing = qualified = anchored = driftFault = false; }
  constexpr bool observe(double value, uint32_t ms, bool validCalibration) {
    driftFault=false;
    if (!validCalibration || !isfinite(value) || value < -ZERO_TOLERANCE_G || value > MAX_GROSS_G) {
      reset(); return false;
    }
    if (count && uint32_t(ms-lastMs) > SAMPLE_FRESH_MS) reset();
    lastMs = ms;
    // Revoke immediately on a new load/removal/spike, before smoothing it away.
    if (qualified && fabs(value-grams) > APPROX_LATEST_G) reset();
    values[next] = value; next = (next+1)%APPROX_WINDOW;
    if (count < APPROX_WINDOW) ++count;
    if (count != APPROX_WINDOW) return qualified = false;
    double ordered[APPROX_WINDOW] = {}, sorted[APPROX_WINDOW] = {};
    for (unsigned i=0;i<APPROX_WINDOW;++i) ordered[i]=sorted[i]=values[(next+i)%APPROX_WINDOW];
    sort(sorted,APPROX_WINDOW);
    grams=0;
    for(unsigned i=APPROX_TRIM;i<APPROX_WINDOW-APPROX_TRIM;++i) grams+=sorted[i];
    grams/=APPROX_WINDOW-2*APPROX_TRIM;
    // Retain the anchor through local-gate failures. Small ongoing drift cannot
    // repeatedly reset a short hold and silently accumulate an arbitrary bias.
    if(anchored && fabs(grams-anchor)>APPROX_HOLD_G){reset();driftFault=true;return false;}
    double deviations[APPROX_WINDOW] = {};
    const double median=(sorted[APPROX_WINDOW/2-1]+sorted[APPROX_WINDOW/2])/2;
    for(unsigned i=0;i<APPROX_WINDOW;++i)deviations[i]=fabs(ordered[i]-median);
    sort(deviations,APPROX_WINDOW);
    const double mad=(deviations[APPROX_WINDOW/2-1]+deviations[APPROX_WINDOW/2])/2;
    double first=0,second=0,numerator=0,denominator=0;
    for(unsigned i=0;i<APPROX_WINDOW;++i){
      if(i<APPROX_WINDOW/2) first+=ordered[i]; else second+=ordered[i];
      const double x=double(i)-(APPROX_WINDOW-1)/2.0;
      numerator+=x*(ordered[i]-grams); denominator+=x*x;
    }
    // Index slope is conservative with permitted gaps; nominal interval is fixed.
    const double slope=fabs(numerator/denominator)*1000.0/SAMPLE_INTERVAL_MS;
    const bool quiet=sorted[APPROX_WINDOW-1]-sorted[0]<=APPROX_RANGE_G &&
      sorted[APPROX_WINDOW-1-APPROX_TRIM]-sorted[APPROX_TRIM]<=APPROX_CENTRAL_G &&
      mad<=APPROX_MAD_G &&
      fabs(first-second)/(APPROX_WINDOW/2)<=APPROX_HALF_G && slope<=APPROX_SLOPE_G_S &&
      fabs(value-grams)<=APPROX_LATEST_G;
    if(!quiet){passing=false;return qualified=false;}
    if(!passing){passing=true;passingSince=ms;}
    qualified=uint32_t(ms-passingSince)>=APPROX_SETTLE_MS;
    if(qualified&&!anchored){anchor=grams;anchored=true;}
    return qualified;
  }
  static constexpr void sort(double* a,unsigned n){
    for(unsigned i=1;i<n;++i){double v=a[i];unsigned j=i;while(j&&a[j-1]>v){a[j]=a[j-1];--j;}a[j]=v;}
  }
};
constexpr bool referenceAccepted(double measured) {
  return isfinite(measured) && measured>=APPROX_REFERENCE_MIN_G && measured<=APPROX_REFERENCE_MAX_G;
}
constexpr bool canVerifyReference(const Filter& f,bool enabled,bool calibrated,bool fresh) {
  return enabled && calibrated && fresh && f.qualified && referenceAccepted(f.grams);
}
}
