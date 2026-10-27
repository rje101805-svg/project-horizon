import {GUARDIAN_CONFIG} from './guardians';
import {STUN_IMMUNITY_MS,GALAXY_CONFIG} from './weapons';
import { tractorAcceleration, type TractorState } from './tractor';
import { gravityAt, crossesHorizon, type BlackHoleState } from './black-hole';
import { stepFlight, TICK_MS,TICK_SECONDS,EDGE_MARGIN,WORLD, type FlightState, type PlayerInput } from './flight';

// Complete deterministic movement, including all existing forces. The returned
// swept contact freezes prediction; only the server may decide health/respawn.
export function stepMovement(state: FlightState & {tractor?:TractorState;stunRemainingMs?:number;stunImmunityRemainingMs?:number;slowRemainingMs?:number;guardianSlowRemainingMs?:number;launchProtectionRemainingMs?:number;status?:string}, input: PlayerInput, hole: BlackHoleState): boolean {
  const previous = { x: state.x, y: state.y };
  const launching=(state.launchProtectionRemainingMs??0)>0;
  const immune=hole.horizon&&state.status==='ALIEN';
  const gravity=(launching&&!hole.horizon)||immune?{x:0,y:0}:gravityAt(state,hole),pull=tractorAcceleration(state);
  if((state.stunRemainingMs??0)>0){
    // Coast with existing gravity/tractor forces; stun removes thrust, not momentum.
    state.vx+=(gravity.x+pull.x)*TICK_SECONDS;state.vy+=(gravity.y+pull.y)*TICK_SECONDS;
    state.x=Math.max(EDGE_MARGIN,Math.min(WORLD-EDGE_MARGIN,state.x+state.vx*TICK_SECONDS));state.y=Math.max(EDGE_MARGIN,Math.min(WORLD-EDGE_MARGIN,state.y+state.vy*TICK_SECONDS));state.rotation=input.aim;
    state.stunRemainingMs=Math.max(0,(state.stunRemainingMs??0)-TICK_MS);if(state.stunRemainingMs<1e-7){state.stunRemainingMs=0;state.stunImmunityRemainingMs=STUN_IMMUNITY_MS;}
  }else stepFlight(state, input, {x:gravity.x+pull.x,y:gravity.y+pull.y},Math.min((state.slowRemainingMs??0)>0?GALAXY_CONFIG.slowFactor:1,(state.guardianSlowRemainingMs??0)>0?GUARDIAN_CONFIG.slowFactor:1));
  state.slowRemainingMs=Math.max(0,(state.slowRemainingMs??0)-TICK_MS);if(state.slowRemainingMs<1e-7)state.slowRemainingMs=0;
  state.guardianSlowRemainingMs=Math.max(0,(state.guardianSlowRemainingMs??0)-TICK_MS);if(state.guardianSlowRemainingMs<1e-7)state.guardianSlowRemainingMs=0;
  state.launchProtectionRemainingMs=Math.max(0,(state.launchProtectionRemainingMs??0)-TICK_MS);
  const contact = !hole.horizon && !launching && crossesHorizon(previous, state, hole);
  if (contact) state.vx = state.vy = 0;
  return contact;
}
