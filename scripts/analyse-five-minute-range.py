"""Offline descriptive analysis only; never accesses a device or changes firmware."""
import csv
import hashlib
import json
import statistics as st
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', default='captures/empty-continuous-5min-d5d86874a80e454bb4feb1b8408ae372.csv')
parser.add_argument('--output-dir', default='docs/five-minute-range-analysis')
args = parser.parse_args()
SOURCE = ROOT / args.source
OUT = ROOT / args.output_dir
OUT.mkdir(parents=True, exist_ok=True)
meta = json.loads(Path(str(SOURCE) + '.json').read_text())
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == meta['csvSha256']
rows = list(csv.DictReader(SOURCE.open(newline='')))
assert len(rows) == meta['samples'] and meta['complete']
x = [int(r['raw']) for r in rows]
t = [int(r['device_ms']) for r in rows]
ids = [int(r['sample_id']) for r in rows]
assert all(b == a + 1 for a, b in zip(ids, ids[1:]))
assert all(0 < b-a <= 500 for a, b in zip(t, t[1:]))
config = (ROOT / 'firmware/dloop_usb_scale/scale_config.h').read_text()
import re
limit = int(re.search(r'RAW_HARD_RANGE\s*=\s*(\d+)', config)[1])

def quant(a, p):
    s = sorted(a); z = (len(s)-1)*p; k = int(z)
    return s[k] + (s[min(k+1,len(s)-1)]-s[k])*(z-k)

def distribution(a):
    if not a: return dict(n=0)
    return dict(n=len(a), min=min(a), p01=quant(a,.01), p05=quant(a,.05),
                p25=quant(a,.25), median=st.median(a), p75=quant(a,.75),
                p95=quant(a,.95), p99=quant(a,.99), max=max(a),
                mean=st.mean(a), sd=st.pstdev(a))

def runs(indices):
    result=[]
    for i in indices:
        if not result or i != result[-1][-1]+1: result.append([])
        result[-1].append(i)
    return result

windows=[]; extrema=set(); members=set(); failing=[]
for end in range(15,len(x)):
    start=end-15; w=x[start:end+1]; spread=max(w)-min(w)
    if spread <= limit: continue
    failing.append(end)
    lo=[j for j in range(start,end+1) if x[j]==min(w)]
    hi=[j for j in range(start,end+1) if x[j]==max(w)]
    extrema.update(lo+hi); members.update(range(start,end+1))
    windows.append(dict(first_id=ids[start],last_id=ids[end],first_ms=t[start],last_ms=t[end],
        limit=limit,spread=spread,excess=spread-limit,min_raw=min(w),max_raw=max(w),
        min_ids=[ids[j] for j in lo],max_ids=[ids[j] for j in hi],
        samples=[dict(id=ids[j],ms=t[j],raw=x[j]) for j in range(start,end+1)]))
with (OUT/'full-range-windows.json').open('w') as f: json.dump(windows,f,indent=2)
with (OUT/'full-range-windows.csv').open('w',newline='') as f:
    fields=['first_id','last_id','first_ms','last_ms','limit','spread','excess','min_raw','max_raw','min_ids','max_ids','samples']; writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
    for w in windows: writer.writerow({k:json.dumps(v,separators=(',',':')) if isinstance(v,list) else v for k,v in w.items()})

delta=[x[i]-x[i-1] for i in range(1,len(x))]
# Fixed descriptive cutoffs, not acceptance thresholds or proof of a spike cause.
jumps={}
for cutoff in [200,400,800,1600]:
    ix=[i for i in range(1,len(x)) if abs(x[i]-x[i-1])>cutoff]
    pairs=[i for i in range(1,len(x)-1) if abs(x[i]-x[i-1])>cutoff
           and abs(x[i+1]-x[i])>cutoff and (x[i]-x[i-1])*(x[i+1]-x[i])<0
           and abs(x[i+1]-x[i-1])<=cutoff]
    jumps[str(cutoff)]=dict(transitions=len(ix),per_minute=len(ix)/((t[-1]-t[0])/60000),
        unique_endpoints=len(set(ix)|{i-1 for i in ix}),
        consecutive_transition_runs=len(runs(ix)),spike_return_centres=len(pairs),
        spike_return_ids=[ids[i] for i in pairs],magnitude=distribution([abs(x[i]-x[i-1]) for i in ix]) if ix else None)

# Leave-one-out local reference separates excursions from whole-record baseline wander.
local=[]
for i in range(len(x)):
    neighbors=x[max(0,i-10):i]+x[i+1:min(len(x),i+11)]
    reference=st.median(neighbors)
    local.append(x[i]-reference)
