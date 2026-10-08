export type Biome='ice'|'volcanic'|'terrestrial'|'moon';
export const BIOMES:readonly Biome[]=['ice','volcanic','terrestrial','moon'];
export const atmosphere=(biome:Biome):readonly number[]=>biome==='ice'?[.12,.45,.68]:biome==='volcanic'?[.8,.16,.025]:biome==='terrestrial'?[.07,.30,.65]:[0,0,0];
export interface SurfaceMap { width:number;height:number;data:Uint8ClampedArray }
export function sampleSurface(map:SurfaceMap,u:number,v:number):readonly number[]{
 const x=Math.floor(((u%1+1)%1)*(map.width-1)),y=Math.min(map.height-1,Math.max(0,Math.floor(v*(map.height-1)))),i=(y*map.width+x)*4;
 return [map.data[i]/255,map.data[i+1]/255,map.data[i+2]/255,map.data[i+3]/255];
}
// CPU tier uses the same unlit maps, normals, key light and warm blend as WebGL.
// Low is intentionally static: no texture uploads or full sphere bakes each frame.
export function bakeMaterial(ctx:CanvasRenderingContext2D,size:number,biome:Biome,map:SurfaceMap,clouds:SurfaceMap,warm:readonly number[],intensity:number,detail:SurfaceMap=map){
 const image=ctx.createImageData(size,size),rim=atmosphere(biome);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(x/size*2-1)*1.075,ny=(y/size*2-1)*1.075,r=Math.hypot(nx,ny),o=(y*size+x)*4;if(r>1.075)continue;
  if(r>1){const a=biome==='moon'?0:(1-(r-1)/.075)**2*.16;for(let c=0;c<3;c++)image.data[o+c]=rim[c]*255;image.data[o+3]=a*255;continue;}
  const nz=Math.sqrt(1-r*r),u=.5+Math.atan2(nx,nz)/(2*Math.PI),v=.5+Math.asin(ny)/Math.PI,s=sampleSurface(map,u,v);
  const cool=Math.max(0,-nx*.65-ny*.42+nz*.63)*(1-.7*intensity),hot=Math.max(0,nx*warm[0]+ny*warm[1]+nz*warm[2])*intensity;
  const cloud=biome==='terrestrial'?sampleSurface(clouds,u,v)[3]*.8:0;
  let relief=1;if(biome==='moon'){const h=sampleSurface(detail,u+.002,v)[0]-sampleSurface(detail,u-.002,v)[0];relief=Math.max(.5,Math.min(1.3,1-h*4));}
  for(let c=0;c<3;c++){
   const light=.055+cool*.78+hot*[.85,.58,.30][c],surface=s[c]*(1-cloud)+.9*cloud;
   const emission=biome==='volcanic'?sampleSurface(detail,u,v)[0]*[.72,.20,.01][c]:0;
   image.data[o+c]=Math.min(.64,surface*light*relief+rim[c]*(1-nz)**4*.09+emission)*255;
  }image.data[o+3]=255;
 }ctx.putImageData(image,0,0);
}
export const MATERIAL_FRAGMENT=`
precision mediump float;
uniform vec2 resolution;uniform float time;uniform float intensity;uniform vec3 warmDirection;
uniform float biome;uniform sampler2D iChannel0;uniform sampler2D iChannel1;uniform sampler2D iChannel2;
varying vec2 fragCoord;
void main(){
 vec2 p=(fragCoord/resolution*2.-1.)*1.075;p.y=-p.y;float r=length(p);if(r>1.075){gl_FragColor=vec4(0.);return;}
 float z=sqrt(max(0.,1.-dot(p,p)));vec3 n=vec3(p,z);
 vec3 rim=biome<.5?vec3(.12,.45,.68):biome<1.5?vec3(.8,.16,.025):biome<2.5?vec3(.07,.30,.65):vec3(0.);
 if(r>1.){float a=biome>2.5?0.:pow(max(0.,1.-(r-1.)/.075),2.)*.16;gl_FragColor=vec4(rim*a,a);return;}
 vec2 uv=vec2(fract(.5+atan(n.x,max(.0001,n.z))/6.283185+time*.00065),.5+asin(clamp(n.y,-1.,1.))/3.141593);
 vec4 material=texture2D(iChannel0,uv);float cloud=0.;if(biome>1.5&&biome<2.5)cloud=texture2D(iChannel1,vec2(fract(uv.x+time*.00028),uv.y)).a*.8;
 vec3 surface=mix(material.rgb,vec3(.9),cloud);
 float relief=1.;if(biome>2.5){float slope=texture2D(iChannel2,uv+vec2(.002,0.)).r-texture2D(iChannel2,uv-vec2(.002,0.)).r;relief=clamp(1.-slope*4.,.5,1.3);}
 float cool=max(0.,dot(n,vec3(-.65,-.42,.63)))*(1.-.7*intensity),hot=max(0.,dot(n,warmDirection))*intensity;
 vec3 col=surface*(vec3(.055)+vec3(.78)*cool+vec3(.85,.58,.30)*hot)*relief+rim*pow(1.-z,4.)*.09;
 if(biome>.5&&biome<1.5)col+=texture2D(iChannel2,uv).r*vec3(.72,.20,.01);
 float a=1.-smoothstep(.997,1.,r);gl_FragColor=vec4(min(col,vec3(.64))*a,a);
}`;
