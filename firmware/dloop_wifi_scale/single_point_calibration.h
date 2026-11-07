#pragma once
#include <stdint.h>
#include <math.h>
#include "single_point_acquisition.h"
// Included after the shared APPROX definitions; no extra sample buffers allocated.

// Independent, bounded, nonblocking collector. No EEPROM, UART or inventory API.
namespace SinglePointCalibration {
constexpr unsigned N=200, BLOCK=20, BLOCKS=N/BLOCK;
constexpr uint32_t SETTLE_MS=5000, STEP_TIMEOUT_MS=120000, MIN_DT_MS=75, MAX_DT_MS=150;
constexpr double ZERO_G=5, ZERO_REPEAT_G=3, REPEAT_G=20;
constexpr uint32_t MAGIC=0x53504331, VERSION=1, PROFILE=1;
constexpr int EEPROM_ADDRESS=80, EEPROM_BYTES=128;
enum class State { Idle, Baseline, BaselineReady, Reference, NeedEmpty, Empty, NeedLoad, Check, Ready, Failed };
constexpr const char* name(State s){
  switch(s){
    case State::Idle:return "IDLE";case State::Baseline:return "BASELINE";
    case State::BaselineReady:return "BASELINE_READY";case State::Reference:return "REFERENCE";
    case State::NeedEmpty:return "NEED_EMPTY";case State::Empty:return "EMPTY";
    case State::NeedLoad:return "NEED_REFERENCE";case State::Check:return "CHECK_REFERENCE";
    case State::Ready:return "READY_TO_ACCEPT";default:return "FAILED";
  }
}
struct Summary {
  double centre=0,mad=0,range=0,central=0,half=0,slope=0,span=0,latest=0,jump=0;
};
// Observability only. None of these fields participate in qualification.
struct PollContext {
  bool available=false,ready=false,previousAvailable=false,previousReady=false,haveNotReady=false;
  uint32_t pollMs=0,previousPollMs=0,pollDeltaMs=0,readStartMs=0,readEndMs=0;
  uint32_t notReadySinceAccepted=0,lastNotReadyMs=0;
};
struct AcquisitionGap {
  bool valid=false,idGap=false,tooFast=false,tooSlow=false;
  uint64_t previousId=0,currentId=0;
  uint32_t previousMs=0,currentMs=0,deltaMs=0;
  unsigned retainedSamples=0;State previousState=State::Idle;
  PollContext poll;
  constexpr const char* condition()const{return idGap?"ID_GAP":tooFast?"TOO_FAST":"TOO_SLOW";}
};
struct IgnoreGap {constexpr void operator()(const AcquisitionGap&)const{}};
struct TimeoutEvidence {
 bool valid=false;State previous=State::Idle,stage=State::Idle;
 uint32_t start=0,at=0,elapsed=0,deadline=0;unsigned samples=0,cycles=0;
};
enum class Command { None, Load, Empty, Check, Accept };
constexpr const char* commandName(Command c){return c==Command::Load?"LOAD":c==Command::Empty?"EMPTY":c==Command::Check?"CHECK":c==Command::Accept?"ACCEPT":"UNKNOWN";}
struct CommandEvidence {
 bool valid=false,accepted=false;Command kind=Command::None;State before=State::Idle,after=State::Idle;
 uint32_t at=0,elapsed=0;unsigned samples=0;
};
constexpr char GAP_FORMAT[] = "#DEBUG SINGLE_CAL state=FAILED reason=ACQUISITION_GAP condition=%s idGap=%s tooFast=%s tooSlow=%s prevId=%llu currentId=%llu prevMs=%lu currentMs=%lu deltaMs=%lu samplesBeforeClear=%u phase=%s pollAvailable=%s readyAtPoll=%s pollMs=%lu prevPollAvailable=%s prevPollReady=%s prevPollMs=%lu pollDeltaMs=%lu readStartMs=%lu readEndMs=%lu readDurationMs=%lu notReadySinceAccepted=%lu haveNotReady=%s lastNotReadyMs=%lu\n";
constexpr bool quality(const Summary& s,double factor){
  const double f=fabs(factor);
  return isfinite(f)&&f>=MIN_FACTOR&&f<=MAX_FACTOR&&
    s.range/f<=APPROX_RANGE_G&&s.central/f<=APPROX_CENTRAL_G&&s.mad/f<=APPROX_MAD_G&&
    s.half/f<=APPROX_HALF_G&&s.slope/f<=APPROX_SLOPE_G_S&&s.span/f<=APPROX_HOLD_G&&
    s.latest/f<=APPROX_LATEST_G&&s.jump/f<=APPROX_LATEST_G;
}
// Fixed-point factor avoids float-layout/padding dependence in the checksum.
struct Record {
  uint32_t magic=0,version=0,profile=0,cycles=0;
  int32_t offset=0;uint32_t referenceMilli=0;
  int64_t factorMicro=0;
  int32_t minMilli=0,maxMilli=0,zeroMilli=0;
  uint32_t checksum=0;
};
static_assert(sizeof(Record)==48,"Single-point record layout changed");
static_assert(EEPROM_ADDRESS>=ApproximateCalibration::EEPROM_ADDRESS+sizeof(ApproximateCalibration::Record)&&EEPROM_ADDRESS+sizeof(Record)<=EEPROM_BYTES,"Records overlap");
constexpr uint32_t word(uint32_t h,uint32_t v){for(unsigned i=0;i<4;++i){h^=(v>>(8*i))&255;h*=16777619UL;}return h;}
constexpr uint32_t checksum(const Record& r){
  uint32_t h=2166136261UL;
  h=word(h,r.magic);h=word(h,r.version);h=word(h,r.profile);h=word(h,r.cycles);
  h=word(h,uint32_t(r.offset));h=word(h,r.referenceMilli);
  h=word(h,uint32_t(uint64_t(r.factorMicro)));h=word(h,uint32_t(uint64_t(r.factorMicro)>>32));
  h=word(h,uint32_t(r.minMilli));h=word(h,uint32_t(r.maxMilli));return word(h,uint32_t(r.zeroMilli));
}
constexpr double recordFactor(const Record& r){return double(r.factorMicro)/1000000.0;}
constexpr bool validRecord(const Record& r){
  return r.magic==MAGIC&&r.version==VERSION&&r.profile==PROFILE&&r.cycles==3&&r.referenceMilli>=50000&&r.referenceMilli<=5000000&&
    r.offset>-8388600&&r.offset<8388600&&fabs(recordFactor(r))>=MIN_FACTOR&&fabs(recordFactor(r))<=MAX_FACTOR&&
    r.minMilli>=int32_t(r.referenceMilli)-20000&&r.maxMilli<=int32_t(r.referenceMilli)+20000&&r.maxMilli>=r.minMilli&&r.maxMilli-r.minMilli<=20000&&
    r.zeroMilli>=0&&r.zeroMilli<=5000&&r.checksum==checksum(r);
}
constexpr bool repeatAccepted(double measured,double reference){return isfinite(measured)&&fabs(measured-reference)<=REPEAT_G;}
struct Session {
  State state=State::Idle;
  const char* reason="NONE";
  long* raw;uint32_t* times;double* scratch;
  constexpr Session(long* r,uint32_t* t,double* s):raw(r),times(t),scratch(s){}
  Summary baseline,reference,last;
  unsigned count=0,cycles=0;
  uint32_t stepMs=0,lastMs=0;
  uint64_t lastId=0;
  bool haveSample=false;
  AcquisitionGap gap;
  TimeoutEvidence timeout;
  CommandEvidence command;
  State previousState=State::Idle;
  PollContext pollContext;
  long offset=0;double factor=0,referenceMass=0,minRead=0,maxRead=0,maxZero=0,minZero=0,maxSignedZero=0;
  double lastMeasured=0;
  ApproximateWeighing::Filter live;
  constexpr bool pending()const{return state!=State::Idle;}
  constexpr bool active()const{return state!=State::Idle&&state!=State::Failed;}
  constexpr bool collecting()const{return state==State::Baseline||state==State::Reference||state==State::Empty||state==State::Check;}
  constexpr bool operatorWaiting()const{return state==State::BaselineReady||state==State::NeedEmpty||state==State::NeedLoad;}
  // READY still protects the final live reference immediately before acceptance.
  constexpr bool continuityRequired()const{return collecting()||state==State::Ready;}
  constexpr void fail(const char* why){state=State::Failed;reason=why;factor=0;cycles=0;count=0;live.reset();}
  constexpr void abort(){state=State::Idle;factor=0;cycles=0;count=0;haveSample=false;live.reset();reason="ABORTED";gap=AcquisitionGap{};pollContext=PollContext{};timeout=TimeoutEvidence{};command=CommandEvidence{};previousState=State::Idle;}
  constexpr void noteCommand(Command kind,uint32_t at,State before,uint32_t elapsed,unsigned samples,bool accepted){
    command={true,accepted,kind,before,state,at,elapsed,samples};
  }
  constexpr void step(State s,uint32_t ms){
    previousState=state;state=s;stepMs=ms;count=0;reason="NONE";
    // haveSample is a phase-local continuity anchor, not a freshness flag.
    // Keep lastMs for freshness. A new collection must not inherit a wait gap.
    if(collecting()||operatorWaiting())haveSample=false;
  }
  constexpr void begin(uint32_t ms){
    abort();baseline=Summary{};reference=Summary{};last=Summary{};
    offset=0;referenceMass=0;minRead=maxRead=maxZero=minZero=maxSignedZero=0;
    lastMs=ms;haveSample=false;step(State::Baseline,ms);
  }
  constexpr bool load(double mass,uint32_t ms){
    if(state!=State::BaselineReady||!isfinite(mass)||mass<MIN_REFERENCE_G||mass>MAX_GROSS_G){fail("REFERENCE_OR_ORDER");return false;}
    referenceMass=mass;step(State::Reference,ms);return true;
  }
  constexpr bool empty(uint32_t ms){if(state!=State::NeedEmpty){fail("ORDER");return false;}step(State::Empty,ms);return true;}
  constexpr bool check(double mass,uint32_t ms){
    if(state!=State::NeedLoad||mass!=referenceMass){fail("REFERENCE_OR_ORDER");return false;}
    step(State::Check,ms);return true;
  }
  constexpr void tick(uint32_t ms){
    if(!active())return;
    if(uint32_t(ms-lastMs)>SAMPLE_FRESH_MS)fail("STALE");
    else if(uint32_t(ms-stepMs)>STEP_TIMEOUT_MS){
      timeout={true,previousState,state,stepMs,ms,uint32_t(ms-stepMs),uint32_t(stepMs+STEP_TIMEOUT_MS),count,cycles};
      fail("STEP_TIMEOUT");
    }
  }
  constexpr Summary summarise(){
    Summary s;double blocks[BLOCKS]={},bt[BLOCKS]={};
    for(unsigned i=0;i<N;++i)scratch[i]=raw[i];
    ApproximateWeighing::Filter::sort(scratch,N);
    for(unsigned i=20;i<N-20;++i)s.centre+=scratch[i];s.centre/=N-40;
    const double median=(scratch[N/2-1]+scratch[N/2])/2;
    s.range=scratch[N-1]-scratch[0];s.central=scratch[N-21]-scratch[20];
    for(unsigned i=0;i<N;++i){
      const double d=fabs(double(raw[i])-s.centre);if(d>s.latest)s.latest=d;
      if(i){const double j=fabs(double(raw[i])-raw[i-1]);if(j>s.jump)s.jump=j;}
      scratch[i]=fabs(double(raw[i])-median);
    }
    ApproximateWeighing::Filter::sort(scratch,N);s.mad=(scratch[N/2-1]+scratch[N/2])/2;
    for(unsigned b=0;b<BLOCKS;++b){
      double a[BLOCK]={};
      for(unsigned j=0;j<BLOCK;++j)a[j]=raw[b*BLOCK+j];
      ApproximateWeighing::Filter::sort(a,BLOCK);
      for(unsigned j=2;j<BLOCK-2;++j)blocks[b]+=a[j];blocks[b]/=BLOCK-4;
      bt[b]=double(uint32_t(times[b*BLOCK+BLOCK/2]-times[0]))/1000;
    }
    double lo=blocks[0],hi=lo,first=0,second=0,mean=0,mt=0;
    for(unsigned b=0;b<BLOCKS;++b){
      if(blocks[b]<lo)lo=blocks[b];if(blocks[b]>hi)hi=blocks[b];
      if(b<BLOCKS/2)first+=blocks[b];else second+=blocks[b];mean+=blocks[b];mt+=bt[b];
    }
    mean/=BLOCKS;mt/=BLOCKS;s.span=hi-lo;s.half=fabs(first-second)/(BLOCKS/2);
    double num=0,den=0;for(unsigned b=0;b<BLOCKS;++b){num+=(bt[b]-mt)*(blocks[b]-mean);den+=(bt[b]-mt)*(bt[b]-mt);}
    s.slope=fabs(num/den);return s;
  }
  constexpr void complete(uint32_t ms){
    if(uint32_t(times[N-1]-times[0])<19000){fail("DURATION");return;}
    last=summarise();
    if(state==State::Baseline){baseline=last;offset=long(lround(baseline.centre));step(State::BaselineReady,ms);return;}
    if(state==State::Reference){
      reference=last;const double response=reference.centre-baseline.centre;
      if(fabs(response)<100||fabs(response)<20*(baseline.mad+reference.mad)){fail("AMBIGUOUS_RESPONSE");return;}
      const double f=(reference.centre-offset)/referenceMass;
      if(!isfinite(f)||fabs(f)<MIN_FACTOR||fabs(f)>MAX_FACTOR){fail("FACTOR");return;}
      factor=double(int64_t(llround(f*1000000)))/1000000;
      if(!quality(baseline,factor)||!quality(reference,factor)||fabs((baseline.centre-offset)/factor)>ZERO_G){fail("BASELINE_REFERENCE_QUALITY");return;}
      step(State::NeedEmpty,ms);return;
    }
    if(!quality(last,factor)){fail("NOISE_DRIFT_OUTLIER");return;}
    lastMeasured=(last.centre-offset)/factor;
    if(state==State::Empty){
      if(fabs(lastMeasured)>ZERO_G){fail("ZERO_RETURN");return;}
      if(cycles==0)minZero=maxSignedZero=lastMeasured;
      if(lastMeasured<minZero)minZero=lastMeasured;if(lastMeasured>maxSignedZero)maxSignedZero=lastMeasured;
      if(maxSignedZero-minZero>ZERO_REPEAT_G){fail("ZERO_REPEATABILITY");return;}
      if(fabs(lastMeasured)>maxZero)maxZero=fabs(lastMeasured);
      step(State::NeedLoad,ms);return;
    }
    if(state==State::Check){
      if(!repeatAccepted(lastMeasured,referenceMass)){fail("REFERENCE_BAND");return;}
      if(cycles==0)minRead=maxRead=lastMeasured;
      if(lastMeasured<minRead)minRead=lastMeasured;if(lastMeasured>maxRead)maxRead=lastMeasured;
      if(maxRead-minRead>REPEAT_G){fail("REPEATABILITY");return;}
      ++cycles;
      if(cycles==3){live.reset();step(State::Ready,ms);}else step(State::NeedEmpty,ms);
    }
  }
  constexpr void observe(long value,uint32_t ms,uint64_t id){observe(value,ms,id,IgnoreGap{});}
  template<typename Notify> constexpr void observe(long value,uint32_t ms,uint64_t id,Notify notify){
    if(!active())return;
    if(value<=-8388600||value>=8388600){fail("ADC_RANGE");return;}
    if(continuityRequired()&&haveSample&&(id!=lastId+1||uint32_t(ms-lastMs)>MAX_DT_MS||uint32_t(ms-lastMs)<MIN_DT_MS)){
      gap.valid=true;gap.previousId=lastId;gap.currentId=id;
      gap.previousMs=lastMs;gap.currentMs=ms;gap.deltaMs=uint32_t(ms-lastMs);
      gap.idGap=id!=lastId+1;gap.tooFast=gap.deltaMs<MIN_DT_MS;gap.tooSlow=gap.deltaMs>MAX_DT_MS;
      gap.retainedSamples=count;gap.previousState=state;gap.poll=pollContext;
      notify(gap); // Queue the diagnostic before fail() clears retained progress.
      fail("ACQUISITION_GAP");return;
    }
    // A wait/new anchor cannot conceal a >500 ms outage by overwriting lastMs.
    if(uint32_t(ms-lastMs)>SAMPLE_FRESH_MS){fail("STALE");return;}
    lastMs=ms;lastId=id;haveSample=continuityRequired();tick(ms);if(!active())return;
    if(state==State::Ready){
      const double measured=(double(value)-offset)/factor;
      if(fabs(measured-lastMeasured)>APPROX_LATEST_G){fail("FINAL_LOAD_DISTURBANCE");return;}
      live.observe(measured,ms,true);
      if(live.driftFault)fail("ACCUMULATED_DRIFT");return;
    }
    if(!collecting()||uint32_t(ms-stepMs)<SETTLE_MS)return;
    raw[count]=value;times[count]=ms;++count;
    if(count==N)complete(ms);
  }
  constexpr bool canAccept(uint32_t ms)const{
    return state==State::Ready&&cycles==3&&uint32_t(ms-lastMs)<=SAMPLE_FRESH_MS&&
      uint32_t(ms-stepMs)<=STEP_TIMEOUT_MS&&live.qualified&&repeatAccepted(live.grams,referenceMass);
  }
  constexpr Record record()const{
    Record r;r.magic=MAGIC;r.version=VERSION;r.profile=PROFILE;r.cycles=cycles;r.offset=offset;
    r.factorMicro=int64_t(llround(factor*1000000));
    r.minMilli=int32_t(floor(minRead*1000));r.maxMilli=int32_t(ceil(maxRead*1000));r.zeroMilli=int32_t(ceil(maxZero*1000));
    r.referenceMilli=uint32_t(llround(referenceMass*1000));r.checksum=checksum(r);return r;
  }
};
}

#include "single_point_calibration_self_test.h"
