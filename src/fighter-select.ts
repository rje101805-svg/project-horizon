import {FIGHTER_IDS,isFighter,type FighterId} from '../shared/fighters';
const KEY='horizon-fighter';let sessionChoice:FighterId|undefined;
export function savedFighter():FighterId{if(sessionChoice)return sessionChoice;try{const value=localStorage.getItem(KEY);return isFighter(value)?value:'redline';}catch{return 'redline';}}
// Calibrated against the original 1024x1536 images; the stage itself is the
// contained image rectangle, so percentages exclude letter/pillarboxing.
export const FIGHTER_HOTSPOTS={thumbs:{left:6.5,step:10.9,width:10.6,top:71.8,height:11.2},previous:[1.5,75.5,4.3,5],next:[94.2,75.5,4.3,5],confirm:[29,85,42,5.6],overrides:{nova:{top:73.7,confirmTop:87.1},shadow:{top:73.7,confirmTop:87.1},vulcan:{top:73.7,confirmTop:87.1},zenith:{top:73.7,confirmTop:87.1}}} as const;
export function installFighterSelect(home:HTMLElement,onSave:(id:FighterId)=>void){
 const overlay=document.createElement('section');overlay.id='fighter-select';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Select fighter');
 const stage=document.createElement('div');stage.id='fighter-card';const image=document.createElement('img');image.draggable=false;const status=document.createElement('p');status.id='fighter-art-status';status.hidden=true;status.setAttribute('role','status');stage.append(image,status);overlay.append(stage);home.append(overlay);
 // Retained Image objects preload original artwork; browser cache handles reuse.
 const preloads=FIGHTER_IDS.map(id=>{const im=new Image();im.src=`${import.meta.env.BASE_URL}assets/pilots/${id}.png`;return im;});
 let viewed:FighterId=savedFighter(),previousFocus:HTMLElement|null=null;
 const buttons:HTMLButtonElement[]=[];
 const button=(id:string,label:string,act:()=>void)=>{const b=document.createElement('button');b.className='fighter-hotspot';b.dataset.fighterHotspot=id;b.setAttribute('aria-label',label);b.title=label;b.onclick=act;stage.append(b);buttons.push(b);return b;};
 const rect=(b:HTMLElement,[x,y,w,h]:readonly number[])=>Object.assign(b.style,{left:`${x}%`,top:`${y}%`,width:`${w}%`,height:`${h}%`});
 const render=()=>{image.src=preloads[FIGHTER_IDS.indexOf(viewed)].src;image.alt=`${viewed.toUpperCase()} fighter selection artwork`;stage.dataset.fighter=viewed;const override=FIGHTER_HOTSPOTS.overrides[viewed as keyof typeof FIGHTER_HOTSPOTS.overrides],t=FIGHTER_HOTSPOTS.thumbs;for(let i=0;i<8;i++){rect(buttons[i],[t.left+t.step*i,override?.top??t.top,t.width,t.height]);buttons[i].setAttribute('aria-pressed',String(FIGHTER_IDS[i]===viewed));}rect(buttons[8],[1.5,(override?.top??t.top)+3.7,4.3,5]);rect(buttons[9],[94.2,(override?.top??t.top)+3.7,4.3,5]);rect(buttons[10],[29,override?.confirmTop??85,42,5.6]);status.hidden=true;};
 const close=()=>{overlay.hidden=true;previousFocus?.focus();};
 const confirm=()=>{sessionChoice=viewed;try{localStorage.setItem(KEY,viewed);}catch{/* Session selection still works without storage. */}onSave(viewed);close();};
 const cycle=(delta:number)=>{viewed=FIGHTER_IDS[(FIGHTER_IDS.indexOf(viewed)+delta+8)%8];render();};
 for(const id of FIGHTER_IDS)button(id,id.toUpperCase(),()=>{viewed=id;render();});button('previous','Previous pilot',()=>cycle(-1));button('next','Next pilot',()=>cycle(1));button('confirm','SELECT PILOT',confirm);
 image.onerror=()=>{status.textContent=`${viewed.toUpperCase()} · Artwork unavailable. Use Left/Right and Enter to select, Escape to cancel.`;status.hidden=false;stage.classList.add('fighter-art-missing');};image.onload=()=>stage.classList.remove('fighter-art-missing');
 if(new URLSearchParams(location.search).get('hotspots')==='1')stage.classList.add('show-fighter-hotspots');
 overlay.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Enter','Escape'].includes(e.code)){e.preventDefault();e.stopPropagation();if(e.repeat)return;if(e.code==='Escape')close();else if(e.code==='Enter')confirm();else cycle(e.code==='ArrowLeft'?-1:1);}else if(e.code==='Tab'){const i=buttons.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}});
 return ()=>{previousFocus=document.activeElement as HTMLElement;viewed=savedFighter();render();overlay.hidden=false;buttons[FIGHTER_IDS.indexOf(viewed)].focus();};
}
