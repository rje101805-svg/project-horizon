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
 if(r>1.){float a=pow(max(0.,1.-(r-1.)/.075),2.)*.16;gl_FragColor=vec4(mix(vec3(.13,.25,.34),vec3(.40,.23,.08),intensity)*a,a);}
 else{float a=1.-smoothstep(.997,1.,r);gl_FragColor=vec4(min(col,vec3(.55))*a,a);}
}`;

// Samples the exact cached sky textures with their original parallax coordinates.
// Only background rays bend. No framebuffer copy or distortion of gameplay entities.
export const LENS_FRAGMENT=`
precision mediump float;
uniform vec2 resolution;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform vec2 regionOrigin;
uniform vec2 hole;
uniform vec2 scroll;
uniform vec2 viewport;
uniform float zoom;
uniform float radius;
uniform float intensity;
uniform float parallax;
varying vec2 fragCoord;
void main(){
 vec2 world=regionOrigin+vec2(fragCoord.x,resolution.y-fragCoord.y);
 vec2 delta=world-hole;float r=length(delta)/radius;
 float envelope=1.-smoothstep(2.1,3.6,r);
 float bend=(.22+.48*intensity)*envelope/(r*r+.32);
 vec2 source=world+delta*bend;
 vec2 screen=(source-scroll)*zoom+viewport*.5*(1.-zoom);
 vec2 v=fract(screen/1024.);
 vec3 base=texture2D(iChannel0,v).rgb;
 vec2 haze=fract((screen+scroll*.10*parallax)/2048.);
 vec4 h=texture2D(iChannel2,haze);base=base*(1.-h.a)+h.rgb;
 vec2 stars=fract((screen+scroll*.035*parallax)/2048.);
 vec4 s=texture2D(iChannel1,stars);base=base*(1.-s.a)+s.rgb;
 float arcDistance=(r-1.30)/.07;float arc=exp(-arcDistance*arcDistance)*(.008+.018*intensity);
 base+=vec3(.35,.23,.10)*arc;
 gl_FragColor=vec4(base*envelope,envelope);
}`;
export const DISK_FRAGMENT=`
precision mediump float;
uniform vec2 resolution;
uniform sampler2D iChannel0;
uniform float time;
uniform float intensity;
varying vec2 fragCoord;
void main(){
 vec2 screen=fragCoord/resolution*2.-1.,p=screen;p.y*=3.62;
 float a=time*.026;mat2 rot=mat2(cos(a),-sin(a),sin(a),cos(a));
 vec2 uv=(rot*p)*.5+.5;vec4 c=vec4(0.);
 if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.))))c=texture2D(iChannel0,uv);
 float asym=.62+.38*(.5+.5*screen.x);
 // Far-side material is hidden by the center, then reappears above it as a lensed arc.
 if(screen.y>0.&&length(screen)<.4)c=vec4(0.);
 float arcDistance=(length(screen)-.445)/.018;float arc=exp(-arcDistance*arcDistance)*smoothstep(-.05,.13,screen.y);
 float filaments=.55+.25*sin(atan(screen.y,screen.x)*65.+time*.7)+.20*sin(atan(screen.y,screen.x)*111.-time*.4);
 vec3 heat=mix(vec3(.58,.26,.06),vec3(1.,.92,.72),.5+.5*screen.x);
 float alpha=arc*filaments*.85;
 gl_FragColor=c*asym*(.95+.05*intensity)+vec4(heat*alpha,alpha);

}`;
