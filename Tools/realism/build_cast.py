"""Build clothed CC0 MakeHuman people with MPFB 2 in Blender 4.3.
blender -b --factory-startup --python Tools/realism/build_cast.py -- --mpfb /path/mpfb2/src --assets /path/data --output /tmp/cast [--only seiko_office]
Source dependencies are external; no nude or helper geometry is exported.
"""
import argparse,json,sys
from pathlib import Path
import bpy
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--mpfb',required=True);p.add_argument('--assets',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--only');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.output.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,a.mpfb)
sys.path.insert(0,str(Path(__file__).resolve().parent))
bpy.utils.extension_path_user=lambda *args,**kw:str(a.output/'mpfb-user')
bpy.utils.resource_path=lambda *args,**kw:str(a.output/'blender-config')
import mpfb
bpy.context.preferences.addons.new().module='mpfb';mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.exportservice import ExportService
from mpfb.entities.objectproperties import HumanObjectProperties
root=Path(__file__).resolve().parents[2];index=json.loads((root/'Web/people/index.json').read_text())
rename={'Root':'Bip01','pelvis':'Bip01_Pelvis','spine_01':'Bip01_Spine','spine_03':'Bip01_Spine1','neck_01':'Bip01_Neck','head':'Bip01_Head'}
for side in ['l','r']:
 for src,dst in [('clavicle','Clavicle'),('upperarm','UpperArm'),('lowerarm','Forearm'),('hand','Hand'),('thigh','Thigh'),('calf','Calf'),('foot','Foot'),('ball','Toe0')]:rename[src+'_'+side]='Bip01_'+side.upper()+'_'+dst
entries=index['people']+[{'file':e['file'],'name':Path(e['file']).stem,'female':False,'business':True,'hero':True} for e in index['outfits']]
def asset(sub,name):
 matches=list((a.assets/sub).rglob(name));assert len(matches)==1,(sub,name,matches);return str(matches[0])
def build(e,i):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 female=e['female'];hero=e.get('hero',False);name=Path(e['file']).stem
 h=HumanService.create_human();h.name=name
 for key,val in {'gender':0. if female else 1.,'asian':.86,'african':0.,'caucasian':.14,'age':.47 if hero else [.44,.52,.62,.71,.48][i%5],'muscle':.45 if hero else [.32,.46,.58][i%3],'weight':.44 if hero else [.36,.48,.58][i%3]}.items():HumanObjectProperties.set_value(key,val,entity_reference=h)
 TargetService.reapply_macro_details(h)
 age='middleage' if not hero and i%5==3 else 'young';sex='female' if female else 'male'
 HumanService.set_character_skin(asset('skins',age+'_asian_'+sex+'.mhmat'),h,skin_type='MAKESKIN')
 rig=HumanService.add_builtin_rig(h,'game_engine')
 outfit=('female_elegantsuit01' if female else 'male_elegantsuit01') if e.get('business') else ('female_casualsuit01' if female else 'male_casualsuit'+['01','02','03','06'][i%4])
 if hero:
  outfit='male_worksuit01' if 'village' in name else 'male_elegantsuit01' if 'office' in name else 'male_casualsuit03' if 'blue_shirt' in name else 'male_casualsuit06' if any(s in name for s in ['tshirt','polo']) else 'male_casualsuit01' if 'track' in name else 'male_elegantsuit01'
 for sub,fn,typ in [('eyes','low-poly','Eyes'),('eyebrows','eyebrow001','Eyebrows'),('eyelashes','eyelashes01','Eyelashes'),('hair',('ponytail01' if i%2 else 'bob01') if female else 'short02' if hero else ['short01','short02','short04'][i%3],'Hair'),('clothes',outfit,'Clothes'),('clothes','shoes03' if e.get('business') else 'shoes01','Clothes')]:
  HumanService.add_mhclo_asset(asset(sub,fn+'.mhclo'),h,asset_type=typ,subdiv_levels=0,material_type='MAKESKIN')
 bpy.context.view_layer.objects.active=h
 bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
 ExportService.bake_modifiers_remove_helpers(h,bake_masks=True,bake_subdiv=False,remove_helpers=True,also_proxy=True)
 # Preserve all weights while adopting the names used by Salary Man's retargeter.
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH':
   for vg in obj.vertex_groups:
    if vg.name in rename:vg.name=rename[vg.name]
 for old,new in rename.items():
  if old in rig.data.bones:rig.data.bones[old].name=new
 bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 head=rig.data.edit_bones['Bip01_Head'];nose=rig.data.edit_bones.new('Bip01_MNose');nose.head=head.head+Vector((0,-.10,.06));nose.tail=nose.head+Vector((0,-.02,0));nose.parent=head
 bpy.ops.object.mode_set(mode='OBJECT')
 # Bound image memory without flattening the scanned skin and garment detail.
 for im in bpy.data.images:
  if im.source=='FILE' and im.size[0]>0:
   limit=2048 if 'skin' in im.filepath else 1024
   if max(im.size)>limit:
    k=limit/max(im.size);im.scale(max(1,int(im.size[0]*k)),max(1,int(im.size[1]*k)))
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH':
   for poly in obj.data.polygons:poly.use_smooth=True
   for mat in obj.data.materials:
    if not mat or not mat.use_nodes:continue
    for n in mat.node_tree.nodes:
     if n.type=='BSDF_PRINCIPLED':
      n.inputs['Roughness'].default_value=.60
      n.inputs['Metallic'].default_value=0
      if not any(t in obj.name for t in ['hair','eyebrow','eyelash','short','ponytail','bob']):
       for link in list(n.inputs['Alpha'].links):mat.node_tree.links.remove(link)
       n.inputs['Alpha'].default_value=1.
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH' and any(k in obj.name for k in ['.short','.bob','.ponytail']):
   for v in obj.data.vertices:v.co+=v.normal*.004
 rig['salaryRealistic']=True
 # glTF exporter exports Principled image inputs, alpha cards and skin weights.
 bpy.ops.export_scene.gltf(filepath=str(a.output/e['file']),export_format='GLB',export_animations=False,export_morph=False,export_image_format='JPEG',export_jpeg_quality=90,export_yup=True,export_extras=True)
 from finish_glb import finish
 finish(a.output/e['file'])
 print('CAST_OK',name,(a.output/e['file']).stat().st_size,flush=True)
for i,e in enumerate(entries):
 if a.only and Path(e['file']).stem!=a.only:continue
 build(e,i)
