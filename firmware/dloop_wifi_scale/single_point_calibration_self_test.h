#pragma once
// Compile-time numerical/state assertions; no hardware or EEPROM access.
namespace SinglePointCalibrationTests {
struct TestSession : SinglePointCalibration::Session {
 long values[200]={};uint32_t timestamps[200]={};double workspace[200]={};
 constexpr TestSession():SinglePointCalibration::Session(values,timestamps,workspace){}
};
using namespace SinglePointCalibration;
constexpr void feed(SinglePointCalibration::Session& s,uint32_t& t,uint64_t& id,double mass,unsigned n=250,double drift=0){
  for(unsigned i=0;i<n;++i){t+=100;++id;
    // Explicit synthetic factor -100 counts/g, no claim about real hardware.
    s.observe(long(lround(-20000-100*(mass+drift*i/10))),t,id);
  }
}
constexpr bool fullWorkflow(){
  TestSession s;uint32_t t=0;uint64_t id=0;s.begin(t);
  feed(s,t,id,0);if(s.state!=State::BaselineReady||s.factor!=0)return false;
  s.load(1802,t);feed(s,t,id,1802);
  if(s.state!=State::NeedEmpty||s.factor!=-100)return false;
  const double frozen=s.factor;
  for(unsigned c=0;c<3;++c){
    s.empty(t);feed(s,t,id,0);if(s.state!=State::NeedLoad)return false;
    s.check(1802,t);feed(s,t,id,1802);
    if(s.factor!=frozen||s.cycles!=c+1)return false;
    if(c<2&&s.canAccept(t))return false;
  }
  if(s.state!=State::Ready||s.canAccept(t))return false;
  feed(s,t,id,1802,100);if(!s.canAccept(t))return false;
  Record r=s.record();if(!validRecord(r)||recordFactor(r)!=-100)return false;
  // Reboot persistence: only a complete, consistency-checked record is eligible.
  TestSession reboot; if(reboot.state!=State::Idle||reboot.factor!=0||reboot.canAccept(t))return false;
  if(recordFactor(r)!=frozen)return false;
  r.factorMicro++;if(validRecord(r))return false;r.factorMicro--;
  r.version++;r.checksum=checksum(r);if(validRecord(r))return false;
  r.version=VERSION;r.profile++;r.checksum=checksum(r);if(validRecord(r))return false;
  r.profile=PROFILE;r.cycles=2;r.checksum=checksum(r);if(validRecord(r))return false;
  return true;
}
static_assert(fullWorkflow(),"three unload/reload repeatability cycles, frozen factor, explicit/live acceptance, record/reboot metadata");
constexpr bool failTrial(unsigned which){
  TestSession s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);
  s.load(1802,t);feed(s,t,id,1802);s.empty(t);feed(s,t,id,which==0?6:0);
  if(which==0)return s.state==State::Failed&&s.factor==0;
  s.check(1802,t);feed(s,t,id,which==1?1781:1823);
  return s.state==State::Failed&&s.cycles==0&&!s.canAccept(t);
}
static_assert(failTrial(0),"bad zero return fails whole attempt");
static_assert(failTrial(1)&&failTrial(2),"repeat load outside reference-based repeatability band fails");
constexpr bool driftAndFaults(unsigned which){
  TestSession s;uint32_t t=0;uint64_t id=0;s.begin(t);
  if(which==0){feed(s,t,id,0,250,1);s.load(1802,t);feed(s,t,id,1802);}
  if(which==1){feed(s,t,id,0,100);t+=200;id++;s.observe(-20000,t,id);}
  if(which==2){feed(s,t,id,0,100);t+=100;id+=2;s.observe(-20000,t,id);}
  if(which==3){feed(s,t,id,0,100);s.tick(t+501);}
  if(which==4){feed(s,t,id,0);s.load(1802,t);feed(s,t,id,0);}
  if(which==5){feed(s,t,id,0);s.load(0,t);}
  if(which==6){feed(s,t,id,0,100);t+=100;s.observe(8388607,t,++id);}
  return s.state==State::Failed&&s.factor==0&&s.cycles==0&&!s.canAccept(t);
}
static_assert(driftAndFaults(0),"excessive baseline drift rejected after provisional conversion");
static_assert(driftAndFaults(1)&&driftAndFaults(2)&&driftAndFaults(3),"gap/missing ID/stale invalidate pending attempt");
static_assert(driftAndFaults(4)&&driftAndFaults(5)&&driftAndFaults(6),"ambiguous response/invalid reference/rail fail closed");
constexpr bool repeatAndOrder(){
  TestSession s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);s.load(1802,t);feed(s,t,id,1802);
  s.empty(t);feed(s,t,id,0);s.check(1802,t);feed(s,t,id,1783);
  s.empty(t);feed(s,t,id,0);s.check(1802,t);feed(s,t,id,1821);
  if(s.state!=State::Failed)return false;
  s.begin(t);feed(s,t,id,0);s.load(1802,t);feed(s,t,id,1802);
  s.check(1802,t);return s.state==State::Failed;
}
static_assert(repeatAndOrder(),"in-band but poor repeatability fails; unload cannot be skipped");

