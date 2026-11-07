export type WifiSnapshotTiming={version?:number;preSnapshotMs?:number;authMs?:number;lookupMs?:number};
// Full RTT is the fallback. Remove only proven server time before the age
// snapshot; never infer symmetric network delay or change the freshness limit.
export function wifiResponseAllowance(roundTripMs:number,timing?:WifiSnapshotTiming):number {
 const total=Number.isFinite(roundTripMs)&&roundTripMs>=0?Math.ceil(roundTripMs):10000;
 const pre=timing?.preSnapshotMs;
 if(timing?.version!==1||typeof pre!=='number'||!Number.isInteger(pre)||pre<0||pre>10000||pre>Math.floor(total))return total;
 return total-Math.max(0,pre-1); // Rounded-down server duration plus 1 ms margin.
}
export function wifiPollDelay(elapsedMs:number,configured:boolean):number {
 return Math.max(0,(configured?250:5000)-Math.max(0,elapsedMs));
}
