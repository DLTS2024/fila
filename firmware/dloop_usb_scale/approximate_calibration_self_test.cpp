#include "approximate_calibration.h"
namespace {
using namespace ApproximateCalibration;
constexpr void feed(Session& s,uint32_t& t,uint64_t& id,double mass,unsigned n=250,double drift=0){
  for(unsigned i=0;i<n;++i){t+=100;++id;
    // Explicit synthetic factor -100 counts/g, no claim about real hardware.
    s.observe(long(lround(-20000-100*(mass+drift*i/10))),t,id);
  }
}
constexpr bool fullWorkflow(){
  Session s;uint32_t t=0;uint64_t id=0;s.begin(t);
  feed(s,t,id,0);if(s.state!=State::BaselineReady||s.factor!=0)return false;
  s.load(500,t);feed(s,t,id,500);
  if(s.state!=State::NeedEmpty||s.factor!=-100)return false;
  const double frozen=s.factor;
  for(unsigned c=0;c<3;++c){
    s.empty(t);feed(s,t,id,0);if(s.state!=State::NeedLoad)return false;
    s.check(1000,t);feed(s,t,id,1000);
    if(s.factor!=frozen||s.cycles!=c+1)return false;
    if(c<2&&s.canAccept(t))return false;
  }
  if(s.state!=State::Ready||s.canAccept(t))return false;
  feed(s,t,id,1000,100);if(!s.canAccept(t))return false;
  Record r=s.record();if(!validRecord(r)||recordFactor(r)!=-100)return false;
  // Reboot persistence: only a complete, consistency-checked record is eligible.
  Session reboot; if(reboot.state!=State::Idle||reboot.factor!=0||reboot.canAccept(t))return false;
  if(recordFactor(r)!=frozen)return false;
  r.factorMicro++;if(validRecord(r))return false;r.factorMicro--;
  r.version++;r.checksum=checksum(r);if(validRecord(r))return false;
  r.version=VERSION;r.profile++;r.checksum=checksum(r);if(validRecord(r))return false;
  r.profile=PROFILE;r.cycles=2;r.checksum=checksum(r);if(validRecord(r))return false;
  return true;
}
static_assert(fullWorkflow(),"three independent unload/reload cycles, frozen factor, explicit/live acceptance, record/reboot metadata");
constexpr bool failTrial(unsigned which){
  Session s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);
  s.load(500,t);feed(s,t,id,500);s.empty(t);feed(s,t,id,which==0?6:0);
  if(which==0)return s.state==State::Failed&&s.factor==0;
  s.check(1000,t);feed(s,t,id,which==1?959:1051);
  return s.state==State::Failed&&s.cycles==0&&!s.canAccept(t);
}
static_assert(failTrial(0),"bad zero return fails whole attempt");
static_assert(failTrial(1)&&failTrial(2),"independent verification outside reference band fails");
constexpr bool driftAndFaults(unsigned which){
  Session s;uint32_t t=0;uint64_t id=0;s.begin(t);
  if(which==0){feed(s,t,id,0,250,1);s.load(500,t);feed(s,t,id,500);}
  if(which==1){feed(s,t,id,0,100);t+=200;id++;s.observe(-20000,t,id);}
  if(which==2){feed(s,t,id,0,100);t+=100;id+=2;s.observe(-20000,t,id);}
  if(which==3){feed(s,t,id,0,100);s.tick(t+501);}
  if(which==4){feed(s,t,id,0);s.load(500,t);feed(s,t,id,0);}
  if(which==5){feed(s,t,id,0);s.load(0,t);}
  if(which==6){feed(s,t,id,0,100);t+=100;s.observe(8388607,t,++id);}
  return s.state==State::Failed&&s.factor==0&&s.cycles==0&&!s.canAccept(t);
}
static_assert(driftAndFaults(0),"excessive baseline drift rejected after provisional conversion");
static_assert(driftAndFaults(1)&&driftAndFaults(2)&&driftAndFaults(3),"gap/missing ID/stale invalidate pending attempt");
static_assert(driftAndFaults(4)&&driftAndFaults(5)&&driftAndFaults(6),"ambiguous response/invalid reference/rail fail closed");
constexpr bool repeatAndOrder(){
  Session s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);s.load(500,t);feed(s,t,id,500);
  s.empty(t);feed(s,t,id,0);s.check(1000,t);feed(s,t,id,970);
  s.empty(t);feed(s,t,id,0);s.check(1000,t);feed(s,t,id,1000);
  if(s.state!=State::Failed)return false;
  s.begin(t);feed(s,t,id,0);s.load(500,t);feed(s,t,id,500);
  s.check(1000,t);return s.state==State::Failed;
}
static_assert(repeatAndOrder(),"in-band but poor repeatability fails; unload cannot be skipped");
constexpr bool boundary(double mass){
  Session s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);s.load(500,t);feed(s,t,id,500);
  for(unsigned i=0;i<3;++i){s.empty(t);feed(s,t,id,0);s.check(1000,t);feed(s,t,id,mass);}
  feed(s,t,id,mass,100);return s.canAccept(t)&&validRecord(s.record());
}
static_assert(boundary(960)&&boundary(1050),"independent measured reference endpoints are inclusive, never refit");
constexpr bool timeoutAbort(){
  Session s;s.begin(0);s.tick(501);if(s.state!=State::Failed)return false;
  s.abort();if(s.pending()||s.factor||s.cycles)return false;
  s.begin(0);uint32_t t=0;uint64_t id=0;feed(s,t,id,0);
  for(unsigned i=0;i<1201;++i){t+=100;s.observe(-20000,t,++id);}
  return s.state==State::Failed;
}
static_assert(timeoutAbort(),"interruption/abort/step timeout cannot persist pending candidates");
constexpr bool recordIsolation(){
  Record r;r.magic=RECORD_MAGIC;r.version=1;r.factorMicro=-100000000;r.cycles=3;r.minMilli=r.maxMilli=1000000;r.checksum=checksum(r);
  return !validRecord(r)&&EEPROM_ADDRESS>=20;
}
static_assert(recordIsolation(),"strict magic and slot never treated as approximate provenance");
constexpr bool positiveAndOutlier(unsigned which){
  Session s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);s.load(500,t);
  if(which==0){
    for(unsigned i=0;i<250;++i){t+=100;s.observe(30000,t,++id);}
    return s.state==State::NeedEmpty&&s.factor==100;
  }
  if(which==1){
    for(unsigned i=0;i<250;++i){t+=100;s.observe(i==150?-68000:-70000,t,++id);}
    return s.state==State::Failed&&s.factor==0;
  }
  for(unsigned i=0;i<250;++i){t+=100;s.observe(i%20<10?-69500:-70500,t,++id);}
  return s.state==State::Failed;
}
static_assert(positiveAndOutlier(0),"positive polarity supported");
static_assert(positiveAndOutlier(1),"trimmed calibration centre cannot conceal an outlier");
static_assert(positiveAndOutlier(2),"alternating changing load cannot calibrate by averaging");
constexpr bool qualityGuards(){
  Summary s;if(!quality(s,-100))return false;
  s.mad=200;if(quality(s,-100))return false;s.mad=0;
  s.span=501;if(quality(s,-100))return false;s.span=0;
  s.slope=26;if(quality(s,-100))return false;s.slope=0;
  s.half=201;if(quality(s,-100))return false;s.half=0;
  s.jump=801;if(quality(s,-100))return false;s.jump=0;
  return !quality(s,0);
}
static_assert(qualityGuards(),"provisional gram checks reject noise/block drift/slope/half shift/jumps and zero factor");
constexpr bool gapEvidence(unsigned which){
  Session s;s.begin(0);const uint64_t firstId=9007199254740993ULL;
  uint32_t prefixMs=0;uint64_t prefixId=firstId-50;feed(s,prefixMs,prefixId,0,49);
  s.observe(-20000,5000,firstId);if(s.count!=1)return false;
  s.factor=-100;s.cycles=2;
  s.pollContext.available=true;s.pollContext.ready=true;s.pollContext.pollMs=5200;
  s.pollContext.previousAvailable=true;s.pollContext.previousReady=false;s.pollContext.previousPollMs=5100;
  s.pollContext.pollDeltaMs=100;s.pollContext.readStartMs=5200;s.pollContext.readEndMs=5200;
  s.pollContext.haveNotReady=true;s.pollContext.lastNotReadyMs=5100;s.pollContext.notReadySinceAccepted=1;
  const uint32_t delta=which==0?100:which==1?74:200;
  const uint64_t id=firstId+((which==0||which==3)?2:1);
  bool notifiedBeforeClear=false;unsigned calls=0;
  s.observe(-20000,5000+delta,id,[&](const AcquisitionGap& g) constexpr {
    ++calls;notifiedBeforeClear=s.count==1&&s.factor==-100&&s.cycles==2&&s.state==State::Baseline&&
      g.retainedSamples==1&&g.valid;
  });
  const auto g=s.gap;
  if(!notifiedBeforeClear||calls!=1||s.state!=State::Failed||s.count||s.factor||s.cycles)return false;
  if(!g.valid||g.previousId!=firstId||g.currentId!=id||g.previousMs!=5000||g.currentMs!=5000+delta||g.deltaMs!=delta)return false;
  if(g.idGap!=(which==0||which==3)||g.tooFast!=(which==1)||g.tooSlow!=(which>=2))return false;
  if(!g.poll.available||!g.poll.ready||g.poll.previousReady||g.poll.notReadySinceAccepted!=1||g.poll.lastNotReadyMs!=5100)return false;
  s.observe(-20000,5300,id+1);if(s.gap.currentId!=id)return false; // first failure remains latched
  s.begin(5400);return !s.gap.valid&&s.count==0;
}
static_assert(gapEvidence(0),"ID_GAP precise uint64 evidence latched and notified before progress is cleared");
static_assert(gapEvidence(1),"TOO_FAST evidence, context and unchanged fail-safe clearing");
static_assert(gapEvidence(2),"TOO_SLOW evidence, context and unchanged fail-safe clearing");
static_assert(gapEvidence(3),"simultaneous ID/time violations are both preserved");
constexpr bool timingBoundariesAndWrap(){
  const unsigned boundaries[2]={75,150};
  for(unsigned dt: boundaries){
    Session s;s.begin(0);s.observe(-20000,100,1);s.observe(-20000,100+dt,2);
    if(s.state!=State::Baseline||s.gap.valid)return false;
  }
  Session s;s.begin(0xffffff00U);s.observe(-20000,0xffffffd0U,1);s.observe(-20000,52,2);
  return s.state==State::Baseline&&!s.gap.valid&&s.lastMs==52;
}
static_assert(timingBoundariesAndWrap(),"75/150 ms equality and uint32 rollover remain accepted");
constexpr bool waitGaps(State wait){
  Session s;s.begin(0);uint32_t t=0;uint64_t id=0;feed(s,t,id,0);
  s.step(wait,t);s.factor=-100;s.cycles=1;
  s.observe(-20000,t+200,++id);
  if(s.state!=wait||s.gap.valid||s.factor!=-100||s.cycles!=1||s.count!=0)return false;
  if(wait==State::BaselineReady)s.load(500,t+200);
  else if(wait==State::NeedEmpty)s.empty(t+200);
  else s.check(1000,t+200);
  // Another 200 ms interval across the command boundary establishes a new anchor.
  s.observe(-20000,t+400,++id);
  if(s.state==State::Failed||!s.haveSample||s.count)return false;
  s.observe(-20000,t+600,++id); // Same gap within active settling must still fail.
  return s.state==State::Failed&&s.gap.valid&&s.gap.deltaMs==200;
}
static_assert(waitGaps(State::BaselineReady),"completed baseline survives wait gap; reference starts fresh anchor, then enforces limits");
static_assert(waitGaps(State::NeedEmpty),"NEED_EMPTY gap does not discard frozen factor/cycles; new empty collection enforces limits");
static_assert(waitGaps(State::NeedLoad),"NEED_1000 gap survives; new verification collection enforces limits");
constexpr bool waitExpiryAndStale(State wait,unsigned test){
  Session s;s.begin(0);uint32_t t=0;uint64_t id=0;feed(s,t,id,0);s.step(wait,t);
  if(test==0){
    // Accepted samples keep freshness valid but cannot extend operator timeout.
    for(unsigned i=0;i<601;++i){t+=200;s.observe(-20000,t,++id);}
    return s.state==State::Failed&&s.reason[2]=='E'&&!s.gap.valid; // STEP_TIMEOUT, not STALE
  }
  if(test==1){s.tick(t+501);return s.state==State::Failed&&s.reason[2]=='A'&&!s.gap.valid;}
  if(test==2){s.observe(-20000,t+501,++id);return s.state==State::Failed&&s.reason[2]=='A'&&!s.gap.valid;}
  if(test==3){
    if(wait==State::BaselineReady)s.load(500,t+100);else if(wait==State::NeedEmpty)s.empty(t+100);else s.check(1000,t+100);
    s.observe(-20000,t+501,++id);return s.state==State::Failed&&s.reason[2]=='A'&&!s.gap.valid;
  }
  s.observe(8388607,t+200,++id);return s.state==State::Failed&&!s.gap.valid;
}
constexpr bool waitsSafe(){
  const State waits[3]={State::BaselineReady,State::NeedEmpty,State::NeedLoad};
  for(State wait:waits)for(unsigned test=0;test<5;++test)if(!waitExpiryAndStale(wait,test))return false;
  return true;
}
static_assert(waitsSafe(),"all operator waits retain timeout, stale tick/arrival, stale first-anchor and rail protection");
constexpr bool readyStillProtected(){
  Session s;s.begin(0);s.lastMs=100;s.lastId=1;s.haveSample=true;s.step(State::Ready,100);
  s.observe(-20000,300,2);return s.state==State::Failed&&s.gap.valid&&s.gap.deltaMs==200;
}
static_assert(readyStillProtected(),"final READY_TO_ACCEPT live reference retains original continuity protection");
constexpr bool sameText(const char* a,const char* b){
  while(*a&&*a==*b){++a;++b;}return *a==*b;
}
constexpr bool workflowWithWaitGaps(){
  Session s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);
  const double baselineCentre=s.baseline.centre;
  for(unsigned stage=0;stage<7;++stage){
    const State wait=s.state;
    if(wait!=State::BaselineReady&&wait!=State::NeedEmpty&&wait!=State::NeedLoad)return false;
    const double frozen=s.factor;const unsigned cycles=s.cycles;
    // Repeated missed-ready polls, fast arrivals and ID discontinuities are
    // irrelevant to a finished collection, but samples must remain fresh.
    for(unsigned j=0;j<8;++j){t+=j%2?74:200;id+=2;s.observe(-20000,t,id);}
    if(s.state!=wait||s.gap.valid||s.count||s.haveSample||s.factor!=frozen||s.cycles!=cycles||
       s.baseline.centre!=baselineCentre)return false;
    s.tick(t); // Mirrors firmware's pre-command expiry/freshness gate.
    const double mass=wait==State::BaselineReady?500:wait==State::NeedEmpty?0:1000;
    if(wait==State::BaselineReady)s.load(mass,t);
    else if(wait==State::NeedEmpty)s.empty(t);else s.check(mass,t);
    t+=200;id+=2;s.observe(long(-20000-100*mass),t,id);
    if(!s.collecting()||!s.haveSample||s.gap.valid||s.count)return false;
    feed(s,t,id,mass);
  }
  feed(s,t,id,1000,100);
  return s.canAccept(t)&&validRecord(s.record())&&s.factor==-100;
}
static_assert(workflowWithWaitGaps(),"natural three-cycle workflow tolerates all wait/command gaps without changing baseline, frozen factor or acceptance rules");
constexpr bool collectionGapMatrix(){
  const State phases[4]={State::Baseline,State::Reference,State::Empty,State::Check};
  for(State phase:phases)for(unsigned retained=0;retained<2;++retained)for(unsigned fault=0;fault<3;++fault){
    Session s;s.begin(0);s.step(phase,0);
    uint32_t t=0;uint64_t id=0;feed(s,t,id,0,retained?60:2);
    const unsigned before=s.count;
    if((retained&&before==0)||(!retained&&before!=0))return false;
    t+=fault==0?74:fault==1?151:100;id+=fault==2?2:1;s.observe(-20000,t,id);
    if(s.state!=State::Failed||!sameText(s.reason,"ACQUISITION_GAP")||
       !s.gap.valid||s.gap.previousState!=phase||s.gap.retainedSamples!=before||s.count)return false;
  }
  return true;
}
static_assert(collectionGapMatrix(),"all four collections enforce 75-150 ms and consecutive IDs during settling and retained acquisition");
constexpr bool waitBoundaries(){
  const State waits[3]={State::BaselineReady,State::NeedEmpty,State::NeedLoad};
  for(State wait:waits){
    Session s;s.begin(0);s.step(wait,0);
    for(unsigned i=1;i<=600;++i)s.observe(-20000,i*200,i);
    if(s.state!=wait)return false; // 120000 ms timeout is inclusive.
    s.tick(120001);
    if(!sameText(s.reason,"STEP_TIMEOUT"))return false;
    s.begin(0);s.step(wait,0);s.observe(-20000,500,1);
    if(s.state!=wait||s.lastMs!=500)return false; // 500 ms freshness is inclusive.
    s.observe(-20000,1001,2);
    if(!sameText(s.reason,"STALE")||s.gap.valid)return false;
  }
  return true;
}
static_assert(waitBoundaries(),"operator waits retain exact expiry and stale-arrival boundaries");
}
