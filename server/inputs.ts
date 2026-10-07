import { parseInput } from '../shared/flight';
import type { InputMessage } from '../shared/protocol';
import type { RoomPlayer } from './rooms';

export const MAX_SERVER_INPUTS = 8;
export function retireInputs(player: RoomPlayer) {
  player.pendingInputs = [];
  player.state.lastProcessedInput = player.lastReceivedSequence;
}
export function acceptMovementInput(player: RoomPlayer, raw: InputMessage, now: number): boolean {
  const input = parseInput(raw);
  if (!input || !player.gameplayEnabled || player.state.lifeState !== 'active' || raw.lifeGeneration !== player.state.lifeGeneration ||
      raw.teleportSequence !== player.state.teleportSequence || !Number.isSafeInteger(raw.sequence) ||
      raw.sequence <= player.lastReceivedSequence || raw.sequence <= 0) return false;
  // Neutral release supersedes buffered thrust on blur/lag toggles. It cannot
  // grant extra movement: it still occupies one server tick.
  if (raw.release === true && (input.up || input.down || input.left || input.right || input.boost)) return false;
  if (raw.release !== true && player.pendingInputs.length >= MAX_SERVER_INPUTS) return false;
  if (raw.release === true) player.pendingInputs = [];
  const message = { ...input, sequence: raw.sequence, lifeGeneration: raw.lifeGeneration,
    teleportSequence: raw.teleportSequence };
  player.pendingInputs.push({ message, receivedAt: now });
  player.lastReceivedSequence = raw.sequence;
  player.lastInput = now;
  // Exposes latest held keys for existing inspection; simulation consumes the
  // ordered queue, at most one command per authoritative tick.
  player.input = input;
  return true;
}
