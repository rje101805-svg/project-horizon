"""Original unlit 2:1 spherical maps. Requires Python, numpy and Pillow only for regeneration.
Deterministic spherical coordinates make longitude seamless; runtime has no Python dependency.
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image
W,H=2048,1024
rng=np.random.default_rng(3202)
u=np.linspace(-np.pi,np.pi,W)[None,:];v=np.linspace(-np.pi/2,np.pi/2,H)[:,None]
x=np.cos(v)*np.sin(u);y=np.broadcast_to(np.sin(v),(H,W));z=np.cos(v)*np.cos(u)
def field(scale,seed,octaves=5):
 r=np.random.default_rng(seed);a=np.zeros((H,W));weight=0
 for k in range(octaves):
  for j in range(6):
   d=r.normal(size=3);d/=np.linalg.norm(d);f=scale*2**k
   a+=np.sin((x*d[0]+y*d[1]+z*d[2])*f+r.uniform(0,6.28))*2**(-k*.85)/6
  weight+=2**(-k*.85)
 return a/weight
fine=field(110,5,3);terrain=field(8,11)
def mix(a,b,t):return np.array(a)[None,None,:]*(1-t[:,:,None])+np.array(b)[None,None,:]*t[:,:,None]
def save(name,rgb,alpha):
 if name!='clouds':
  if name=='moon':
   # Tangent-space normals of radial relief, never prelit embossed albedo.
   du=(np.roll(alpha,-1,axis=1)-np.roll(alpha,1,axis=1))/(4*np.pi/(W-1))
   dv=np.gradient(alpha,np.pi/(H-1),axis=0)
   sx=.025*du/np.maximum(.12,np.cos(v));sy=.025*dv
   nz=1/np.sqrt(1+sx*sx+sy*sy)
   detail=np.dstack((-sx*nz,-sy*nz,nz))*.5+.5
   detail=(np.clip(detail,0,1)*255).astype('uint8')
  else:detail=np.repeat(np.clip(alpha*255,0,255)[:,:,None],3,axis=2).astype('uint8')
  detail[:,-1]=detail[:,0];im=Image.fromarray(detail)
  if name in ('ice','terrestrial'):im=im.resize((512,256),Image.Resampling.LANCZOS)
  arr=np.asarray(im).copy();arr[:,-1]=arr[:,0];Image.fromarray(arr).save(Path('public/planets')/(name+'-detail.png'))
  alpha=np.ones((H,W))
 data=np.dstack((np.clip(rgb,0,255),np.clip(alpha*255,0,255))).astype('uint8');data[:,-1]=data[:,0]
 im=Image.fromarray(data)
 if name=='clouds':im=im.resize((1024,512),Image.Resampling.LANCZOS)
 arr=np.asarray(im).copy();arr[:,-1]=arr[:,0];Image.fromarray(arr).save(Path('public/planets')/(name+'.png'))
# Glacier ridges and warped veins, independent of volcanic geology.
frost=np.clip((terrain+.10)*6,0,1)
frost=frost*frost*(3-2*frost)
# Blue glacier channels with sharp pale ridges; no dark high-frequency dirt speckles.
warp=field(24,25)
veins=np.exp(-np.abs(np.sin(x*40+z*27+warp*13))*45)
rgb=mix([33,110,158],[202,229,237],frost)
# Flow-aligned ice strata add detail within pale sheets without dirt-like point noise.
strata=.91+.055*np.sin(y*155+z*35+warp*8)+.035*np.sin(x*81+z*104+warp*15)
rgb*=strata[:,:,None]
fracture=veins*.24;rgb=rgb*(1-fracture[:,:,None])+np.array([87,161,189])[None,None,:]*fracture[:,:,None]
save('ice',rgb,np.clip(.5+terrain*.6+fine*.15,0,1))
if '--only-ice' in sys.argv:
 print('Regenerated sharper glacier albedo and metadata.');sys.exit(0)
# Spherical Voronoi plate margins with warped coordinates and variable crack widths.
wx=x+field(17,31,3)*.14;wy=y+field(17,32,3)*.14;wz=z+field(17,33,3)*.14
first=np.full((H,W),100.);second=first.copy()
for i in range(180):
 d=rng.normal(size=3);d/=np.linalg.norm(d)
 dist=(wx-d[0])**2+(wy-d[1])**2+(wz-d[2])**2
 second=np.minimum(second,np.maximum(first,dist));first=np.minimum(first,dist)
gap=second-first;width=.0008+np.clip(field(32,41)*.004+.0012,0,.0035)
emit=np.exp(-(gap/width)**4)*np.clip(.65+field(19,42)*1.2,.12,1)
rock=np.clip(.4+terrain+fine*.3,0,1);rgb=mix([8,9,13],[48,45,44],rock)
rgb=mix([0,0,0],[255,108,12],emit)+rgb*(1-emit[:,:,None]);save('volcanic',rgb,emit)
# Broad connected land, coastal shelf bands, mountain belts; clouds remain separate.
land=field(5,51,6)+.10*np.sin(y*6+z*2);coast=np.clip((land+.03)*42,0,1)
ocean=mix([5,22,56],[13,130,143],np.clip((land+.25)*4,0,1))
vegetation=mix([25,72,46],[97,124,65],np.clip(.5+field(23,52)*2,0,1))
mountain=np.clip((field(42,53)+.12)*4,0,1);vegetation=mix([0,0,0],[172,151,106],mountain*.45)+vegetation*(1-mountain[:,:,None]*.45)
rgb=ocean*(1-coast[:,:,None])+vegetation*coast[:,:,None];rgb+=fine[:,:,None]*12;save('terrestrial',rgb,np.clip(.5+land,0,1))
cloud=field(12,61,6)+.13*np.sin(y*17+field(20,62)*9);opacity=np.clip((cloud-.045)*7,0,.78)
save('clouds',np.full((H,W,3),235),opacity)
# Variable elliptical/eroded impacts, nested basins and irregular secondary craters.
height=field(18,71)*.06+fine*.025
for i in range(410):
 d=rng.normal(size=3);d/=np.linalg.norm(d);radius=rng.uniform(.009,.06) if i>18 else rng.uniform(.075,.19)
 tangent=np.cross(d,[0,1,0]);tangent/=np.linalg.norm(tangent);bitangent=np.cross(d,tangent)
 angle=np.arctan2(x*bitangent[0]+y*bitangent[1]+z*bitangent[2],x*tangent[0]+y*tangent[1]+z*tangent[2])
 phase=rng.uniform(0,6.28);ellipticity=rng.uniform(.02,.14)
 distance=np.sqrt(np.maximum(0,2-2*(x*d[0]+y*d[1]+z*d[2])))
 q=distance/(radius*(1+ellipticity*np.sin(angle*2+phase)+.045*np.sin(angle*5-phase)))
 rim_width=rng.uniform(.10,.20);depth=rng.uniform(.07,.14)
 height+=depth*.85*np.exp(-((q-1)/rim_width)**2)-depth*np.exp(-(q/.77)**6)
 if i<18:height+=.03*np.exp(-(q/.2)**2)+.015*np.exp(-((q-1.35)/.22)**2)
height=np.clip(.5+height,0,1)
# Albedo carries geology, while impacts are lit exclusively via the normal map.
rgb=mix([98,95,88],[179,173,160],np.clip(.48+terrain*.9+fine*.20,0,1));save('moon',rgb,height)
print('Generated original 2048×1024 albedo/lava/normal maps; 1024×512 clouds; 512×256 unused height metadata. Seed 3202.')
