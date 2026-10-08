import {BIOMES,type Biome} from './planet-material';
import {VIEW_POINTS,ENVIRONMENT_VIEWS} from './solar-layout';
import type { VisualIntensity } from './intensity';
export type Composition='auto'|'open'|'planet'|'dark'|'horizon'|'combat';
// Loaded exclusively inside import.meta.env.DEV. Controls never send network events.
export function installVisualDebug(state:VisualIntensity,compose:(name:Composition,biome?:Biome)=>void,view:(point:{x:number;y:number}|null)=>void){
 const panel=document.createElement('fieldset');panel.id='visual-controls';
 panel.innerHTML=`<legend>P3S2.6 cosmic study · DEV only</legend><p>Presentation only: compositions move decorative studies beside your ship. They do not teleport players or add hazards. The real arena singularity stays authoritative. Camera inspection releases flight input and never teleports players.</p><div><button id="visual-open">Open space</button><button id="visual-planet">Planet · bright</button><button id="visual-dark">Planet · dark</button><button id="visual-horizon">Horizon study</button><button id="visual-combat">Combat backdrop</button><button id="visual-auto">Restore arena</button></div><label>Biome <select id="visual-biome">${BIOMES.map(b=>`<option value="${b}">${b}</option>`).join('')}</select></label><label>Inspect camera <select id="visual-view"><option value="-1">Follow player</option>${[...VIEW_POINTS,...ENVIRONMENT_VIEWS].map((p,i)=>`<option value="${i}">${p.name}</option>`).join('')}</select></label><label>Visual intensity <input id="visual-intensity" type="range" min="0" max="1" step=".05" value="0"></label><label>Quality <select id="visual-quality"><option value="standard">Standard · WebGL if available</option><option value="low">Low · baked bodies / no lens</option></select></label><label><input id="visual-camera" type="checkbox" checked> Cinematic camera</label><label><input id="visual-parallax" type="checkbox" checked> Parallax</label><p id="visual-rendering">Renderer: awaiting frame</p><output id="visual-composition">Arena · no visual study</output>`;
 document.getElementById('debug-overlay')!.append(panel);
 panel.querySelector<HTMLSelectElement>('#visual-quality')!.value=state.quality;
 panel.querySelector<HTMLInputElement>('#visual-camera')!.checked=state.camera;
 for(const name of ['auto','open','planet','dark','horizon','combat'] as const)panel.querySelector(`#visual-${name}`)!.addEventListener('click',()=>{compose(name);panel.querySelector('output')!.textContent=name==='auto'?'Arena · no visual study':`${name.toUpperCase()} · visual prototype only / no collision`;});
 panel.querySelector<HTMLInputElement>('#visual-intensity')!.oninput=e=>{state.target=Number((e.target as HTMLInputElement).value);};
 panel.querySelector<HTMLSelectElement>('#visual-quality')!.onchange=e=>{state.quality=(e.target as HTMLSelectElement).value==='low'?'low':'standard';};
 panel.querySelector<HTMLInputElement>('#visual-camera')!.onchange=e=>{state.camera=(e.target as HTMLInputElement).checked;};
 panel.querySelector<HTMLInputElement>('#visual-parallax')!.onchange=e=>{state.parallax=(e.target as HTMLInputElement).checked;};
 panel.querySelector<HTMLSelectElement>('#visual-biome')!.onchange=e=>{const biome=(e.target as HTMLSelectElement).value as Biome;compose('planet',biome);panel.querySelector('output')!.textContent=`${biome} · study beside player / no collision`;};
 panel.querySelector<HTMLSelectElement>('#visual-view')!.onchange=e=>{const index=Number((e.target as HTMLSelectElement).value);compose('auto');view([...VIEW_POINTS,...ENVIRONMENT_VIEWS][index]??null);panel.querySelector('output')!.textContent=index<0?'Following player':`${[...VIEW_POINTS,...ENVIRONMENT_VIEWS][index]?.name} · camera only / flight released`;};
 return ()=>panel.remove();
}
