// Visual-only coordinates and tuning. Never imported by the server/shared simulation.
export const PARALLAX = { stars:.035, haze:.10, bodies:.20, dust:1.28 } as const;
export const CAMERA_ZOOM = { min:1, max:1.014, response:2.2 } as const;
export const clamp01 = (n:number) => Number.isFinite(n) ? Math.max(0,Math.min(1,n)) : 0;
export function cameraTarget(speed:number,combat:boolean) {
  return combat ? 1.006 : CAMERA_ZOOM.max-(CAMERA_ZOOM.max-1)*clamp01((speed-290)/150);
}
export function easeZoom(current:number,target:number,elapsedMs:number) {
  const bounded=Math.max(CAMERA_ZOOM.min,Math.min(CAMERA_ZOOM.max,target));
  return Math.max(1,Math.min(CAMERA_ZOOM.max,current+(bounded-current)*(1-Math.exp(-CAMERA_ZOOM.response*Math.max(0,Math.min(100,elapsedMs))/1000))));
}
export function seededRandom(seed=1907) {return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export type VisualQuality = 'standard' | 'low';

export const defaultVisualQuality=(webgl:boolean):VisualQuality=>webgl?'standard':'low';
