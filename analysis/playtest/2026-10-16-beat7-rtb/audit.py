"""Audit the saved paired RTB cohorts without rerunning the simulation."""
import json, gzip, math
from pathlib import Path
from collections import Counter
root=Path(__file__).resolve().parent
def near(a,b,label):
    assert math.isclose(a,b,abs_tol=2e-6,rel_tol=1e-9),(label,a,b)
def audit(folder):
    manifest=json.loads((folder/'manifest.json').read_text())
    runs={}
    for rel in manifest['runs']:
        r=json.load(gzip.open(folder/rel)); key=(r['pilot'],r['seed']); assert key not in runs; runs[key]=r
        assert r['schemaVersion']==2
        p,t=r['perceivedSeconds'],r['seconds']; assert t/8-1e-6<=p<=t+1e-6
        near(sum(r['phaseSeconds'].values()),p,'player phases')
        near(sum(r['simPhaseSeconds'].values()),t,'sim phases')
        near(sum(v/int(f) for f,v in r['compressionSimSeconds'].items()),p,'factor weighting')
        near(sum(r['compressionSimSeconds'].values()),t,'factor exposure')
        near(sum(r['compressionInhibitSimSeconds'].values()),t,'inhibits')
        timeline=r['timeline']; sp=st=0
        for i,b in enumerate(timeline):
            near(b['second'],sp,'bin player start'); near(b['simSecond'],st,'bin sim start')
            if i<len(timeline)-1: near(b['duration'],1,'full bin')
            assert 0<b['duration']<=1+1e-9
            near(sum(b['phaseSeconds'].values()),b['duration'],'bin player phases')
            near(sum(b['simPhaseSeconds'].values()),b['simDuration'],'bin sim phases')
            assert -1e-9<=b['deadAirSeconds']<=b['duration']+1e-9
            assert 0<=b['tension']<=1+1e-9
            sp+=b['duration'];st+=b['simDuration']
        near(sp,p,'player bins');near(st,t,'sim bins')
        for k in ('deadAirSeconds','simDeadAirSeconds','roundsFired','hitsGiven','hitsTaken','kills','shotNearMisses','groundNearMisses'):
            near(sum(b[k] for b in timeline),r[k],k)
        near(sum(len(b['decisions']) for b in timeline),r['decisions'],'decision bins')
        near(sum(e['kind'].startswith('decision:') for e in r['events']),r['decisions'],'decision events')
        for e in r['events']:
            assert 0 <= e['second'] <= p + 2e-6
            # EmitEvent always stamps Tick+1, including a between-tick End.
            # Keep that authoritative stamp; do not invent another physics tick.
            if r['sortieEndedEarly'] and e['kind'] == 'SortieFinished':
                near(e['simSecond'], t + 1/120, 'End raw event tick')
                near(e['second'], p, 'End perceived endpoint')
            else:
                assert 0 <= e['simSecond'] <= t + 2e-6
        assert sum(e['kind']=='SortieFinished' for e in r['events']) == int(r['completed'])
        if r['sortieEndedEarly']:
            assert r['completed'] and r['combatComplete'] and not r['landed'] and r['outcome']=='win'
        if r['landed']: assert r['completed'] and not r['sortieEndedEarly']
        assert 0<=r['longestDeadAirSeconds']<=r['deadAirSeconds']+1e-6
    assert set(runs)=={(p,s) for p in ('clone','novice','ace') for s in range(30)}
    print(folder.name,len(runs),'clock/counter/event/seed invariants passed',Counter(r['outcome'] for r in runs.values()))
    return runs
land=audit(root/'land');end=audit(root/'end-after-combat')
unchanged=0
for key,r in end.items():
    normal=land[key]
    if not r['sortieEndedEarly']:
        a=dict(r);b=dict(normal);a.pop('wallSeconds');b.pop('wallSeconds');assert a==b,key;unchanged+=1
    else:
        # Exact combat event prefix, excluding the intentional End finish.
        before=[e for e in normal['events'] if e['simSecond']<=r['seconds'] and not e['kind'].startswith('decision:') and e['kind']!='SortieFinished']
        ended=[e for e in r['events'] if not e['kind'].startswith('decision:') and e['kind']!='SortieFinished']
        assert before==ended,key
        for k in ('kills','hitsGiven','hitsTaken','roundsFired'): assert r[k]==normal[k],(key,k)
print('Paired modes:',unchanged,'unavailable-End tapes identical excluding execution time; completed-combat prefixes/counters identical.')
