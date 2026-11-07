// Presentation only. Never feeds tare, calibration, protocol or inventory values.
export const DISPLAY_ZERO_DEADBAND_G = 0.5;
export function formatPreviewWeight(grams:number|null):string {
  if(grams===null||!Number.isFinite(grams))return '— g';
  const shown=Math.abs(grams)<=DISPLAY_ZERO_DEADBAND_G?0:grams;
  return Math.abs(shown)>=1000?`${(shown/1000).toFixed(3)} kg`:`${shown.toFixed(1)} g`;
}
