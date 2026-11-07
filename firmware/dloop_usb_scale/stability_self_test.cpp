// Real shared C++ algorithm evaluated by the compiler; no runtime/test code in flash.
#include "raw_stability.h"
namespace {
constexpr long noise(unsigned i, long width) {
  const long shape[8] = {0, 0, -20, 20, -35, 35, -5, 5};
  return i % 8 == 0 ? -(width / 2) : i % 8 == 1 ? width - width / 2 : shape[i % 8];
}
constexpr RawStability::Stats observed(long base, long width) {
  long values[16] = {};
  for (unsigned i = 0; i < 16; ++i) values[i] = base + noise(i, width);
  return RawStability::analyse(values);
}
constexpr bool stream(unsigned mode, long width = 151) {
  long ring[16] = {}, ordered[16] = {};
  RawStability::Hold hold;
  bool stableDuringMotion = false;
  for (unsigned t = 0; t < 160; ++t) {
    long base = -29500;
    if (mode == 1) base += t * 3; // persistent drift: 30 counts/sec.
    if (mode == 2) base -= t * 100; // actively loading.
    if (mode == 3 && t >= 64) base = -58900; // sudden loading, then plateau.
    if (mode == 4) base += (t / 16) * 30; // sub-window constant, cumulative drift.
    if (mode == 5) base += t; // 10 counts/sec: quiet individual windows, drifting centres.
    if (mode == 6 && t == 80) base += 1000; // spike after previously settling.
    ring[t % 16] = base + noise(t, width);
    for (unsigned i = 0; i < 16; ++i) ordered[i] = ring[(t + 1 + i) % 16];
    auto s = t >= 15 ? RawStability::analyse(ordered) : RawStability::Stats{};
    hold.observe(s, t >= 15);
    if (mode == 3 && t >= 64 && t < 127 && hold.settled) stableDuringMotion = true;
    if (mode == 6 && t >= 80 && t < 143 && hold.settled) stableDuringMotion = true;
    if (mode == 0 && t < 63 && hold.settled) return false;
  }
  return mode == 3 || mode == 6 ? !stableDuringMotion && hold.settled : hold.settled;
}
constexpr bool rejected(unsigned mode) {
  long values[16] = {};
  for (unsigned i = 0; i < 16; ++i) {
    values[i] = -29500 + noise(i, 151);
    if (mode == 0) values[i] += i * 10; // window drift.
    if (mode == 1) values[i] += i >= 8 ? -29400 : 0; // loading step.
    if (mode == 2) values[i] += i % 2 ? 200 : -200; // vibration.
  }
  if (mode == 3) values[15] += 1000; // isolated ADC spike.
  if (mode == 4) values[15] += 250; // fresh movement within hard range.
  return !RawStability::analyse(values).quiet;
}
static_assert(observed(-29500, 141).quiet, "empty lower observed noise");
static_assert(observed(-29500, 151).quiet, "empty upper observed noise");
static_assert(observed(-29450, 151).quiet, "returned empty baseline");
static_assert(observed(-58900, 159).quiet, "loaded lower observed noise");
static_assert(observed(-58900, 270).quiet, "loaded upper observed noise");
static_assert(observed(-29500, 151).spread == 151, "full spread stays visible");
static_assert(RawStability::absolute((observed(-58900, 270).centre - observed(-29500, 151).centre) / 275 + 106.90909) < 0.01, "observed response is not silently a saved factor");
static_assert(stream(0), "settles only after four windows");
static_assert(stream(0, 270), "settles with representative loaded noise");
static_assert(!stream(1), "persistent drift cannot settle");
static_assert(!stream(2), "loading cannot settle");
static_assert(stream(3), "load transition resets hold; quiet plateau must settle again");
static_assert(!stream(4), "multi-window centre drift cannot settle");
static_assert(!stream(5), "slow drift hidden in an individual noisy window cannot settle");
static_assert(stream(6), "spike revokes previously settled state until a new hold passes");
static_assert(rejected(0), "drifting window rejected");
static_assert(rejected(1), "loading step rejected");
static_assert(rejected(2), "unstable platform rejected");
static_assert(rejected(3), "outlier cannot be trimmed into approval");
static_assert(rejected(4), "latest movement rejected");
constexpr bool resetBlocks() {
  RawStability::Hold h;
  const auto s = observed(-29500, 151);
  for (unsigned i = 0; i < 64; ++i) h.observe(s, i >= 15);
  if (!h.settled) return false;
  h.reset(); return !h.settled && h.count == 0 && h.pending == 0;
}
static_assert(resetBlocks(), "stale/fault/reset requires a new settling period");

// Regression: diagnostics must not change pre-instrumentation hold decisions.
struct OriginalHold {
  double centres[4] = {};
  unsigned count = 0, pending = 0;
  bool settled = false;
  constexpr void reset() { count = 0; pending = 0; settled = false; }
  constexpr bool observe(const RawStability::Stats& s, bool full) {
    ++pending;
    if (!full) return settled = false;
    if (!s.quiet) { reset(); return false; }
    if (pending >= WINDOW_SIZE) {
      pending = 0;
      if (count < 4) centres[count++] = s.centre;
      else { for (unsigned i = 0; i < 3; ++i) centres[i] = centres[i + 1]; centres[3] = s.centre; }
    }
    double lo = s.centre, hi = s.centre;
    for (unsigned i = 0; i < count; ++i) {
      lo = RawStability::minimum(lo, centres[i]); hi = RawStability::maximum(hi, centres[i]);
    }
    if (hi - lo > RAW_HOLD_DRIFT) { reset(); return false; }
    return settled = count == 4;
  }
};
constexpr bool equivalent(unsigned mode) {
  long ring[16] = {}, ordered[16] = {};
  RawStability::Hold h; OriginalHold old;
  for (unsigned t = 0; t < 192; ++t) {
    long base = -29530;
    if (mode == 1) base += t;
    if (mode == 2 && t >= 64) base = -58900;
    if (mode == 3 && t % 41 == 0) base += 1000;
    ring[t % 16] = base + noise(t, 151);
    for (unsigned i = 0; i < 16; ++i) ordered[i] = ring[(t + 1 + i) % 16];
    auto s = t >= 15 ? RawStability::analyse(ordered) : RawStability::Stats{};
    if (h.observe(s, t >= 15) != old.observe(s, t >= 15) ||
        h.count != old.count || h.pending != old.pending) return false;
  }
  return true;
}
static_assert(equivalent(0), "stable noisy overlapping windows unchanged");
static_assert(equivalent(1), "slow drift decisions unchanged");
static_assert(equivalent(2), "sudden loading decisions unchanged");
static_assert(equivalent(3), "HX711 glitch decisions unchanged");
constexpr bool resetHistory() {
  RawStability::Hold h;
  auto good = observed(-29530, 151);
  for (unsigned i = 0; i < 16; ++i) h.observe(good, i == 15);
  if (h.count != 1 || h.resetId != 0) return false;
  auto bad = good; bad.slope = 2.01; bad.quiet = false;
  h.observe(bad, true);
  if (h.count || h.pending || h.lastReset != RawStability::Hold::ResetReason::SLOPE ||
      h.resetCount != 1 || h.resetValue != 2.01 || h.resetLimit != 2) return false;
  for (unsigned i = 0; i < 15; ++i) h.observe(good, true);
  if (h.count || h.pending != 15 || h.resetId != 1) return false;
  h.observe(good, true);
  return h.count == 1 && h.pending == 0 && h.resetId == 1;
}
static_assert(resetHistory(), "passing window with hold zero reveals prior transient slope failure and progress");
constexpr bool spanHistory() {
  RawStability::Hold h;
  auto good = observed(-29530, 151);
  for (unsigned i = 0; i < 16; ++i) h.observe(good, i == 15);
  auto shifted = observed(-29489, 151);
  h.observe(shifted, true);
  if (h.lastReset != RawStability::Hold::ResetReason::CENTRE_SPAN ||
      h.resetSpan != 41 || h.resetDelta != 41 || h.resetPrevious != -29530 ||
      !h.resetPreviousValid || h.count != 0) return false;
  h.observe(shifted, true);
  return h.drift(shifted.centre) == 0 && h.resetSpan == 41 && h.resetId == 1 && !h.previousValid;
}
static_assert(spanHistory(), "latched 41-count span survives misleading post-reset drift zero");
constexpr bool externalHistory() {
  RawStability::Hold h;
  auto s = observed(-29530, 151);
  for (unsigned i = 0; i < 64; ++i) h.observe(s, i >= 15);
  h.reset(RawStability::Hold::ResetReason::STALE);
  if (h.lastReset != RawStability::Hold::ResetReason::STALE || h.resetCount != 4 || h.settled) return false;
  h.reset(RawStability::Hold::ResetReason::RAW_RANGE);
  return h.resetId == 2 && h.lastReset == RawStability::Hold::ResetReason::RAW_RANGE && h.pending == 0;
}
static_assert(externalHistory(), "stale and hardware-range resets distinguishable");
constexpr bool overlapProgress() {
  RawStability::Hold h;
  auto s = observed(-29530, 151);
  for (unsigned i = 0; i < 64; ++i) {
    h.observe(s, i >= 15);
    if (h.resetId != 0 || h.count != (i + 1) / 16 || h.pending != (i + 1) % 16) return false;
  }
  return h.settled;
}
static_assert(overlapProgress(), "overlapping quiet windows advance; no unconditional resets");
}
