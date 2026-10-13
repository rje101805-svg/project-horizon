import {normalizeRoomCode} from '../shared/rooms';
import {roomFromSearch} from './room-links';
import {playCinematicCue} from './cinematic-audio';
import type {RoomMode} from '../shared/match';
export const MENU_HOTSPOTS={fill:[4,36.1,15.4,6.1],wait:[20.6,36.1,18.6,6.1],play:[4,43.4,35.2,5.7],free:[2.8,52.9,37.9,10.6],pilot:[2.8,65.6,37.9,14.8],name:[3,82,12.3,7.8],how:[16,82,12,7.8],settings:[28.8,82,11.9,7.8]} as const;
const stored=(key:string,fallback:string)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const save=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{/* Private browsing must not prevent play. */}};
export function installMenu(play:(mode:RoomMode)=>void,join:(code:string)=>Promise<string>){
 const home=document.getElementById('home')!,stage=document.createElement('div');stage.id='menu-art';
 document.body.dataset.quality=stored('horizon-menu-quality','standard');playCinematicCue('menu');
 const debris=document.createElement('div');debris.className='menu-debris';debris.setAttribute('aria-hidden','true');for(const [x,y,size]of [[48,18,5],[64,9,3],[83,11,5],[55,33,3],[92,49,4],[68,40,2]]){const rock=document.createElement('span');Object.assign(rock.style,{left:`${x}%`,top:`${y}%`,width:`${size}px`,height:`${size}px`});debris.append(rock);}stage.append(debris);
 const image=document.createElement('img');image.src=`${import.meta.env.BASE_URL}assets/ui/main-menu.png`;image.alt='Project Horizon cinematic main menu';image.draggable=false;stage.append(image);home.prepend(stage);
 let mode:RoomMode=stored('horizon-mode','wait')==='fill'?'fill':'wait';
 const name=document.getElementById('display-name') as HTMLInputElement;name.value=stored('horizon-name','');name.placeholder='Pilot_XX';name.autocomplete='off';name.setAttribute('aria-label','Player name');
 const overlay=document.createElement('div');overlay.id='menu-modal';overlay.hidden=true;overlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="menu-modal-title"><button id="menu-modal-close" aria-label="Close">×</button><h2 id="menu-modal-title"></h2><div id="menu-modal-body"></div></section>';home.append(overlay);
 const close=()=>{overlay.hidden=true;(document.activeElement as HTMLElement)?.blur();};
 const show=(title:string,body:string)=>{document.getElementById('menu-modal-title')!.textContent=title;document.getElementById('menu-modal-body')!.textContent=body;overlay.hidden=false;document.getElementById('menu-modal-close')!.focus();};
 overlay.addEventListener('click',e=>{if(e.target===overlay||e.target===document.getElementById('menu-modal-close'))close();});
 const buttons=new Map<string,HTMLButtonElement>();
 for(const [id,[x,y,w,h]]of Object.entries(MENU_HOTSPOTS)){
   const node=id==='name'?document.createElement('div'):document.createElement('button');node.classList.add('menu-hotspot');node.dataset.hotspot=id;Object.assign(node.style,{left:`${x}%`,top:`${y}%`,width:`${w}%`,height:`${h}%`});stage.append(node);
   if(id==='name'){node.dataset.label='name';name.classList.add('menu-name-field');node.append(name);node.addEventListener('click',()=>name.focus());name.addEventListener('change',()=>{name.value=name.value.replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,16);save('horizon-name',name.value);});continue;}
   const button=node as HTMLButtonElement;buttons.set(id,button);button.setAttribute('aria-label',id==='free'?'Free Flight':id==='pilot'?'Pilot Select':id==='how'?'How to Play':id.toUpperCase());button.title=button.getAttribute('aria-label')!;
   button.textContent=id==='fill'?'FILL GAME':id==='wait'?'WAIT FOR PLAYERS':'';
   button.onclick=()=>{
    if(id==='fill'||id==='wait'){mode=id;save('horizon-mode',mode);update();}
    else if(id==='play'){name.blur();save('horizon-name',name.value);play(mode);}
    else if(id==='how')show('HOW TO PLAY','WASD / arrows: fly · Mouse: aim · Mouse / Space: fire · Shift: boost · E: tractor · F: pick up / swap · G: quick-drop · R: reload · 1/2/3 or wheel: weapon slots · Click/drag inventory: select, reorder, drop · F3: FPS/debug overlay.\n\nCapture an uncontested planet for 10 seconds to spawn its Galaxy Gun, then fly to it and press F. Common: gray; Rare: blue; Legendary: purple; Galaxy: gold/cosmic. Eliminated humans return as aliens and cannot win.\n\nFILL: private lobby with seven bots. PLAY defaults to a human-only lobby. START alone for solo play, or wait for guests to READY before host START. FILL remains optional. Friends can JOIN WITH CODE before START. The Horizon appears after one minute of play and consumes the galaxy by five minutes; flee its edge.');
    else show(button.title.toUpperCase(),'COMING SOON');
   };
 }
 const joinButton=document.createElement('button');joinButton.id='join-with-code';joinButton.textContent='JOIN WITH CODE';stage.append(joinButton);
 const openJoin=(prefill='')=>{
  show('JOIN WITH CODE','');const body=document.getElementById('menu-modal-body')!,form=document.createElement('form'),pilot=document.createElement('input'),code=document.createElement('input'),submit=document.createElement('button'),error=document.createElement('p');
  pilot.id='invite-name';pilot.setAttribute('aria-label','Confirm player name');pilot.placeholder='Player name (optional)';pilot.maxLength=16;pilot.value=name.value;
  code.id='invite-code';code.setAttribute('aria-label','Five-character room code');code.maxLength=5;code.placeholder='ABC23';code.value=prefill;code.autocomplete='off';submit.textContent='JOIN';submit.type='submit';error.id='code-join-error';error.setAttribute('role','status');form.append(pilot,code,submit,error);body.append(form);
  form.onsubmit=async e=>{e.preventDefault();if(submit.disabled)return;const normalized=normalizeRoomCode(code.value);if(!normalized){error.textContent='Enter a valid 5-character room code.';return;}name.value=pilot.value;save('horizon-name',name.value);code.value=normalized;submit.disabled=true;error.textContent='Connecting…';try{const message=await join(normalized);if(message)error.textContent=message;else close();}finally{submit.disabled=false;}};code.focus();
 };
 joinButton.onclick=()=>openJoin();const invite=roomFromSearch(location.search);if(invite)openJoin(invite);
 const update=()=>{for(const id of ['fill','wait']){const b=buttons.get(id)!;b.classList.toggle('selected',mode===id);b.setAttribute('aria-pressed',String(mode===id));}};update();
 if(new URLSearchParams(location.search).has('hotspots')){stage.classList.add('show-hotspots');for(const [id,b]of buttons)b.dataset.label=id;}
 image.onerror=()=>{stage.classList.add('art-missing');for(const [id,b]of buttons)b.textContent=b.title;const heading=document.createElement('h1');heading.textContent='PROJECT HORIZON';stage.prepend(heading);};
 window.addEventListener('keydown',e=>{if(home.hidden)return;if(e.code==='Escape'&&!overlay.hidden){e.preventDefault();close();}else if(e.code==='Enter'&&!e.repeat&&overlay.hidden&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)&&(!(e.target instanceof HTMLButtonElement)||e.target===buttons.get('play'))){e.preventDefault();buttons.get('play')!.click();}});
 const fit=()=>{const scale=Math.min(innerWidth/1672,innerHeight/941);stage.style.width=`${1672*scale}px`;stage.style.height=`${941*scale}px`;};window.addEventListener('resize',fit);fit();
 document.body.classList.add('cinematic-menu');
 if(import.meta.env.DEV&&new URLSearchParams(location.search).has('devrooms'))document.body.classList.add('dev-rooms');
}
