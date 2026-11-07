// Offline diagnostic CLI only. No firmware writes, serial, network or database API.
import fs from 'node:fs';
import {current,provenance,thresholdSets,replay} from './scale-replay/core.mjs';
import {importLog} from './scale-replay/import-log.mjs';
const args=process.argv.slice(2);
if(!args.length){console.error('Usage: node scripts/replay-scale-stability.mjs capture.json [candidates.json] [--details]\n   or: --log capture.txt --labels annotations.json [candidates.json] [--details]');process.exitCode=2;}
else{
 const positional=[];let log=null,labels=null;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--details')continue;
  if(args[i]==='--log'){log=args[++i];if(!log)throw Error('--log requires path');}
  else if(args[i]==='--labels'){labels=args[++i];if(!labels)throw Error('--labels requires path');}
  else positional.push(args[i]);
 }
 if(positional.length>2)throw Error('Expected capture JSON and optional candidate JSON.');
 if(!log&&!positional.length)throw Error('Capture JSON required');
 if(!log&&labels)throw Error('--labels is only for --log input');
 if(log&&positional.length>1)throw Error('Only one candidate file permitted with --log');
 const input=log?importLog(fs.readFileSync(log,'utf8'),labels?JSON.parse(fs.readFileSync(labels,'utf8')):{}):JSON.parse(fs.readFileSync(positional[0],'utf8'));
 const candidatePath=log?positional[0]:positional[1];
 const candidates=candidatePath?JSON.parse(fs.readFileSync(candidatePath,'utf8')):[];
 const datasets=Array.isArray(input)?input:[input];
 console.log(JSON.stringify({diagnosticOnly:true,productionThresholdsUnchanged:true,provenance,current,
  results:datasets.flatMap(d=>thresholdSets(candidates).map(t=>replay(d,t,{details:args.includes('--details')})))},null,2));
}
