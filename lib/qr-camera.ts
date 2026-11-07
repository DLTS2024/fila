export type CameraControls={stop:()=>void};
export async function startSpoolCamera(video:HTMLVideoElement,onText:(text:string)=>void):Promise<CameraControls>{
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Camera scanning requires a secure context and camera permission. Paste a code instead.');
 const {BrowserQRCodeReader}=await import('@zxing/browser');
 const reader=new BrowserQRCodeReader();
 return reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false},video,result=>{if(result)onText(result.getText());});
}
