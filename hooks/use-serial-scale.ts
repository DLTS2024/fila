import {useEffect,useState} from 'react';
import {SerialScaleConnection} from '@/lib/scale/serial';
export function useSerialScale(injected?:SerialScaleConnection,externallyManaged=false){
  const [connection]=useState(()=>injected??new SerialScaleConnection());
  const [state,setState]=useState(connection.getState());
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    const unsubscribe=connection.subscribe(next=>{setState(next);setNow(Date.now())});
    const timer=setInterval(()=>{connection.tick();setNow(Date.now())},250);
    const stop=()=>{void connection.disconnect()};window.addEventListener('pagehide',stop);
    return()=>{unsubscribe();clearInterval(timer);window.removeEventListener('pagehide',stop);if(!externallyManaged)void connection.disconnect()};
  },[connection,externallyManaged]);
  return {connection,state,now};
}
