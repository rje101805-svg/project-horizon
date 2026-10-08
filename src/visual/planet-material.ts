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
const texel=(map:SurfaceMap,u:number,v:number)=>{
 const x=Math.floor(((u%1+1)%1)*(map.width-1)),y=Math.min(map.height-1,Math.max(0,Math.floor(v*(map.height-1))));return (y*map.width+x)*4;
};
// Convert a tangent-space relief normal into the visible sphere's frame. This
// basis turns with the sphere; both key and Horizon light use the resulting normal.
export function reliefNormal(nx:number,ny:number,nz:number,tangent:readonly number[]):readonly number[]{
 const h=Math.max(.0001,Math.hypot(nx,nz)),a=tangent[0],b=tangent[1],c=tangent[2];
 const x=a*nz/h-b*ny*nx/h+c*nx,y=b*h+c*ny,z=-a*nx/h-b*ny*nz/h+c*nz,length=Math.hypot(x,y,z)||1;
 return [x/length,y/length,z/length];
}
export function bakeMaterial(ctx:CanvasRenderingContext2D,size:number,biome:Biome,map:SurfaceMap,clouds:SurfaceMap,warm:readonly number[],intensity:number,detail:SurfaceMap=map){
 const image=ctx.createImageData(size,size),rim=atmosphere(biome),data=image.data;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(x/size*2-1)*1.075,ny=(y/size*2-1)*1.075,r2=nx*nx+ny*ny,o=(y*size+x)*4;if(r2>1.075**2)continue;
  if(r2>1){const a=biome==='moon'?0:(1-(Math.sqrt(r2)-1)/.075)**2*(biome==='ice'?.07:.16);for(let c=0;c<3;c++)data[o+c]=rim[c]*255;data[o+3]=a*255;continue;}
  const nz=Math.sqrt(1-r2),u=.5+Math.atan2(nx,nz)/(2*Math.PI),v=.5+Math.asin(ny)/Math.PI,i=texel(map,u,v),di=texel(detail,u,v);
  let lx=nx,ly=ny,lz=nz;
  if(biome==='moon'){const n=reliefNormal(nx,ny,nz,[detail.data[di]/255*2-1,detail.data[di+1]/255*2-1,detail.data[di+2]/255*2-1]);lx=n[0];ly=n[1];lz=n[2];}
  const cool=Math.max(0,-lx*.65-ly*.42+lz*.63)*(1-.7*intensity),hot=Math.max(0,lx*warm[0]+ly*warm[1]+lz*warm[2])*intensity;
  const cloud=biome==='terrestrial'?clouds.data[texel(clouds,u,v)+3]/255*.8:0,emission=biome==='volcanic'?detail.data[di]/255:0;
  for(let c=0;c<3;c++){
   const light=.055+cool*.78+hot*[.85,.58,.30][c],surface=map.data[i+c]/255*(1-cloud)+.9*cloud;
   // Smooth exposure compression keeps ice/cloud detail instead of hard clipping.
   const linear=surface*light+rim[c]*(1-nz)**4*(biome==='ice'?.035:.09)+emission*[.72,.20,.01][c];
   data[o+c]=linear/(1+linear*.65)*255;
  }data[o+3]=255;
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
 if(r>1.){float a=biome>2.5?0.:pow(max(0.,1.-(r-1.)/.075),2.)*(biome<.5?.07:.16);gl_FragColor=vec4(rim*a,a);return;}
 vec2 uv=vec2(fract(.5+atan(n.x,max(.0001,n.z))/6.283185+time*.00065),.5+asin(clamp(n.y,-1.,1.))/3.141593);
 vec4 material=texture2D(iChannel0,uv);float cloud=0.;if(biome>1.5&&biome<2.5)cloud=texture2D(iChannel1,vec2(fract(uv.x+time*.00028),uv.y)).a*.8;
 vec3 surface=mix(material.rgb,vec3(.9),cloud);
 vec3 lightingNormal=n;
 if(biome>2.5){
  vec3 tangent=texture2D(iChannel2,uv).rgb*2.-1.;float h=max(.0001,length(n.xz));
  vec3 east=vec3(n.z/h,0.,-n.x/h),north=vec3(-n.y*n.x/h,h,-n.y*n.z/h);
  lightingNormal=normalize(east*tangent.x+north*tangent.y+n*tangent.z);
 }
 float cool=max(0.,dot(lightingNormal,vec3(-.65,-.42,.63)))*(1.-.7*intensity),hot=max(0.,dot(lightingNormal,warmDirection))*intensity;
 vec3 col=surface*(vec3(.055)+vec3(.78)*cool+vec3(.85,.58,.30)*hot)+rim*pow(1.-z,4.)*(biome<.5?.035:.09);
 if(biome>.5&&biome<1.5)col+=texture2D(iChannel2,uv).r*vec3(.72,.20,.01);
 float a=1.-smoothstep(.997,1.,r);gl_FragColor=vec4((col/(vec3(1.)+col*.65))*a,a);
}`;
