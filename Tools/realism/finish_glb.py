"""Finalize Blender glTF material settings for Three.js r128. Keep alpha cards depth-writing."""
import json,struct,sys
from pathlib import Path
def finish(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);binary=b[20+n:]
 for m in j.get('materials',[]):
  if any(k in m.get('name','') for k in ['.short','.long','.bob','.ponytail','.eyebrow','.eyelash']):m.update(alphaMode='MASK',alphaCutoff=.42,doubleSided=True)
  m.pop('extensions',None)
  if any(k in m.get('name','') for k in ['casualsuit','elegantsuit','worksuit']):
   palettes={'seiko_suit_black':[.45,.47,.50,1],'seiko_suit_charcoal':[.72,.76,.80,1],'seiko_suit_check':[.85,.72,.58,1],'seiko_waistcoat':[.57,.66,.75,1],'seiko_office':[.88,.90,.95,1],'seiko_village_denim':[.55,.70,.88,1]}
   factor=palettes.get(path.stem)
   if factor is None and not path.stem.startswith('seiko'):
    digit=int(path.stem.rsplit('_',1)[-1]);factor=[[.82,.88,.93,1],[.91,.78,.68,1],[.62,.72,.83,1]][digit%3]
   if factor:m.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=factor
 j['extensionsUsed']=[x for x in j.get('extensionsUsed',[]) if x!='KHR_materials_clearcoat']
 payload=json.dumps(j,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
 path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(payload)+len(binary))+struct.pack('<II',len(payload),0x4E4F534A)+payload+binary)
if __name__=='__main__':
 for arg in sys.argv[1:]:finish(Path(arg))
