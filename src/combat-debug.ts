import type { FlightConnection } from './network';
import type { CombatDebugAction } from '../shared/combat';
// Loaded only in development. The server independently authorizes every action.
export function installCombatDebug(connection: () => FlightConnection | undefined) {
  document.getElementById('combat-controls')!.hidden = false;
  window.addEventListener('keydown', event => {
    if (event.code === 'KeyF' && !event.repeat && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) {
      document.querySelector<HTMLButtonElement>('[data-combat-action="refill"]')!.click();
    }
  });
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-combat-action]'))) {
    button.onclick = () => {
      const c = connection(), local = c?.latest?.players.find(p => p.id === c.socket.id);
      if (!c?.socket.connected || !local) return;
      const request = { action: button.dataset.combatAction as CombatDebugAction,
        lifeGeneration: local.lifeGeneration, teleportSequence: local.teleportSequence };
      const send = () => c.socket.timeout(3000).emit('combatDebug', request, (error, result) => {
        document.getElementById('combat-debug-result')!.textContent = error ? 'Combat debug request timed out' : result.message;
      });
      c.scheduleDevelopmentAction(send);
    };
  }
}
