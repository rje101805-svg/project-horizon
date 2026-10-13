export type CinematicCue='menu'|'lobby'|'ready'|'countdown'|'collapse'|'launch'|'eject';
// Add URLs here only when approved files exist. An empty manifest is intentionally
// silent: no speculative requests, missing-file errors or autoplay failures.
export const CINEMATIC_AUDIO_ASSETS:Partial<Record<CinematicCue,string>>={};
const sounds=new Map<CinematicCue,HTMLAudioElement>();
export function stopCinematicAmbience(){for(const cue of ['menu','lobby']as const)sounds.get(cue)?.pause();}
export function playCinematicCue(cue:CinematicCue){
 window.dispatchEvent(new CustomEvent('horizon-audio-cue',{detail:cue}));
 const source=CINEMATIC_AUDIO_ASSETS[cue];if(!source)return;
 if(cue==='menu'||cue==='lobby')stopCinematicAmbience();
 let sound=sounds.get(cue);if(!sound){sound=new Audio(source);sound.loop=cue==='menu'||cue==='lobby';sound.volume=sound.loop?.18:.35;sounds.set(cue,sound);}
 if(!sound.loop)sound.currentTime=0;
 void sound.play().catch(()=>{/* Autoplay/codec restrictions never block play. */});
}
