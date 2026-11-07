// Host-only bridge: reuse the exact offline importer and all its integrity checks.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {importLog} from './import-log.mjs';
const text=fs.readFileSync(process.argv[2],'utf8');
const dataset=importLog(text);
const begin=text.split(/\r?\n/).find(l=>l.startsWith('#DIAG BEGIN '));
const start=BigInt(begin.match(/\baccepted=(\d+)/)[1]);
const last=BigInt(dataset.samples.at(-1).id);
assert(last>start,'No new accepted samples captured');
assert(BigInt(dataset.samples[0].id)<=start+1n,'Missing samples at capture start');
dataset.samples=dataset.samples.filter(s=>BigInt(s.id)>start);
console.log(JSON.stringify(dataset));
