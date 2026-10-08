// Five cached, non-interactive bodies. Screen anchors are presentation coordinates,
// not world entities; deliberately absent from the minimap and server protocol.
export const DISTANT_BODIES=[
 {kind:'gas',x:840,y:145,size:170,parallax:.055,alpha:.48},
 {kind:'rock',x:360,y:430,size:58,parallax:.085,alpha:.45},
 {kind:'ice',x:1430,y:620,size:92,parallax:.045,alpha:.42},
 {kind:'moon',x:1250,y:230,size:36,parallax:.12,alpha:.50},
 {kind:'ringed',x:300,y:115,size:180,parallax:.035,alpha:.42},
] as const;
export function distantSurface(kind:string,x:number,y:number,z:number):readonly number[]{
 const grain=Math.sin(x*61+Math.sin(y*37)*2)*Math.sin(y*79+z*47);
 if(kind==='gas'||kind==='ringed'){
  const bands=.5+.5*Math.sin(y*48+Math.sin(x*7+y*12)*.6);
  return [.28+bands*.09,.30+bands*.08,.34+bands*.07];
 }
 if(kind==='ice')return [.25+grain*.025,.35+grain*.035,.41+grain*.04];
 if(kind==='moon')return [.34+grain*.05,.33+grain*.05,.30+grain*.04];
 return [.31+grain*.06,.30+grain*.05,.29+grain*.05];
}
export function bakeDistant(ctx:CanvasRenderingContext2D,size:number,kind:string){
 const image=ctx.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(x/size*2-1)*1.08,ny=(y/size*2-1)*1.08,r2=nx*nx+ny*ny;if(r2>1)continue;
  const z=Math.sqrt(1-r2),surface=distantSurface(kind,nx,ny,z);
  // Same upper-left cool key as major bodies, with a dimmer far-away exposure.
  const light=.025+Math.max(0,-nx*.65-ny*.42+z*.63)*.65,o=(y*size+x)*4;
  for(let c=0;c<3;c++)image.data[o+c]=surface[c]*light*255;
  image.data[o+3]=Math.min(1,(1-r2)*size*.5)*255;
 }ctx.putImageData(image,0,0);
}
