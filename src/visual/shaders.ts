export const PLANET_FRAGMENT=`
precision mediump float;
uniform vec2 resolution;
uniform float time;
uniform float intensity;
uniform vec3 warmDirection;
varying vec2 fragCoord;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float terrain(vec2 uv){return .52*noise(uv)+.29*noise(uv*2.13)+.19*noise(uv*5.7);}
void main(){
 vec2 p=(fragCoord/resolution*2.0-1.0)*1.075;p.y=-p.y;float r=length(p);
 if(r>1.075){gl_FragColor=vec4(0.);return;}
 float z=sqrt(max(0.,1.-dot(p,p)));vec3 n=normalize(vec3(p,z));
 vec2 uv=vec2(atan(n.x,max(.001,n.z))*2.5+time*.016,asin(clamp(n.y,-1.,1.))*3.2);
 float t=terrain(uv*3.8),fracture=abs(sin(uv.x*16.+uv.y*7.+t*15.));
 float ice=mix(.70,1.14,smoothstep(.30,.76,t));ice*=mix(.67,1.,smoothstep(.0,.055,fracture));
 ice+=.04*sin(uv.y*100.+t*24.);
 float cool=max(0.,dot(n,normalize(vec3(-.65,-.42,.63))))*(1.-.7*intensity);
 float warm=max(0.,dot(n,warmDirection))*intensity;
 vec3 col=(vec3(.024,.035,.05)+vec3(.29,.38,.44)*cool+vec3(.44,.30,.16)*warm)*ice;
 float rim=pow(1.-z,3.)*(.06+cool*.12+warm*.13);
 col+=mix(vec3(.06,.17,.25),vec3(.30,.18,.07),intensity)*rim;
 if(r>1.){float a=pow(max(0.,1.-(r-1.)/.075),2.)*.16;gl_FragColor=vec4(mix(vec3(.13,.25,.34),vec3(.40,.23,.08),intensity),a);}
 else{gl_FragColor=vec4(min(col,vec3(.55)),1.-smoothstep(.997,1.,r));}
}`;
