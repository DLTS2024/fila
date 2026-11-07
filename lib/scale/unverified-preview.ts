// Display-only user-supplied estimate. Never import into calibration or inventory.
export const UNVERIFIED_COUNTS_PER_GRAM = 213.656;
export function unverifiedEstimatedGrams(taredCounts:number|null,confirmed:boolean,fresh:boolean):number|null {
  if(confirmed!==true||fresh!==true||typeof taredCounts!=='number'||!Number.isFinite(taredCounts))return null;
  return taredCounts/UNVERIFIED_COUNTS_PER_GRAM;
}
