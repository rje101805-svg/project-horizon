export const PILOT_ACTIONS=['HUNT','LOOT','CAPTURE','FLEE','REPOSITION'] as const;
export type PilotAction=typeof PILOT_ACTIONS[number];
export type Archetype='Aggressor'|'Strategist'|'Scavenger'|'Survivor'|'Wildcard';
export type DecisionSource='AI'|'FALLBACK';
export interface PilotDecision {action:PilotAction;targetId:string|null;reason:string;commitmentSeconds:number;radio:string|null}
export interface IntelRow {id:string;name:string;color:number;personality:Archetype;intent:PilotAction|'WAITING';target:string;source:DecisionSource;remainingMs:number}
export type IntelPacket={roomCode:string;round:number;allowed:false}|{roomCode:string;round:number;allowed:true;rows:IntelRow[];enabled:boolean;status:string;calls:number;limit:number;averageLatencyMs:number;hourlyCalls:number;hourlyLimit:number;accepted:number;applied:number;fallbacks:number;tokens:number;cadenceMs:number|null};
export interface PilotRadio {id:string;pilotId:string;name:string;color:number;text:string;source:DecisionSource;timeMs:number}
export interface RadioPacket {roomCode:string;round:number;messages:PilotRadio[]}
