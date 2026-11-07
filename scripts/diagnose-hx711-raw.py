"""Offline supplementary signal diagnostics; requires compare-empty-hx711 output.

No device access or production imports. Only the specified output JSON is written.
"""
import csv
import json
import math
from pathlib import Path
import statistics as st
import sys


def q(values, p):
    a = sorted(values)
    i = (len(a) - 1) * p
    return a[math.floor(i)] + (a[math.ceil(i)] - a[math.floor(i)]) * (i % 1)


def fit(y, t):
    mt, my = st.mean(t), st.mean(y)
    slope = sum((x - mt) * (v - my) for x, v in zip(t, y)) / sum((x - mt) ** 2 for x in t)
    residual = [v - my - slope * (x - mt) for x, v in zip(t, y)]
    return slope, st.pstdev(residual)


assert fit([3, 5, 7, 9], [0, 1, 2, 3]) == (2, 0)
assert q([0, 10], 0.5) == 5
assert fit([0, 0, 10, 0, 0], list(range(5)))[1] == 4

source = json.loads(Path(sys.argv[1]).read_text())
result = {'diagnosticOnly': True, 'numericalChecks': 3, 'captures': []}
for c in source['captures']:
    name = c['name']
    records = list(csv.DictReader(Path('captures', name).open(newline='')))
    raw = [int(r['raw']) for r in records]
    t = [(int(r['device_ms']) - int(records[0]['device_ms'])) / 1000 for r in records]
    delta = [b - a for a, b in zip(raw, raw[1:])]
    slopes, residuals, spans = [], [], []
    for i in range(len(raw) - 15):
        slope, noise = fit(raw[i:i+16], t[i:i+16])
        slopes.append(slope)
        residuals.append(noise)
        spans.append(max(raw[i:i+16]) - min(raw[i:i+16]))
    jumps = []
    for i in sorted(range(1, len(raw)), key=lambda k: abs(delta[k-1]), reverse=True)[:8]:
        jumps.append({'row': i+1, 'id': records[i]['sample_id'], 'seconds': t[i],
                      'fromRaw': raw[i-1], 'toRaw': raw[i], 'delta': delta[i-1],
                      'dtMs': round((t[i]-t[i-1])*1000),
                      'nextFiveRaw': raw[i+1:i+6]})
    # Fixed ten-second intervals; discard the tiny final remainder.
    epochs = []
    for start in range(0, 60, 10):
        ids = [i for i, x in enumerate(t) if start <= x < start+10]
        ys = [raw[i] for i in ids]
        if len(ys) < 2:
            continue
        slope, residual = fit(ys, [t[i] for i in ids])
        epochs.append({'startSeconds': start, 'n': len(ids), 'mean': st.mean(ys),
                       'slopePerSecond': slope, 'lineResidualSd': residual,
                       'localRejects': sum(bool(w['failed']) for w in c['windows'] if ids[0]+16 <= w['row'] <= ids[-1]+1),
                       'localWindows': max(0, len(ids)-15)})
    result['captures'].append({'name': name, 'firstId': records[0]['sample_id'],
        'lastId': records[-1]['sample_id'], 'firstUptimeSeconds': int(records[0]['device_ms'])/1000,
        'netFirstToLast': raw[-1]-raw[0], 'firstLast50MeanDelta': st.mean(raw[-50:])-st.mean(raw[:50]),
        'adjacentAbsoluteDelta': {'median': q(list(map(abs, delta)), .5), 'p95': q(list(map(abs, delta)), .95),
            'above200': sum(abs(x)>200 for x in delta), 'above400': sum(abs(x)>400 for x in delta)},
        'largestAdjacentChanges': jumps,
        'windowLineResidualSd': {'median': q(residuals,.5), 'p95': q(residuals,.95)},
        'windowFullSpread': {'median': q(spans,.5), 'p95': q(spans,.95)},
        'windowSignedSlopePerSecond': {'p05': q(slopes,.05), 'median':q(slopes,.5), 'p95':q(slopes,.95)},
        'epochs': epochs})
Path(sys.argv[2]).write_text(json.dumps(result, indent=2)+'\n')
print('PASS: 3 numerical checks; supplementary diagnostics written for',len(result['captures']),'captures.')
