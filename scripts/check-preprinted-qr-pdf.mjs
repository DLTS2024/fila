import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import './test-typescript-loader.mjs';
const {qrLabelPdf}=await import('../lib/qr-label-pdf.ts');
for(const count of [50,100,250,500]){
 const batch={id:createHash('sha256').update('batch'+count).digest('hex').slice(0,32),count,createdAt:'2026-01-01 00:00:00.000000',layoutVersion:1,labels:Array.from({length:count},(_,i)=>({id:createHash('sha256').update(`label-${count}-${i}`).digest('hex').slice(0,32),ordinal:i+1,state:'UNUSED'}))};
 const a=Buffer.from(qrLabelPdf(batch)),b=Buffer.from(qrLabelPdf({...batch,labels:batch.labels.map(l=>({...l,state:'ASSIGNED'}))}));assert(a.equals(b),'Re-download must not depend on mutable status/current time');assert.equal((a.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,Math.ceil(count/21));
 const bad={...batch,labels:batch.labels.map(()=>batch.labels[0])};assert.throws(()=>qrLabelPdf(bad));
}
console.log('PASS: 50/100/250/500-label A4 PDFs, expected page counts, deterministic byte-identical re-download after status changes, and duplicate-ID rejection. PDFs tested in memory only.');
