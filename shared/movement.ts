import { gravityAt, crossesHorizon, type BlackHoleState } from './black-hole';
import { stepFlight, type FlightState, type PlayerInput } from './flight';

// Complete deterministic movement, including all existing forces. The returned
// swept contact freezes prediction; only the server may decide health/respawn.
export function stepMovement(state: FlightState, input: PlayerInput, hole: BlackHoleState): boolean {
  const previous = { x: state.x, y: state.y };
  stepFlight(state, input, gravityAt(state, hole));
  const contact = crossesHorizon(previous, state, hole);
  if (contact) state.vx = state.vy = 0;
  return contact;
}