anomalies={}
for cutoff in [200,400,800,1600]:
    ix=[i for i,v in enumerate(local) if abs(v)>cutoff]
    anomalies[str(cutoff)]=dict(samples=len(ix),runs=len(runs(ix)),ids=[ids[i] for i in ix],
        magnitude=distribution([abs(local[i]) for i in ix]) if ix else None,
        failing_windows_containing_one=sum(any(abs(local[j])>cutoff for j in range(e-15,e+1)) for e in failing))

clusters=[dict(first_end_id=ids[g[0]],last_end_id=ids[g[-1]],windows=len(g),
    duration_between_window_ends_ms=t[g[-1]]-t[g[0]],
    contributing_first_id=ids[g[0]-15],contributing_last_id=ids[g[-1]]) for g in runs(failing)]
with (OUT/'failure-clusters.json').open('w') as f:json.dump(clusters,f,indent=2)
with (OUT/'sample-excursions.csv').open('w',newline='') as f:
    w=csv.writer(f);w.writerow(['id','ms','raw','delta_previous','local_median_residual','is_window_extremum','in_failing_window'])
    for i in range(len(x)):w.writerow([ids[i],t[i],x[i],delta[i-1] if i else '',local[i],i in extrema,i in members])
epochs=[]
for second in range(0,300,10):
    ix=[i for i in range(len(x)) if second*1000<=t[i]-t[0]<(second+10)*1000]
    if ix:epochs.append(dict(start_s=second,raw_mean=st.mean(x[i] for i in ix),raw_min=min(x[i] for i in ix),raw_max=max(x[i] for i in ix),
        full_windows=sum(i>=15 for i in ix),failing_windows=sum(i in failing for i in ix)))
result=dict(source=str(SOURCE.relative_to(ROOT)),sha256=meta['csvSha256'],operator_evidence=meta['labelEvidence'],
    configured_limit=limit,window_size=16,equality_passes=True,samples=len(x),duration_s=(t[-1]-t[0])/1000,
    timing_ms=distribution([b-a for a,b in zip(t,t[1:])]),raw=distribution(x),absolute_adjacent_delta=distribution(list(map(abs,delta))),
    full_windows=len(x)-15,full_range_failures=len(windows),spread_all=distribution([max(x[i-15:i+1])-min(x[i-15:i+1]) for i in range(15,len(x))]),spread_failed=distribution([w['spread'] for w in windows]),
    unique_window_extrema=len(extrema),unique_samples_in_failed_windows=len(members),
    failure_clusters=len(clusters),cluster_window_lengths=distribution([c['windows'] for c in clusters]),
    isolated_failing_windows=sum(c['windows']==1 for c in clusters),longest_clusters=sorted(clusters,key=lambda c:c['windows'],reverse=True)[:10],
    adjacent_jump_screens=jumps,local_excursion_screens=anomalies,
    largest_adjacent_changes=[dict(id=ids[i],ms=t[i],before=x[i-1],raw=x[i],delta=x[i]-x[i-1],dt=t[i]-t[i-1]) for i in sorted(range(1,len(x)),key=lambda i:abs(x[i]-x[i-1]),reverse=True)[:15]],
    epochs=epochs)
logged=[]
for line in Path(str(SOURCE)+'.log').read_text().splitlines():
    if not line.startswith('#DIAG RESET '): continue
    fields=dict(re.findall(r'(\w+)=(\[[^\]]*\]|\S+)',line))
    if fields.get('reason') != 'FULL_RANGE': continue
    values=json.loads(fields['raw']); times=json.loads(fields['times'])
    assert len(values)==len(times)==16
    assert max(values)-min(values)==float(fields['value'])==int(fields['spread'])
    assert float(fields['limit'])==limit and int(fields['spread'])>limit
    first=int(fields['firstId']); last=int(fields['accepted'])
    assert last-first==15
    logged.append(dict(reset_id=int(fields['resetId']),first_id=first,last_id=last,
        limit=limit,spread=max(values)-min(values),min_raw=min(values),max_raw=max(values),
        min_ids=[first+i for i,v in enumerate(values) if v==min(values)],
        max_ids=[first+i for i,v in enumerate(values) if v==max(values)],
        includes_pre_csv_samples=first<ids[0],
        samples=[dict(id=first+i,ms=times[i],raw=v) for i,v in enumerate(values)]))
assert [(w['first_id'],w['last_id'],w['spread']) for w in logged if not w['includes_pre_csv_samples']]==[(w['first_id'],w['last_id'],w['spread']) for w in windows]
(OUT/'all-logged-full-range-events.json').write_text(json.dumps(logged,indent=2)+'\n')
result['logged_full_range_events']=len(logged)
result['logged_events_with_pre_csv_samples']=sum(w['includes_pre_csv_samples'] for w in logged)
(OUT/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['local_excursion_screens','epochs']},indent=2))
print('LOCAL SCREENS',json.dumps({k:{a:b for a,b in v.items() if a!='ids'} for k,v in anomalies.items()},indent=2))
print('EPOCHS',json.dumps(epochs))
