"""Deterministic runtime derivatives. Requires Pillow; never writes originals."""
from pathlib import Path
from PIL import Image
import hashlib,json
root=Path(__file__).resolve().parents[1]/'public/assets/weapons'
mapping={'regular':{'blaster':'Futuristic Blue-Glow Sci-Fi Rifle.png','nova-shotgun':'Futuristic Orange-Glow Heavy Shotgun.png','missile-launcher':'Futuristic Red-Armored Rocket Launcher.png','ion-smg':'Neon Green Futuristic SMG Render.png','zapper':'Futuristic Blue-Energy Zapper Rifle.png'},'galaxy':{'cryo-stream':'Frostbound Cryo Energy Cannon.png','inferno-cannon':'Inferno Cinder Plasma Cannon.png','lunar-seeker':'Futuristic Quad-Missile Launcher Render.png','titan-minigun':'Futuristic Blue-Energy Minigun.png'}}
records=[]
for family,entries in mapping.items():
 for slug,name in entries.items():
  source=root/family/name
  im=Image.open(source).convert('RGBA');im.load()
  # Originals already contain genuine alpha. Crop transparent margins only;
  # never remove dark silhouette pixels with a color key.
  box=im.getchannel('A').getbbox();runtime=im.crop(box);runtime.thumbnail((480,240),Image.Resampling.LANCZOS)
  target=root/'processed'/family/(slug+'.png');target.parent.mkdir(parents=True,exist_ok=True);runtime.save(target,optimize=True)
  records.append({'original':str(source.relative_to(root)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'originalDimensions':im.size,'processed':str(target.relative_to(root)),'dimensions':runtime.size,'bytes':target.stat().st_size,'alphaRange':runtime.getchannel('A').getextrema()})
(root/'processed/manifest.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(records,indent=2))
