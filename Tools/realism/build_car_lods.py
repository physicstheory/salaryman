"""Bake licensed car meshes to a bounded-detail tier; preserve original credits.
blender -b --factory-startup --python Tools/realism/build_car_lods.py
"""
from pathlib import Path
import bpy,json
root=Path(__file__).resolve().parents[2]/'Web/cars';out=root/'low';out.mkdir(exist_ok=True);report=[]
for f in sorted(root.glob('*.glb')):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.outliner.orphans_purge(do_recursive=True)
 bpy.ops.import_scene.gltf(filepath=str(f))
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];before=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes);ratio=min(1.,40000/max(1,before))
 for o in meshes:
  bpy.context.view_layer.objects.active=o
  if ratio<.99:
   mod=o.modifiers.new('Game detail budget','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 for im in bpy.data.images:
  if max(im.size)>1024:
   k=1024/max(im.size);im.scale(max(1,int(im.size[0]*k)),max(1,int(im.size[1]*k)))
 bpy.ops.export_scene.gltf(filepath=str(out/f.name),export_format='GLB',export_animations=False,export_morph=False,export_image_format='AUTO')
 after=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes);report.append({'file':f.name,'sourceTriangles':before,'triangles':after,'bytes':(out/f.name).stat().st_size});print('LOD_OK',f.name,before,after,flush=True)
(out/'index.json').write_text(json.dumps(report,indent=2)+'\n');(out/'CREDITS.md').write_text((root/'CREDITS.md').read_text()+'\nThese copies retain the original mesh materials and UVs, with a 40,000 triangle target and maximum 1024-pixel texture edge. Rebuilt by Tools/realism/build_car_lods.py.\n')

(out/'LICENSE.txt').write_text((root/'CREDITS.md').read_text())
