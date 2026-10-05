// The original sandbox's movement values, now used by the authoritative server.
export const WORLD = 2400;
export const CENTER = WORLD / 2;
export const TICK_RATE = 30;
export const TICK_SECONDS = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;
export const INPUT_TIMEOUT_MS = 250;
export const NORMAL_SPEED = 290;
export const BOOST_SPEED = 440;
export const RESPONSE = 7;
export const EDGE_MARGIN = 20;
export interface PlayerInput {
  up: boolean; down: boolean; left: boolean; right: boolean;
  boost: boolean;
  aim: number; // radians; defaults to movement heading on the client
}
export interface FlightState { x: number; y: number; vx: number; vy: number; rotation: number }
export const idleInput = (): PlayerInput => ({ up: false, down: false, left: false, right: false, boost: false, aim: 0 });
export const spawnFlight = (): FlightState => ({ x: CENTER + 170, y: CENTER, vx: 0, vy: 0, rotation: 0 });
// Strictly select input fields: client positions, velocities and speeds are never used.
export function parseInput(value: unknown): PlayerInput | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (['up', 'down', 'left', 'right', 'boost'].some(key => typeof v[key] !== 'boolean')) return null;
  if (typeof v.aim !== 'number' || !Number.isFinite(v.aim)) return null;
  return { up: v.up as boolean, down: v.down as boolean, left: v.left as boolean, right: v.right as boolean,
    boost: v.boost as boolean, aim: Math.atan2(Math.sin(v.aim), Math.cos(v.aim)) };
}
// This function is NOT called by the browser. No local prediction in Step 3.
export function stepFlight(state: FlightState, input: PlayerInput, acceleration = { x: 0, y: 0 }): void {
  const dx = Number(input.right) - Number(input.left);
  const dy = Number(input.down) - Number(input.up);
  const length = Math.hypot(dx, dy) || 1;
  const speed = input.boost ? BOOST_SPEED : NORMAL_SPEED;
  const blend = 1 - Math.exp(-RESPONSE * TICK_SECONDS);
  state.vx += (dx / length * speed - state.vx) * blend;
  state.vy += (dy / length * speed - state.vy) * blend;
  state.vx += acceleration.x * TICK_SECONDS;
  state.vy += acceleration.y * TICK_SECONDS;
  state.x = Math.max(EDGE_MARGIN, Math.min(WORLD - EDGE_MARGIN, state.x + state.vx * TICK_SECONDS));
  state.y = Math.max(EDGE_MARGIN, Math.min(WORLD - EDGE_MARGIN, state.y + state.vy * TICK_SECONDS));
  state.rotation = input.aim;
}
