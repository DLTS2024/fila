import {env} from 'cloudflare:workers';
const headers={'Cache-Control':'no-store'};
// Raw measurements are separate from inventory. An operator confirms a reading before stock changes.
export async function GET(){
 try{const row=await env.DB!.prepare('SELECT device_id,gross_g,stable,recorded_at FROM scale_readings WHERE device_id=?').bind('DLOOP-SCALE-01').first();
 return Response.json({reading:row||null},{headers});}
 catch{return Response.json({error:'Scale database migration missing'},{status:503,headers})}
}
export async function POST(req:Request){
 const expected=env.SCALE_DEVICE_TOKEN;
 if(typeof expected!=='string'||expected.length<24)return Response.json({error:'Scale token not configured'},{status:503,headers});
 if(req.headers.get('Authorization')!==`Bearer ${expected}`)return Response.json({error:'Unauthorized'},{status:401,headers});
 if(Number(req.headers.get('content-length')||0)>2048)return Response.json({error:'Too large'},{status:413,headers});
 try{
 const body=await req.text();if(body.length>2048)throw Error('Too large');
 const data=JSON.parse(body);
 if(data.deviceId!=='DLOOP-SCALE-01'||typeof data.grossG!=='number'||!Number.isFinite(data.grossG)||data.grossG<0||data.grossG>20000||typeof data.stable!=='boolean')throw Error('Invalid reading');
 await env.DB!.prepare('INSERT INTO scale_readings(device_id,gross_g,stable,recorded_at) VALUES (?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET gross_g=excluded.gross_g,stable=excluded.stable,recorded_at=excluded.recorded_at').bind('DLOOP-SCALE-01',data.grossG,data.stable?1:0,new Date().toISOString()).run();
 return Response.json({ok:true},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid reading'},{status:400,headers})}
}