constexpr bool wrongReference(){
 TestSession s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);s.load(1802,t);feed(s,t,id,1802);
 s.empty(t);feed(s,t,id,0);s.check(1000,t);return s.state==State::Failed;
}
static_assert(wrongReference(),"repeatability requires the same declared mass, not independent verification");
constexpr bool recordBounds(){
 Record r;r.magic=MAGIC;r.version=VERSION;r.profile=PROFILE;r.cycles=3;r.offset=-20000;
 r.factorMicro=-100000000;r.referenceMilli=1802000;r.minMilli=r.maxMilli=1802000;r.checksum=checksum(r);
 if(!validRecord(r))return false;
 const Record reboot=r;if(!validRecord(reboot)||recordFactor(reboot)!=-100)return false;
 r.referenceMilli=0;r.checksum=checksum(r);if(validRecord(r))return false;
 r=reboot;r.magic=ApproximateCalibration::MAGIC;r.checksum=checksum(r);if(validRecord(r))return false;
 r=reboot;r.magic=RECORD_MAGIC;r.checksum=checksum(r);if(validRecord(r))return false;
 r=reboot;r.zeroMilli=5001;r.checksum=checksum(r);if(validRecord(r))return false;
 r=reboot;r.offset=8388600;r.checksum=checksum(r);if(validRecord(r))return false;
 r=reboot;r.factorMicro=0;r.checksum=checksum(r);if(validRecord(r))return false;
 r=reboot;r.minMilli=1781000;r.checksum=checksum(r);if(validRecord(r))return false;
 unsigned char image[128]={};for(unsigned i=0;i<128;++i)image[i]=i;
 for(unsigned i=EEPROM_ADDRESS;i<EEPROM_ADDRESS+sizeof(Record);++i)image[i]=255;
 for(unsigned i=0;i<80;++i)if(image[i]!=i)return false;
 return EEPROM_ADDRESS==80&&EEPROM_ADDRESS+sizeof(Record)==128;
}
static_assert(recordBounds(),"versioned/checksummed persistence rejects corruption and preserves strict/approximate slots");
constexpr bool expiryAndBounds(){
 TestSession s;s.begin(0);s.tick(501);if(s.state!=State::Failed)return false;
 s.abort();if(s.pending())return false;
 uint32_t t=0;uint64_t id=0;s.begin(0);feed(s,t,id,0);s.load(5001,t);if(s.state!=State::Failed)return false;
 s.begin(t);feed(s,t,id,0);s.load(49,t);if(s.state!=State::Failed)return false;
 s.begin(t);feed(s,t,id,0);for(unsigned i=0;i<1201;++i){t+=100;s.observe(-20000,t,++id);}
 return s.state==State::Failed;
}
static_assert(expiryAndBounds(),"freshness, operator wait timeout, bounds and abort remain fail-closed");
constexpr bool noiseQuality(){
 Summary s;if(!quality(s,100))return false;
 s.mad=151;if(quality(s,100))return false;s.mad=0;
 s.slope=26;if(quality(s,100))return false;s.slope=0;
 s.jump=801;if(quality(s,100))return false;s.jump=0;
 s.span=501;return !quality(s,100)&&!quality(Summary{},0)&&!quality(Summary{},1000001);
}
static_assert(noiseQuality(),"noise/drift/jumps and implausible factors rejected");
constexpr bool loadedNoiseAndPolarity(unsigned which){
 TestSession s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);s.load(1802,t);
 for(unsigned i=0;i<250;++i){
  t+=100;
  const long raw=which==0?160200:which==1?(i==150?-198200:-200200):(i%20<10?-199700:-200700);
  s.observe(raw,t,++id);
 }
 return which==0?(s.state==State::NeedEmpty&&s.factor==100):(s.state==State::Failed&&!s.canAccept(t));
}
static_assert(loadedNoiseAndPolarity(0),"positive HX711 polarity accepted without hardcoded factors");
static_assert(loadedNoiseAndPolarity(1)&&loadedNoiseAndPolarity(2),"reference outlier and changing load cannot calibrate by averaging");
struct GapNotice {
 unsigned* calls;SinglePointCalibration::AcquisitionGap* captured;
 constexpr void operator()(const SinglePointCalibration::AcquisitionGap& g)const{++*calls;*captured=g;}
};
constexpr bool latchedGap(unsigned which){
 TestSession s;uint32_t t=0;uint64_t id=9007199254740993ULL;s.begin(t);
 feed(s,t,id,0,60);
 const unsigned retained=s.count;const uint64_t previous=id;const uint32_t previousMs=t;
 s.pollContext.available=true;s.pollContext.ready=true;s.pollContext.pollMs=t+200;
 s.pollContext.previousAvailable=true;s.pollContext.previousReady=false;
 s.pollContext.previousPollMs=t+100;s.pollContext.pollDeltaMs=100;
 s.pollContext.readStartMs=t+200;s.pollContext.readEndMs=t+201;
 s.pollContext.notReadySinceAccepted=1;s.pollContext.haveNotReady=true;s.pollContext.lastNotReadyMs=t+100;
 t+=which==0?200:which==1?74:100;id+=which==2?2:1;
 unsigned calls=0;SinglePointCalibration::AcquisitionGap captured;
 s.observe(-20000,t,id,GapNotice{&calls,&captured});
 if(calls!=1||s.state!=State::Failed||s.count!=0||!s.gap.valid||s.canAccept(t))return false;
 if(captured.previousId!=previous||captured.currentId!=id||captured.previousMs!=previousMs||captured.currentMs!=t)return false;
 if(captured.retainedSamples!=retained||captured.previousState!=State::Baseline)return false;
 if(captured.deltaMs!=uint32_t(t-previousMs)||captured.idGap!=(which==2)||captured.tooFast!=(which==1)||captured.tooSlow!=(which==0))return false;
 if(!captured.poll.available||captured.poll.previousReady||captured.poll.notReadySinceAccepted!=1||captured.poll.readEndMs-captured.poll.readStartMs!=1)return false;
 s.observe(-20000,t+100,id+1,GapNotice{&calls,&captured});return calls==1;
}
static_assert(latchedGap(0)&&latchedGap(1)&&latchedGap(2),"gap evidence retains timing, uint64 IDs, phase and pre-clear samples, once");
constexpr bool phaseAnchors(){
 TestSession s;s.begin(5000);s.lastId=123;s.observe(-20000,5100,9000);
 if(s.state!=State::Baseline||s.lastId!=9000||!s.haveSample)return false;
 s.state=State::BaselineReady;s.haveSample=false;s.lastMs=5100;
 if(!s.load(1802,5200)||s.haveSample)return false;
 s.observe(-200200,5300,9999);if(s.state!=State::Reference||s.gap.valid)return false;
 s.observe(-200200,5400,10000);return s.state==State::Reference&&!s.gap.valid;
}
static_assert(phaseAnchors(),"BEGIN and phase first samples use current acquisition IDs, never old continuity anchors");
constexpr bool readinessSchedule(bool improved,unsigned conversionMs) {
 TestSession s;s.begin(0);s.observe(-20000,0,12);
 uint32_t lastPoll=0,lastRead=0;uint64_t id=12;unsigned notReady=0,reads=0;
 bool previousReady=true;
 for(uint32_t now=1;now<=40000;++now){
  const bool due=improved?SinglePointAcquisition::due(now,lastPoll,lastRead,true):now-lastPoll>=SAMPLE_INTERVAL_MS;
  if(!due)continue;
  const uint32_t pollDelta=now-lastPoll;lastPoll=now;
  // Fake HX711 holds DOUT high until a new conversion is available. A read
  // consumes that conversion and starts the next modeled conversion period.
  const bool ready=now-lastRead>=conversionMs;
  if(ready){
   s.pollContext.available=true;s.pollContext.ready=true;s.pollContext.previousReady=previousReady;
   s.pollContext.pollMs=now;s.pollContext.pollDeltaMs=pollDelta;
   s.pollContext.notReadySinceAccepted=notReady;
   const uint32_t interval=now-lastRead;lastRead=now;++reads;
   s.observe(-20000,now,++id);notReady=0;
   if(s.state==State::Failed){
    return (!improved&&conversionMs==101&&s.gap.deltaMs==200&&!s.gap.idGap&&s.gap.tooSlow&&
       !s.gap.poll.previousReady&&s.gap.poll.notReadySinceAccepted==1&&s.gap.previousId==12&&s.gap.currentId==13) ||
      (improved&&conversionMs==160&&s.gap.deltaMs==160&&s.gap.tooSlow);
   }
   if(interval<100||interval>150)return false; // Never accelerate reads or hide lateness.
  }else ++notReady;
  previousReady=ready;
 }
 return improved&&conversionMs<=150&&reads>=200&&s.state==State::BaselineReady&&!s.gap.valid;
}
static_assert(readinessSchedule(false,101),"reproduce ready -> not-ready -> ready: old scheduler yields 200 ms and consecutive IDs");
static_assert(readinessSchedule(true,101),"5 ms readiness retries collect genuine fresh samples at 105 ms without weakening continuity");
static_assert(readinessSchedule(true,100)&&readinessSchedule(true,13),"nominal 10/80 SPS readiness still reads no faster than the 100 ms target");
static_assert(readinessSchedule(true,150),"150 ms boundary remains inclusive");
static_assert(readinessSchedule(true,160),"a genuinely slow converter still fails, never fabricates or ignores a gap");
static_assert(!SinglePointAcquisition::due(99,95,0,true)&&SinglePointAcquisition::due(100,95,0,true),"no early read eligibility");
static_assert(!SinglePointAcquisition::due(104,100,0,true)&&SinglePointAcquisition::due(105,100,0,true),"bounded 5 ms retry cadence");
static_assert(SinglePointAcquisition::due(50,45,UINT32_MAX-49,true),"unsigned schedule remains correct across millis wrap");
constexpr bool operatorWaitTimeout(){
 TestSession s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);
 const uint32_t start=s.stepMs;
 for(unsigned i=0;i<1201&&s.active();++i){t+=100;s.observe(-20000,t,++id);}
 if(!s.timeout.valid||s.timeout.stage!=State::BaselineReady||s.timeout.previous!=State::Baseline)return false;
 if(s.timeout.start!=start||s.timeout.elapsed<=120000||s.timeout.deadline!=uint32_t(start+120000)||s.timeout.samples!=0)return false;
 const auto evidence=s.timeout;s.noteCommand(Command::Load,t,s.state,t-s.stepMs,s.count,false);
 s.tick(t+100);return s.state==State::Failed&&!s.command.accepted&&s.command.before==State::Failed&&s.timeout.at==evidence.at;
}
static_assert(operatorWaitTimeout(),"fresh operator wait can expire before LOAD; failure stage and rejected command remain latched");
constexpr bool loadDeadlineReset(){
 TestSession s;uint32_t t=0;uint64_t id=0;s.begin(t);feed(s,t,id,0);
 const uint32_t target=s.stepMs+120000;
 while(t<target){t+=100;s.observe(-20000,t,++id);}
 s.tick(t);if(s.state!=State::BaselineReady)return false;
 const uint32_t oldElapsed=t-s.stepMs;
 const bool accepted=s.load(1802,t);s.noteCommand(Command::Load,t,State::BaselineReady,oldElapsed,0,accepted);
 if(!accepted||s.stepMs!=t||s.previousState!=State::BaselineReady||!s.command.accepted||s.command.after!=State::Reference)return false;
 feed(s,t,id,1802);return s.state==State::NeedEmpty&&!s.timeout.valid;
}
static_assert(loadDeadlineReset(),"LOAD at exactly 120 seconds is valid and resets collection deadline; normal reference collection completes");
constexpr bool collectionTimeout(unsigned which){
 TestSession s;s.state=State::BaselineReady;
 const uint32_t start=which==1?UINT32_MAX-60000:1000;s.step(State::Reference,start);s.count=73;s.cycles=2;
 const uint32_t deadline=uint32_t(start+120000);s.lastMs=deadline;s.tick(deadline);
 if(s.state!=State::Reference||s.timeout.valid)return false;
 s.tick(uint32_t(deadline+1));
 if(!s.timeout.valid||s.timeout.stage!=State::Reference||s.timeout.previous!=State::BaselineReady)return false;
 if(s.timeout.samples!=73||s.timeout.cycles!=2||s.timeout.elapsed!=120001||s.count!=0||s.cycles!=0)return false;
 return s.timeout.deadline==deadline&&s.timeout.at==uint32_t(deadline+1);
}
static_assert(collectionTimeout(0)&&collectionTimeout(1),"timeout retains pre-clear collection count/stage and handles millis wrap without extending deadline");
constexpr bool stalePrecedence(){
 TestSession s;s.begin(0);s.tick(120001);return s.state==State::Failed&&!s.timeout.valid;
}
static_assert(stalePrecedence(),"sample freshness still takes precedence over a stage timeout");
}
