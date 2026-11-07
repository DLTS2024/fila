import assert from 'node:assert/strict';
import './test-typescript-loader.mjs';
import QRCode from 'qrcode';
import {QRCodeReader,RGBLuminanceSource,HybridBinarizer,BinaryBitmap} from '@zxing/library';
const {spoolQrPayload,parseSpoolQr}=await import('../lib/qr-spool.ts');
const {resolveSpool}=await import('../lib/spool-identification.ts');
const origin='https://studio.example.invalid',token='a'.repeat(48),spool={id:'existing',code:'PLA_WHITE_01',tagToken:token,status:'active'};
for(const payload of [spoolQrPayload(spool.code),spoolQrPayload(spool.code,origin+'/#/spool/'+token)]){
 const qr=QRCode.create(payload,{errorCorrectionLevel:'M'}),size=(qr.modules.size+8)*4,pixels=new Uint8ClampedArray(size*size);pixels.fill(255);
 for(let y=0;y<qr.modules.size;y++)for(let x=0;x<qr.modules.size;x++)if(qr.modules.data[y*qr.modules.size+x])for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)pixels[((y+4)*4+dy)*size+(x+4)*4+dx]=0;
 const decoded=new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,size,size)))).getText();
 assert.equal(decoded,payload);assert.equal(resolveSpool([spool],parseSpoolQr(decoded,[origin])).id,'existing');assert(!payload.includes('982'));assert(!payload.includes('193'));
}
for(const payload of ['javascript:alert(1)','https://evil.invalid/#/spool/'+token,origin+'/?password=bad#/spool/'+token,origin+'/api/v1/#/spool/'+token,'x'.repeat(513)])assert.equal(parseSpoolQr(payload,[origin]),null);
assert.equal(resolveSpool([{...spool,status:'archived'}],parseSpoolQr('DL3D:SPOOL:PLA_WHITE_01',[])),null);
assert.equal(resolveSpool([spool],parseSpoolQr('DL3D:SPOOL:UNKNOWN',[])),null);
console.log('PASS: generated QR matrix decoded with actual QR decoder; code and approved opaque URL map to one existing spool; external/credentialed/path/oversized payloads and unknown/archived spools fail closed; no mass/secrets in QR.');
