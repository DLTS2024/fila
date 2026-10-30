import {useEffect,useState} from 'react';
import {SerialScaleConnection} from '@/lib/scale/serial';
export function useSerialScale(injected?:SerialScaleConnection){
  const [connection]=useState(()=>injected??new SerialScaleConnection());
  const [state,setState]=useState(connection.getState());
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    const unsubscribe=connection.subscribe(setState);
    const timer=setInterval(()=>{connection.tick();setNow(Date.now())},250);
    const stop=()=>{void connection.disconnect()};window.addEventListener('pagehide',stop);
    return()=>{unsubscribe();clearInterval(timer);window.removeEventListener('pagehide',stop);void connection.disconnect()};
  },[connection]);
  return {connection,state,now};
}
