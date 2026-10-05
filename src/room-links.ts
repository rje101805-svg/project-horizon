import { normalizeRoomCode } from '../shared/rooms';
export function roomFromSearch(search: string): string | null { return normalizeRoomCode(new URLSearchParams(search).get('room')); }
export function roomLink(href: string, code: string): string {
  const url = new URL(href); url.searchParams.set('room', code); return url.toString();
}
