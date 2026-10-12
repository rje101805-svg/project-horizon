export interface ObjectiveTarget {id:string;kind:'capture'|'gold';x:number;y:number;radius:number;label:string;distance:number;visible:boolean}
export function objectiveArrow(target:{x:number;y:number},view:{centerX:number;centerY:number},zoom:number,width:number,height:number,padding=36,out={x:0,y:0,angle:0}){
 const dx=(target.x-view.centerX)*zoom,dy=(target.y-view.centerY)*zoom;
 const scale=Math.min((width/2-padding)/Math.max(.001,Math.abs(dx)),(height/2-padding)/Math.max(.001,Math.abs(dy)));
 out.x=width/2+dx*scale;out.y=height/2+dy*scale;out.angle=Math.atan2(dy,dx);return out;
}
