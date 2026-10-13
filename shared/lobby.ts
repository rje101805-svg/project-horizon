import {LOBBY_HOLE,LOBBY_RADIUS} from './match';
import {stepFlight,type FlightState,type PlayerInput} from './flight';
// Lobby-only movement uses the normal flight response, with a soft circular
// guide. Shared authority/prediction prevents a client-only boundary correction.
export function stepLobby(state:FlightState,input:PlayerInput){
 const dx=LOBBY_HOLE.x-state.x,dy=LOBBY_HOLE.y-state.y,d=Math.hypot(dx,dy),pull=Math.max(0,d-LOBBY_RADIUS)*12;
 stepFlight(state,input,d?{x:dx/d*pull,y:dy/d*pull}:{x:0,y:0});
}
