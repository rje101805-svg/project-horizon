import type {FlightConnection} from './network';
export class AIIntelView {
 private panel=document.createElement('aside');private feed=document.createElement('div');private open=false;private signature='';
 private key=(event:KeyboardEvent)=>{const t=event.target as HTMLElement;if(this.connection.room?.match.mode==='practice'||event.code!=='F4'||t?.tagName==='INPUT'&&!['checkbox','radio','button'].includes((t as HTMLInputElement).type)||t?.tagName==='TEXTAREA'||t?.tagName==='SELECT'||t?.isContentEditable)return;event.preventDefault();if(event.repeat)return;this.open=!this.open;this.panel.hidden=!this.open;this.draw();};
 private refresh=()=>{if(!this.connection.intel?.allowed)document.getElementById('debug-bots')?.replaceChildren();this.draw();};
 constructor(private connection:FlightConnection){this.panel.id='ai-intel';this.panel.hidden=true;this.panel.setAttribute('aria-label','AI Intel');this.feed.id='pilot-radio';this.feed.setAttribute('aria-label','Pilot radio');document.getElementById('mission')!.append(this.panel,this.feed);window.addEventListener('keydown',this.key);window.addEventListener('horizon-ai-intel',this.refresh);}
 draw(){
  const c=this.connection,packet=c.intel,radio=c.radio,now=c.latest?.timeMs??0;
  const signature=JSON.stringify([packet,radio,Math.floor(now/1000),this.open]);if(signature===this.signature)return;this.signature=signature;
  this.feed.replaceChildren();for(const message of radio?.messages??[]){if(now-message.timeMs>15000)continue;const row=document.createElement('div'),name=document.createElement('strong');name.style.color=`#${message.color.toString(16).padStart(6,'0')}`;name.textContent=`[${message.name}] `;row.append(name,document.createTextNode(`${message.text} · ${message.source}`));this.feed.append(row);}
  // Rebuild on revocation, even while closed: no retained privileged DOM rows.
  this.panel.replaceChildren();const title=document.createElement('strong');title.textContent='F4 · AI INTEL';this.panel.append(title);
  if(!packet||!packet.allowed){const text=document.createElement('p');text.textContent=packet?'INTEL DISABLED IN MULTIPLAYER':'AWAITING SERVER INTEL';this.panel.append(text);return;}
  const table=document.createElement('table'),head=document.createElement('tr');for(const text of ['PILOT','PERSONALITY','INTENT → TARGET','SOURCE','LEFT']){const th=document.createElement('th');th.textContent=text;head.append(th);}table.append(head);
  for(const pilot of packet.rows){const row=document.createElement('tr');row.dataset.pilot=pilot.id;for(const [i,text]of [pilot.name,pilot.personality,`${pilot.intent} → ${pilot.target}`,pilot.source,`${Math.ceil(pilot.remainingMs/1000)}s`].entries()){const td=document.createElement('td');td.textContent=text;if(i===0)td.style.color=`#${pilot.color.toString(16).padStart(6,'0')}`;row.append(td);}table.append(row);}this.panel.append(table);
  const footer=document.createElement('p');footer.id='ai-intel-metrics';footer.textContent=`AI ${packet.enabled?'ENABLED':'DISABLED'} · ${packet.status} · ${packet.calls}/${packet.limit} CALLS · AVG ${packet.averageLatencyMs}ms · HOUR ${packet.hourlyCalls}/${packet.hourlyLimit}`;this.panel.append(footer);
 }
 destroy(){window.removeEventListener('keydown',this.key);window.removeEventListener('horizon-ai-intel',this.refresh);this.panel.remove();this.feed.remove();}
}
