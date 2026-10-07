import { tractorAcceleration, TRACTOR_ATTACKER_MOVEMENT_MULTIPLIER, type TractorState } from './tractor';
import { gravityAt, crossesHorizon, type BlackHoleState } from './black-hole';
import { stepFlight, type FlightState, type PlayerInput } from './flight';

// Complete deterministic movement, including all existing forces. The returned
// swept contact freezes prediction; only the server may decide health/respawn.
export function stepMovement(state: FlightState & {tractor?:TractorState}, input: PlayerInput, hole: BlackHoleState): boolean {
  const previous = { x: state.x, y: state.y };
  const gravity=gravityAt(state,hole),pull=tractorAcceleration(state);
  stepFlight(state, input, {x:gravity.x+pull.x,y:gravity.y+pull.y}, state.tractor?.targetId ? TRACTOR_ATTACKER_MOVEMENT_MULTIPLIER : 1);
  const contact = crossesHorizon(previous, state, hole);
  if (contact) state.vx = state.vy = 0;
  return contact;
}
