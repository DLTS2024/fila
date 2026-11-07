#pragma once
#include <stdint.h>
#include "scale_config.h"

// Pure fixed-buffer functions: shared by firmware and compiler-evaluated tests.
namespace RawStability {
constexpr double absolute(double x) { return x < 0 ? -x : x; }
constexpr double minimum(double a, double b) { return a < b ? a : b; }
constexpr double maximum(double a, double b) { return a > b ? a : b; }
constexpr void sort(double* values, unsigned count) {
  for (unsigned i = 1; i < count; ++i) {
    double value = values[i]; unsigned j = i;
    while (j && values[j - 1] > value) { values[j] = values[j - 1]; --j; }
    values[j] = value;
  }
}
struct Stats {
  double centre = 0, median = 0, mad = 0, centralRange = 0;
  double halfShift = 0, slope = 0, latestDelta = 0;
  long low = 0, high = 0, spread = 0;
  bool quiet = false;
};
constexpr Stats analyse(const long* chronological) {
  double sorted[WINDOW_SIZE] = {}, deviations[WINDOW_SIZE] = {};
  for (unsigned i = 0; i < WINDOW_SIZE; ++i) sorted[i] = chronological[i];
  sort(sorted, WINDOW_SIZE);
  Stats s;
  s.low = sorted[0]; s.high = sorted[WINDOW_SIZE - 1]; s.spread = s.high - s.low;
  s.median = (sorted[7] + sorted[8]) / 2;
  for (unsigned i = 2; i < WINDOW_SIZE - 2; ++i) s.centre += sorted[i];
  s.centre /= WINDOW_SIZE - 4;
  s.centralRange = sorted[13] - sorted[2];
  for (unsigned i = 0; i < WINDOW_SIZE; ++i) deviations[i] = absolute(chronological[i] - s.median);
  sort(deviations, WINDOW_SIZE); s.mad = (deviations[7] + deviations[8]) / 2;
  double first[8] = {}, second[8] = {};
  for (unsigned i = 0; i < 8; ++i) { first[i] = chronological[i]; second[i] = chronological[i + 8]; }
  sort(first, 8); sort(second, 8);
  double a = 0, b = 0;
  for (unsigned i = 1; i < 7; ++i) { a += first[i]; b += second[i]; }
  s.halfShift = absolute(a - b) / 6;
  // Clip isolated outliers for trend estimation, but never for the hard range guard.
  double numerator = 0, denominator = 0;
  for (unsigned i = 0; i < WINDOW_SIZE; ++i) {
    double x = double(i) - 7.5;
    double y = maximum(sorted[2], minimum(sorted[13], chronological[i]));
    numerator += x * (y - s.median); denominator += x * x;
  }
  s.slope = absolute(numerator / denominator);
  s.latestDelta = absolute(chronological[15] - s.centre);
  s.quiet = s.spread <= RAW_HARD_RANGE && s.centralRange <= RAW_CENTRAL_RANGE &&
    s.mad <= RAW_MAD && s.halfShift <= RAW_HALF_SHIFT && s.slope <= RAW_SLOPE &&
    s.latestDelta <= RAW_LATEST_DELTA;
  return s;
}
constexpr const char* reason(const Stats& s) {
  return s.spread > RAW_HARD_RANGE ? "OUTLIER" :
    s.centralRange > RAW_CENTRAL_RANGE || s.mad > RAW_MAD ? "NOISE" :
    s.halfShift > RAW_HALF_SHIFT || s.slope > RAW_SLOPE ? "DRIFT" :
    s.latestDelta > RAW_LATEST_DELTA ? "MOVING" : "QUIET";
}
struct Hold {
  enum class ResetReason { BOOT, MANUAL, FULL_RANGE, CENTRAL_RANGE, MAD, HALF_SHIFT,
    SLOPE, LATEST, CENTRE_SPAN, STALE, RAW_RANGE, CANCEL, ZERO_ACCEPTED,
    CAL_ACCEPTED, CALIBRATION_ACCEPTED };
  static constexpr const char* resetName(ResetReason r) {
    switch (r) {
      case ResetReason::BOOT: return "BOOT";
      case ResetReason::MANUAL: return "MANUAL";
      case ResetReason::FULL_RANGE: return "FULL_RANGE";
      case ResetReason::CENTRAL_RANGE: return "CENTRAL_RANGE";
      case ResetReason::MAD: return "MAD";
      case ResetReason::HALF_SHIFT: return "HALF_SHIFT";
      case ResetReason::SLOPE: return "SLOPE";
      case ResetReason::LATEST: return "LATEST";
      case ResetReason::CENTRE_SPAN: return "CENTRE_SPAN";
      case ResetReason::STALE: return "STALE";
      case ResetReason::RAW_RANGE: return "RAW_RANGE";
      case ResetReason::CANCEL: return "CANCEL";
      case ResetReason::ZERO_ACCEPTED: return "ZERO_ACCEPTED";
      case ResetReason::CAL_ACCEPTED: return "CAL_ACCEPTED";
      case ResetReason::CALIBRATION_ACCEPTED: return "CALIBRATION_ACCEPTED";
    }
    return "UNKNOWN";
  }
  double centres[4] = {};
  unsigned count = 0, pending = 0;
  bool settled = false;
  // Observability only: none of these fields participate in acceptance decisions.
  ResetReason lastReset = ResetReason::BOOT;
  uint32_t resetId = 0;
  bool previousValid = false, resetPreviousValid = false;
  double previousCentre = 0, centreDelta = 0, currentSpan = 0;
  unsigned resetCount = 0, resetPending = 0;
  double resetPrevious = 0, resetDelta = 0, resetSpan = 0;
  double resetValue = 0, resetLimit = 0;
  constexpr double drift(double current) const {
    double lo = current, hi = current;
    for (unsigned i = 0; i < count; ++i) { lo = minimum(lo, centres[i]); hi = maximum(hi, centres[i]); }
    return hi - lo;
  }
  constexpr void reset(ResetReason why = ResetReason::MANUAL, double value = 0, double limit = 0) {
    lastReset = why; ++resetId;
    resetCount = count; resetPending = pending; resetPreviousValid = previousValid;
    resetPrevious = previousCentre; resetDelta = centreDelta; resetSpan = currentSpan;
    resetValue = value; resetLimit = limit;
    count = 0; pending = 0; settled = false;
  }
  constexpr bool observe(const Stats& s, bool full) {
    ++pending;
    if (!full) return settled = false;
    previousValid = count > 0;
    previousCentre = count ? centres[count - 1] : 0;
    centreDelta = previousValid ? s.centre - previousCentre : 0;
    currentSpan = drift(s.centre);
    if (!s.quiet) {
      if (s.spread > RAW_HARD_RANGE) reset(ResetReason::FULL_RANGE, s.spread, RAW_HARD_RANGE);
      else if (s.centralRange > RAW_CENTRAL_RANGE) reset(ResetReason::CENTRAL_RANGE, s.centralRange, RAW_CENTRAL_RANGE);
      else if (s.mad > RAW_MAD) reset(ResetReason::MAD, s.mad, RAW_MAD);
      else if (s.halfShift > RAW_HALF_SHIFT) reset(ResetReason::HALF_SHIFT, s.halfShift, RAW_HALF_SHIFT);
      else if (s.slope > RAW_SLOPE) reset(ResetReason::SLOPE, s.slope, RAW_SLOPE);
      else reset(ResetReason::LATEST, s.latestDelta, RAW_LATEST_DELTA);
      return false;
    }
    if (pending >= WINDOW_SIZE) {
      pending = 0;
      if (count < 4) centres[count++] = s.centre;
      else { for (unsigned i = 0; i < 3; ++i) centres[i] = centres[i + 1]; centres[3] = s.centre; }
    }
    double lo = s.centre, hi = s.centre;
    for (unsigned i = 0; i < count; ++i) { lo = minimum(lo, centres[i]); hi = maximum(hi, centres[i]); }
    currentSpan = hi - lo;
    if (hi - lo > RAW_HOLD_DRIFT) { reset(ResetReason::CENTRE_SPAN, hi - lo, RAW_HOLD_DRIFT); return false; }
    return settled = count == 4;
  }
};
static_assert(WINDOW_SIZE == 16, "Revisit robust quantiles and tests when changing window size");
}
