import {useEffect,useState} from 'react';
import {studioApi} from '@/lib/api';
import {SerialScaleConnection} from '@/lib/scale/serial';
import {wifiPollDelay} from '@/lib/scale/wifi-timing';
export function useWifiScale(){
 const [connection]=useState(()=>new SerialScaleConnection());
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{const started=performance.now();try{const data=await studioApi.getScaleReading();if(stopped)return;const elapsed=performance.now()-started;connection.ingestWifi(data,elapsed);const delay=data.timing?.version===1?wifiPollDelay(elapsed,!!data.configured):(data.configured?250:5000);timer=setTimeout(poll,delay);}catch{if(!stopped){connection.wifiFailure();timer=setTimeout(poll,3000);}}};
  void poll();return()=>{stopped=true;clearTimeout(timer);};
 },[connection]);return connection;
}
