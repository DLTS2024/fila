// Exact shared implementation evaluated at compile time, never run on hardware.
#include "approximate_weighing.h"
namespace {
constexpr bool fixedLoad(double mass) {
  ApproximateWeighing::Filter f;
  for(unsigned i=0;i<200;++i){
    const double noise=(int(i%4)-1.5)*0.2;
    const double raw=-20000-100*(mass+noise); // Explicit synthetic counts/g only.
    f.observe((raw+20000)/-100,i*100,true);
    if(i<79&&f.qualified)return false;
  }
  return f.qualified && fabs(f.grams-mass)<0.1;
}
static_assert(fixedLoad(0.3),"no load: real small positive residual, no auto-zero");
static_assert(fixedLoad(1000),"synthetic 1000 g: settled measured result");
static_assert(fixedLoad(975),"reference error within requested band is not snapped to 1000");
static_assert(ApproximateWeighing::referenceAccepted(960)&&ApproximateWeighing::referenceAccepted(1050),"inclusive reference band");
static_assert(!ApproximateWeighing::referenceAccepted(959.99)&&!ApproximateWeighing::referenceAccepted(1050.01),"reject beyond reference band");
constexpr bool removalRepeatability(){
  ApproximateWeighing::Filter f;
  for(unsigned i=0;i<100;++i)f.observe(1000,i*100,true);
  if(!f.qualified)return false;
  if(f.observe(0,10000,true))return false;
  for(unsigned i=101;i<200;++i)f.observe(0,i*100,true);
  if(!f.qualified||f.grams!=0)return false;
  if(f.observe(1000,20000,true))return false;
  for(unsigned i=201;i<300;++i)f.observe(1000,i*100,true);
  if(!f.qualified||f.grams!=1000)return false;
  if(f.observe(1050,30000,true))return false; // sudden change must revoke
  return !f.observe(1000,30100,true); // spike cannot be trimmed into approval
}
static_assert(removalRepeatability(),"removal/reload requires full requalification; repeatability; spike revocation");
constexpr bool changing(unsigned mode){
  ApproximateWeighing::Filter f;
  for(unsigned i=0;i<250;++i){
    const double v=mode==0?i*0.1:mode==1?(i%20<10?10:0):1000;
    if(f.observe(v,i*100,mode!=2))return false;
  }
  return true;
}
static_assert(changing(0),"no-load continuous 1 g/s drift never qualifies");
static_assert(changing(1),"sustained alternating changing load never qualifies");
static_assert(changing(2),"invalid calibration never qualifies");
constexpr bool gapFault(){
  ApproximateWeighing::Filter f;
  for(unsigned i=0;i<100;++i)f.observe(1000,i*100,true);
  if(f.observe(1000,11000,true))return false;
  for(unsigned i=111;i<210;++i)f.observe(1000,i*100,true);
  if(!f.qualified)return false;
  return !f.observe(6000,21000,true)&&!f.observe(1000,21100,true);
}
static_assert(gapFault(),"stale and out-of-range observations clear history");
constexpr bool referenceGates(){
  ApproximateWeighing::Filter f;
  if(ApproximateWeighing::canVerifyReference(f,true,true,true))return false;
  for(unsigned i=0;i<100;++i)f.observe(1000,i*100,true);
  return ApproximateWeighing::canVerifyReference(f,true,true,true)&&
    !ApproximateWeighing::canVerifyReference(f,false,true,true)&&
    !ApproximateWeighing::canVerifyReference(f,true,false,true)&&
    !ApproximateWeighing::canVerifyReference(f,true,true,false);
}
static_assert(referenceGates(),"reference verification needs correct mode, calibrated, fresh, qualified sample");
constexpr bool accumulatedDrift(){
  ApproximateWeighing::Filter f;
  for(unsigned i=0;i<100;++i)f.observe(1000,i*100,true);
  if(!f.qualified)return false;
  for(unsigned i=100;i<850;++i){
    f.observe(1000+(i-100)*.01,i*100,true); // 0.1 g/s below local slope gate
    if(f.driftFault)return !f.qualified;
  }
  return false;
}
static_assert(accumulatedDrift(),"subthreshold ongoing drift eventually revokes qualification and reference approval");
}
