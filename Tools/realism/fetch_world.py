"""Fetch CC0 Poly Haven architecture and room photographs; no runtime requests.
Run with Pillow: python Tools/realism/fetch_world.py --cache /tmp/salaryman-realism
"""
import argparse, concurrent.futures, hashlib, json, subprocess
from pathlib import Path
from PIL import Image, ImageOps
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);a=p.parse_args();a.cache.mkdir(parents=True,exist_ok=True)
out=Path(__file__).resolve().parents[2]/'Web/art/realism';out.mkdir(parents=True,exist_ok=True)
rooms=['phone_shop','witsand_woolshop','comfy_cafe','witsand_woolshop','decor_shop','phone_shop']
surfaces={'brick':'brick_wall_10','plaster':'painted_plaster_wall','concrete':'concrete_wall_006','metal':'metal_plate'}
def fetch(url,path):
 if not path.exists():
  path.parent.mkdir(parents=True,exist_ok=True)
  subprocess.run(["curl","-fLsS","--retry","3",url,"-o",str(path)],check=True)
 return path
def meta(asset):return json.loads(fetch('https://api.polyhaven.com/files/'+asset,a.cache/(asset+'.json')).read_text())
def room(asset):
 d=meta(asset)['tonemapped'];f=fetch(d['url'],a.cache/(asset+'.jpg'));im=Image.open(f).convert('RGB');im=ImageOps.fit(im,(2048,1024),method=Image.Resampling.LANCZOS);return asset,im,d['url']
unique={name:(name,im,url) for name,im,url in concurrent.futures.ThreadPoolExecutor(4).map(room,dict.fromkeys(rooms))};rows=[unique[name] for name in rooms];atlas=Image.new('RGB',(4096,3072));sources=[]
for i,(name,im,url) in enumerate(rows):
 atlas.paste(im,((i%2)*2048,(i//2)*1024));sources.append({'asset':name,'url':url,'kind':'interior','tile':i})
atlas.save(out/'interiors.jpg',quality=91,optimize=True);atlas.resize((2048,1536),Image.Resampling.LANCZOS).save(out/'interiors-low.jpg',quality=87,optimize=True)
def material(entry):
 name,asset=entry;d=meta(asset)
 for kind,key in [('color','Diffuse'),('normal','nor_gl'),('roughness','Rough')]:
  record=d[key]['2k']['jpg'];f=fetch(record['url'],a.cache/(asset+'-'+key+'.jpg'));im=Image.open(f).convert('RGB');im.save(out/(name+'-'+kind+'.jpg'),quality=90,optimize=True)
  im.resize((512,512),Image.Resampling.LANCZOS).save(out/(name+'-'+kind+'-low.jpg'),quality=88,optimize=True)
 return {'asset':asset,'kind':'surface','name':name,'url':'https://polyhaven.com/a/'+asset}
sources+=list(concurrent.futures.ThreadPoolExecutor(4).map(material,surfaces.items()))
manifest={'license':'CC0-1.0','licenseUrl':'https://polyhaven.com/license','sources':sources,'files':{f.name:{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in out.glob('*.jpg')}}
(out/'sources.json').write_text(json.dumps(manifest,indent=2)+'\n');(out/'LICENSE.txt').write_text('Photographs and PBR materials from Poly Haven, CC0 1.0 Universal.\nhttps://polyhaven.com/license\nSource IDs, URLs and local file hashes: sources.json.\nInterior photographs resized and packed in theme order, two columns by three rows.\n')
print('Built',len(sources),'licensed sources;',sum(f.stat().st_size for f in out.glob('*.jpg')),'bytes')
