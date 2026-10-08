"""Original unlit 2:1 spherical maps. Requires Python, numpy and Pillow only for regeneration.
Deterministic spherical coordinates make longitude seamless; runtime has no Python dependency.
"""
from pathlib import Path
import numpy as np
from PIL import Image
W,H=1024,512
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
  detail=np.repeat(np.clip(alpha*255,0,255)[:,:,None],3,axis=2).astype('uint8');detail[:,-1]=detail[:,0];Image.fromarray(detail).save(Path('public/planets')/(name+'-detail.png'))
  alpha=np.ones((H,W))
 data=np.dstack((np.clip(rgb,0,255),np.clip(alpha*255,0,255))).astype('uint8');data[:,-1]=data[:,0]
 Image.fromarray(data).save(Path('public/planets')/(name+'.png'))
# Glacier ridges and warped veins, independent of volcanic geology.
frost=np.clip(.52+terrain*2.3+fine*.25,0,1)
warp=field(24,25);veins=np.exp(-np.abs(np.sin(x*80+z*51+warp*22))*65)
rgb=mix([24,80,121],[225,243,248],frost);rgb*=1-veins[:,:,None]*.35
rgb+=fine[:,:,None]*35;save('ice',rgb,np.clip(.5+terrain*.6+fine*.15,0,1))
# Spherical Voronoi plate margins with warped coordinates and variable crack widths.
wx=x+field(17,31,3)*.14;wy=y+field(17,32,3)*.14;wz=z+field(17,33,3)*.14
first=np.full((H,W),100.);second=first.copy()
for i in range(180):
 d=rng.normal(size=3);d/=np.linalg.norm(d)
 dist=(wx-d[0])**2+(wy-d[1])**2+(wz-d[2])**2
 second=np.minimum(second,np.maximum(first,dist));first=np.minimum(first,dist)
gap=second-first;width=.0035+np.clip(field(32,41)*.018+.007,0,.018)
emit=np.exp(-(gap/width)**2)*np.clip(.65+field(19,42)*1.2,.12,1)
rock=np.clip(.5+terrain+fine*.6,0,1);rgb=mix([8,9,13],[72,62,53],rock)
rgb=mix([0,0,0],[255,108,12],emit)+rgb*(1-emit[:,:,None]);save('volcanic',rgb,emit)
# Broad connected land, coastal shelf bands, mountain belts; clouds remain separate.
land=field(5,51,6)+.10*np.sin(y*6+z*2);coast=np.clip((land+.03)*18,0,1)
ocean=mix([5,22,56],[13,130,143],np.clip((land+.25)*4,0,1))
vegetation=mix([25,72,46],[97,124,65],np.clip(.5+field(23,52)*2,0,1))
mountain=np.clip((field(42,53)+.12)*4,0,1);vegetation=mix([0,0,0],[172,151,106],mountain*.45)+vegetation*(1-mountain[:,:,None]*.45)
rgb=ocean*(1-coast[:,:,None])+vegetation*coast[:,:,None];rgb+=fine[:,:,None]*8;save('terrestrial',rgb,np.clip(.5+land,0,1))
cloud=field(12,61,6)+.13*np.sin(y*17+field(20,62)*9);opacity=np.clip((cloud-.025)*4,0,.85)
save('clouds',np.full((H,W,3),235),opacity)
# Hundreds of impacts on sphere, overlapping rims/ejecta/basins with relief.
height=field(18,71)*.10+fine*.08
for i in range(340):
 d=rng.normal(size=3);d/=np.linalg.norm(d);radius=rng.uniform(.018,.065) if i>16 else rng.uniform(.085,.18)
 distance=np.sqrt(np.maximum(0,2-2*(x*d[0]+y*d[1]+z*d[2])));q=distance/radius
 height+=.13*np.exp(-((q-1)/.12)**2)-.13*np.exp(-(q/.76)**6)+.045*np.exp(-(q/.18)**2)
height=np.clip(.5+height,0,1);rgb=mix([92,88,81],[190,182,164],np.clip(.5+terrain*.7+fine*.45+(height-.5)*1.1,0,1));save('moon',rgb,height)
print('Generated nine original 1024×512 unlit maps, seed 3202.')
