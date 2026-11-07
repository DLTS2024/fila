#include "sampling_diagnostics.h"
#include "raw_stability.h"
#include "diagnostic_reporter.h"
namespace {
using namespace SamplingDiagnostics;
constexpr bool reconstruction() {
  Samples s;
  for (unsigned i = 0; i < 40; ++i) s.accept(-29530 + long(i), 1000 + i * 100);
  if (s.accepted != 40 || s.count != 16 || s.firstId() != 25) return false;
  for (unsigned i = 0; i < 16; ++i)
    if (s.value(i) != -29530 + long(24 + i) || s.timestamp(i) != 3400 + i * 100) return false;
  return true;
}
static_assert(reconstruction(), "ring reconstructs raw/time pairs oldest to newest after wrap");
constexpr bool partial() {
  Samples s; s.accept(-1, 25); s.accept(-2, 125); s.accept(-3, 225);
  return s.count == 3 && s.value(0) == -1 && s.timestamp(2) == 225 && s.firstId() == 1;
}
static_assert(partial(), "partial window retains chronological pairs");
constexpr bool intervals() {
  Samples s; s.accept(0, 100); s.accept(0, 200); s.accept(0, 325); s.accept(0, 500);
  auto t = s.timing();
  return t.intervals == 3 && t.minimum == 100 && t.maximum == 175 &&
    t.total == 400 && t.average() > 133.333 && t.average() < 133.334 && s.lastInterval == 175;
}
static_assert(intervals(), "actual nonuniform interval min max average");
constexpr bool rollover() {
  Samples s; s.accept(1, 0xffffffcdUL); s.accept(2, 49); s.accept(3, 149);
  auto t = s.timing();
  return t.intervals == 2 && t.minimum == 100 && t.maximum == 100 && t.average() == 100;
}
static_assert(rollover(), "millis wrap uses modular differences, not negative intervals");
constexpr bool resetWindowCounter() {
  Samples s; s.accept(1, 100); s.accept(2, 200); s.clearWindow();
  if (s.count || s.accepted != 2 || s.lastMs != 200) return false;
  s.accept(3, 1200);
  return s.accepted == 3 && s.count == 1 && s.firstId() == 3 &&
    s.lastInterval == 1000 && s.timing().intervals == 0;
}
static_assert(resetWindowCounter(), "counter is independent of qualification/window resets");
constexpr bool boundedCounter() {
  Samples s; s.accepted = UINT64_MAX - 1; s.accept(1, 100); s.accept(2, 200);
  return s.accepted == UINT64_MAX && s.saturated && s.value(0) == 1;
}
static_assert(boundedCounter(), "diagnostic sample IDs never wrap");
static_assert(Samples{}.timing().intervals == 0, "empty timing has no invented intervals");
constexpr bool once() {
  ResetOnce r;
  return !r.take(0) && r.take(1) && !r.take(1) && r.take(2) && !r.take(2);
}
static_assert(once(), "each reset ID consumed once rather than repeated each poll");
constexpr bool resetWrap() {
  ResetOnce r; r.seen = UINT32_MAX;
  return r.take(0) && !r.take(0);
}
static_assert(resetWrap(), "reset ID rollover still detected once");
constexpr bool eventSnapshot() {
  Samples s;
  RawStability::Hold h;
  for (unsigned i = 0; i < 16; ++i) s.accept(-29530 + long(i % 2), 100 + 100 * i);
  auto bad = RawStability::Stats{}; bad.slope = 2.00147; bad.quiet = false;
  h.pending = 3;
  h.observe(bad, true);
  ResetOnce gate;
  if (!gate.take(h.resetId) || h.lastReset != RawStability::Hold::ResetReason::SLOPE ||
      h.resetPending != 4 || h.resetCount || h.resetValue != 2.00147 || h.resetLimit != 2) return false;
  // Pre-clear raw/timing evidence survives independently of Hold resetting.
  return s.count == 16 && s.accepted == 16 && s.timestamp(0) == 100 &&
    s.timestamp(15) == 1600 && !gate.take(h.resetId);
}
static_assert(eventSnapshot(), "reset event retains failed value pending and relevant raw timestamps");
constexpr bool queueAtomic() {
  Output q;
  if (!q.diagnostics.push("#DIAG x\n")) return false;
  unsigned n = 0;
  const char* p = q.peek(n);
  if (!p || p[0] != '#' || n != 8) return false;
  q.consume(3);
  q.protocol.push("{}\n");
  p = q.peek(n);
  if (q.active != 2 || n != 5 || p[0] != 'A') return false;
  q.consume(5); p = q.peek(n);
  return q.active == 1 && p[0] == '{' && n == 3;
}
static_assert(queueAtomic(), "protocol cannot interrupt a partly transmitted diagnostic line");
constexpr bool reservedProtocol() {
  Output q;
  for (unsigned i = 0; i < 8; ++i) if (!q.diagnostics.push("#\n")) return false;
  if (q.diagnostics.push("#\n") || !q.protocol.push("{}\n")) return false;
  unsigned n = 0; const char* p = q.peek(n);
  return p[0] == '{' && q.active == 1 && q.diagnostics.count == 8;
}
static_assert(reservedProtocol(), "diagnostics cannot consume protocol-reserved slots");
constexpr bool malformedRejected() {
  Lines<1, 8> q;
  return !q.push("12345678\n") && !q.push("no LF") && !q.push("") && q.push("123456\n") && !q.push("x\n");
}
static_assert(malformedRejected(), "bounded queue rejects overlong incomplete and overflowed lines");
constexpr bool drained() {
  Output q; q.protocol.push("{}\n"); unsigned n = 0; q.peek(n); q.consume(99);
  return !q.peek(n) && n == 0 && q.protocol.count == 0;
}
static_assert(drained(), "short writes and completed lines advance only within bounds");
constexpr bool failedComparisons() {
  RawStability::Hold h;
  h.reset(RawStability::Hold::ResetReason::SLOPE, 2.00147, 2);
  auto s = failure(h, 800, 100, 0);
  if (!s.numeric || s.value != 2.00147 || s.limit != 2) return false;
  h.reset(RawStability::Hold::ResetReason::STALE);
  auto t = failure(h, 800, 100, 0);
  if (!t.numeric || t.value != 700 || t.limit != 500) return false;
  h.reset(RawStability::Hold::ResetReason::RAW_RANGE);
  auto r = failure(h, 800, 100, -8388608);
  return r.numeric && r.value == -8388608 && r.limit == -8388600;
}
static_assert(failedComparisons(), "reset event reports exact slope, stale age and rail comparison");
constexpr bool categoricalReset() {
  RawStability::Hold h; h.reset(RawStability::Hold::ResetReason::CANCEL);
  return !failure(h, 1000, 900, -29530).numeric;
}
static_assert(categoricalReset(), "command reset does not pretend to be a failed numeric threshold");
}
