import type { FlightState } from './flight';
export interface BlackHoleState {
  x: number; y: number; eventHorizonRadius: number; influenceRadius: number;
}
export const GRAVITY_CAP = 1800; // acceleration in world units/s²
export const GRAVITY_STRENGTH = 18_000_000;
export const SPAWN_CLEARANCE = 80;
// Fixed in Step 5; room-owned radii can later grow without a match lifecycle now.
export const createBlackHole = (): BlackHoleState => ({ x: 1200, y: 450, eventHorizonRadius: 90, influenceRadius: 500 });
export type BlackHoleRegion = 'safe' | 'danger' | 'lethal';
export function classifyRegion(point: Pick<FlightState, 'x' | 'y'>, hole: BlackHoleState): BlackHoleRegion {
  const distance = Math.hypot(point.x - hole.x, point.y - hole.y);
  return distance <= hole.eventHorizonRadius ? 'lethal' : distance <= hole.influenceRadius ? 'danger' : 'safe';
}
export function gravityAt(point: Pick<FlightState, 'x' | 'y'>, hole: BlackHoleState) {
  const dx = hole.x - point.x, dy = hole.y - point.y, distance = Math.hypot(dx, dy);
  if (!distance || distance > hole.influenceRadius) return { x: 0, y: 0 };
  const acceleration = Math.min(GRAVITY_CAP, GRAVITY_STRENGTH / Math.max(distance * distance, 1));
  return { x: dx / distance * acceleration, y: dy / distance * acceleration };
}
// Closest point on the full movement segment: inclusive tangent/endpoints,
// zero-length paths, and arbitrarily fast crossings are all covered.
export function crossesHorizon(from: Pick<FlightState, 'x' | 'y'>, to: Pick<FlightState, 'x' | 'y'>, hole: BlackHoleState): boolean {
  const dx = to.x - from.x, dy = to.y - from.y, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((hole.x - from.x) * dx + (hole.y - from.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(from.x + t * dx - hole.x, from.y + t * dy - hole.y) <= hole.eventHorizonRadius;
}
