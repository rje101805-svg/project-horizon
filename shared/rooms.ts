export const MAX_ROOM_PLAYERS = 8;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;
export const MAX_NAME_LENGTH = 16;
export const SPAWN_MIN_DISTANCE = 180;
export const SHIP_COLORS = [0x72eee0, 0xffaa66, 0xb9a0ff, 0xff6e9c, 0xffdf72, 0x71aaff, 0x8ee46a, 0xf0f3ff] as const;
export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return code.length === ROOM_CODE_LENGTH && [...code].every(c => ROOM_CODE_ALPHABET.includes(c)) ? code : null;
}
export function sanitizeName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim() : '';
  return [...name].slice(0, MAX_NAME_LENGTH).join('') || 'Pilot';
}
