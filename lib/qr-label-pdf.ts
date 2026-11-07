import {jsPDF} from 'jspdf';
import QRCode from 'qrcode';
export type QrBatch={id:string;count:number|string;createdAt:string;layoutVersion:number|string;labels:{id:string;ordinal:number|string;state:string;spoolId?:string|null}[]};
// A4, 21 labels/page: 63.5 x 38.1 mm, 2.5 mm horizontal gap.
export function qrLabelPdf(batch:QrBatch):ArrayBuffer{
 if(!/^[a-f0-9]{32}$/.test(batch.id)||Number(batch.layoutVersion)!==1||![50,100,250,500].includes(Number(batch.count))||batch.labels.length!==Number(batch.count)||new Set(batch.labels.map(l=>l.id)).size!==batch.labels.length)throw Error('Invalid or incomplete QR batch.');
 const doc=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true,floatPrecision:4});
 doc.setFileId(batch.id.toUpperCase());doc.setCreationDate('D:'+batch.createdAt.slice(0,19).replace(/\D/g,'')+"+00'00'");doc.setProperties({title:'D Loop 3D permanent QR labels',author:'D Loop 3D',subject:'Print at actual size; no scaling'});
 const labels=[...batch.labels].sort((a,b)=>Number(a.ordinal)-Number(b.ordinal)),pages=Math.ceil(labels.length/21);
 labels.forEach((label,index)=>{
  if(!/^[a-f0-9]{32}$/.test(label.id)||Number(label.ordinal)!==index+1)throw Error('Invalid QR label order.');
  const cell=index%21;if(cell===0){if(index)doc.addPage();doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(50);doc.text('D LOOP 3D | PERMANENT QR LABELS | PRINT 100% / ACTUAL SIZE',7.25,6);doc.setFontSize(6);doc.text(`Batch ${batch.id} | ${batch.createdAt.slice(0,19)} UTC`,7.25,10);doc.text(`A4 - 63.5 x 38.1 mm - 3 x 7 labels | Page ${Math.floor(index/21)+1}/${pages}`,7.25,292);}
  const x=7.25+(cell%3)*66,y=15.15+Math.floor(cell/3)*38.1;
  doc.setDrawColor(220);doc.setLineWidth(0.1);doc.rect(x,y,63.5,38.1);
  const qr=QRCode.create('DL3D:LABEL:'+label.id,{errorCorrectionLevel:'M'}),module=25/(qr.modules.size+8),left=x+(63.5-25)/2,top=y+2;
  doc.setFillColor('#000000');for(let row=0;row<qr.modules.size;row++)for(let col=0;col<qr.modules.size;col++)if(qr.modules.data[row*qr.modules.size+col])doc.rect(left+(col+4)*module,top+(row+4)*module,module,module,'F');
  doc.setTextColor(0);doc.setFont('courier','normal');doc.setFontSize(6.5);doc.text('QL-'+label.id,x+31.75,y+32,{align:'center'});
 });
 return doc.output('arraybuffer');
}
