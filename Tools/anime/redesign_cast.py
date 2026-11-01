#!/usr/bin/env python3
"""Rebuild the anime cast from the CC0 source GLBs retained in Git history.

The source commit is recorded in cast-design.json. No changes accumulate when
rerun: original mesh/texture data is loaded from that commit every time.
Requires NumPy and Pillow. Retains Biped names, weights and inverse bind matrices.
"""
import copy
import io
import json
from pathlib import Path
import struct
import subprocess
import numpy as np
from PIL import Image
from optimize_people import batch_primitives

ROOT = Path(__file__).resolve().parents[2]
CONFIG = Path(__file__).with_name('cast-design.json')
DT = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class Model:
    def __init__(self, raw):
        n = struct.unpack_from('<I', raw, 12)[0]
        self.j = json.loads(raw[20:20+n])
        self.data = bytearray(raw[28+n:])

    def read(self, i):
        a = self.j['accessors'][i]; v = self.j['bufferViews'][a['bufferView']]
        dtype = np.dtype(DT[a['componentType']]).newbyteorder('<'); width = WIDTH[a['type']]
        return np.ndarray((a['count'], width), dtype=dtype, buffer=self.data,
                          offset=v.get('byteOffset', 0)+a.get('byteOffset', 0),
                          strides=(v.get('byteStride', dtype.itemsize*width), dtype.itemsize)).copy()

    def blob(self, value, target=None):
        self.data += b'\0' * (-len(self.data) % 4)
        view = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': len(value)}
        if target: view['target'] = target
        self.j['bufferViews'].append(view); self.data.extend(value)
        return len(self.j['bufferViews'])-1

    def replace(self, i, values):
        a = self.j['accessors'][i]
        a['bufferView'] = self.blob(values.astype(DT[a['componentType']]).tobytes(), 34962)
        a.pop('byteOffset', None)
        if 'min' in a: a['min'] = values.min(axis=0).tolist(); a['max'] = values.max(axis=0).tolist()

    def accessor(self, values, kind, component=5126):
        values = np.asarray(values, dtype=DT[component])
        accessor={'bufferView': self.blob(values.tobytes(), 34963 if kind == 'SCALAR' else 34962),
            'componentType': component, 'count': len(values), 'type': kind}
        if kind == 'VEC3': accessor.update(min=values.min(axis=0).tolist(),max=values.max(axis=0).tolist())
        self.j['accessors'].append(accessor)
        return len(self.j['accessors'])-1

    def image(self, i, transform):
        im = self.j['images'][i]; v = self.j['bufferViews'][im['bufferView']]
        image = Image.open(io.BytesIO(self.data[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGBA')
        pixels = np.asarray(image).copy(); transform(pixels)
        image = Image.fromarray(pixels)
        out = io.BytesIO()
        if image.getchannel('A').getextrema()[0] == 255:
            image.convert('RGB').save(out, 'JPEG', quality=91, optimize=True); im['mimeType']='image/jpeg'
        else:
            image.save(out, 'PNG', optimize=True); im['mimeType']='image/png'
        im['bufferView'] = self.blob(out.getvalue())

    def compact(self):
        # Remove superseded images and indices rather than shipping edit history.
        used = set()
        for m in self.j['meshes']:
            for p in m['primitives']:
                used.update(p['attributes'].values())
                if 'indices' in p: used.add(p['indices'])
                for t in p.get('targets', []): used.update(t.values())
        for s in self.j.get('skins', []):
            if 'inverseBindMatrices' in s: used.add(s['inverseBindMatrices'])
        for a in self.j.get('animations', []):
            for s in a['samplers']: used.update([s['input'],s['output']])
        remap = {old: new for new, old in enumerate(sorted(used))}
        self.j['accessors'] = [self.j['accessors'][old] for old in sorted(used)]
        for m in self.j['meshes']:
            for p in m['primitives']:
                p['attributes'] = {k: remap[v] for k,v in p['attributes'].items()}
                if 'indices' in p: p['indices'] = remap[p['indices']]
                for t in p.get('targets', []):
                    for k in t: t[k] = remap[t[k]]
        for s in self.j.get('skins', []):
            if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = remap[s['inverseBindMatrices']]
        for a in self.j.get('animations', []):
            for s in a['samplers']: s['input']=remap[s['input']]; s['output']=remap[s['output']]
        views = {a['bufferView'] for a in self.j['accessors']} | {i['bufferView'] for i in self.j.get('images',[])}
        remap = {}; binary = bytearray(); packed = []
        for old in sorted(views):
            v=copy.deepcopy(self.j['bufferViews'][old]); off=v.get('byteOffset',0)
            binary += b'\0' * (-len(binary)%4); v['byteOffset']=len(binary)
            binary.extend(self.data[off:off+v['byteLength']]); remap[old]=len(packed); packed.append(v)
        for a in self.j['accessors']: a['bufferView']=remap[a['bufferView']]
        for im in self.j.get('images',[]): im['bufferView']=remap[im['bufferView']]
        self.j['bufferViews']=packed; self.data=binary

    def save(self, path):
        self.j, binary, _, _ = batch_primitives(self.j, self.data); self.data=bytearray(binary)
        self.compact(); self.data += b'\0' * (-len(self.data)%4)
        self.j['buffers'][0]['byteLength']=len(self.data)
        meta=json.dumps(self.j,separators=(',',':')).encode(); meta += b' ' * (-len(meta)%4)
        path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(meta)+len(self.data))
                         +struct.pack('<II',len(meta),0x4e4f534a)+meta+struct.pack('<II',len(self.data),0x004e4942)+self.data)


def tint(pixels, color, kind):
    rgb=pixels[:,:,:3].astype(float); lum=np.mean(rgb,axis=2)/255
    target=np.array(color)
    if kind == 'cloth':
        # Preserve the shirt/garment separation and the authored seams.
        dark=lum<0.60
        tinted=target[None,None,:]*(0.55+lum[:,:,None]*0.80)
        light=np.array([238,232,216])[None,None,:]*(0.65+lum[:,:,None]*0.35)
        rgb=np.where(dark[:,:,None],tinted,light)
    else:
        rgb=target[None,None,:]*(0.45+lum[:,:,None]*0.80)
    pixels[:,:,:3]=np.clip(rgb,0,255).astype(np.uint8)


def reshape(model, profile):
    done=set()
    for mesh in model.j['meshes']:
        if not mesh.get('name','').lower().startswith(('face','hair')): continue
        for p in mesh['primitives']:
            idx=p['attributes']['POSITION']
            if idx in done: continue
            done.add(idx); points=model.read(idx); lo=points.min(axis=0); hi=points.max(axis=0); centre=(lo+hi)/2
            sx=profile.get('faceWidth',1) if mesh['name'].lower().startswith('face') else profile.get('hairWidth',1)
            sz=profile.get('faceDepth',1)
            points[:,0]=centre[0]+(points[:,0]-centre[0])*sx
            points[:,2]=centre[2]+(points[:,2]-centre[2])*sz
            model.replace(idx,points)
            if 'NORMAL' in p['attributes']:
                ni=p['attributes']['NORMAL']; normals=model.read(ni); normals[:,0]/=sx; normals[:,2]/=sz
                normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-8); model.replace(ni,normals)


def accessories(model, profile):
    face=next((m for m in model.j['meshes'] if m.get('name','').lower().startswith('face')),None)
    if not face or not profile.get('glasses'): return
    mesh_i=model.j['meshes'].index(face)
    node=next(n for n in model.j['nodes'] if n.get('mesh')==mesh_i)
    skin=model.j['skins'][node['skin']]
    head=next(i for i,n in enumerate(skin['joints']) if model.j['nodes'][n].get('name')=='Bip01_Head')
    # Locate the actual skinned eyes. The head graft can use a different bind
    # pose from the body's skeleton; raw mesh bounds would put glasses on hair.
    parents = {c:i for i,n in enumerate(model.j['nodes']) for c in n.get('children',[])}
    cache = {}
    def world(i):
        if i in cache: return cache[i]
        n=model.j['nodes'][i]
        if 'matrix' in n: local=np.array(n['matrix']).reshape(4,4).T
        else:
            x,y,z,w=n.get('rotation',[0,0,0,1])
            rotation=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],
                [2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],
                [2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])
            local=np.eye(4);local[:3,:3]=rotation@np.diag(n.get('scale',[1,1,1]));local[:3,3]=n.get('translation',[0,0,0])
        cache[i]=(world(parents[i])@local) if i in parents else local
        return cache[i]
    inverse_bind=model.read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
    matrices=np.array([world(j)@inverse_bind[i] for i,j in enumerate(skin['joints'])])
    eye=next(p for p in face['primitives'] if 'eyeiris' in model.j['materials'][p['material']].get('name','').lower())
    attr=eye['attributes']; selected=np.unique(model.read(eye['indices']).ravel())
    points=model.read(attr['POSITION'])[selected]; joints=model.read(attr['JOINTS_0'])[selected].astype(int);weights=model.read(attr['WEIGHTS_0'])[selected]
    homogeneous=np.column_stack([points,np.ones(len(points))])
    skinned=np.einsum('nvij,nj,nv->ni',matrices[joints],homogeneous,weights)[:,:3]
    lo=skinned.min(axis=0);hi=skinned.max(axis=0);mid=(lo+hi)/2
    cy=mid[1];z=lo[2]-.014;rx=(hi[0]-lo[0])*.245;ry=max((hi[1]-lo[1])*.67,.017)
    head_matrix=matrices[head]
    vertices=[]; normals=[]; indices=[]
    def box(cx,cy,cz,dx,dy,dz):
        start=len(vertices)
        faces=[((1,0,0),[(1,-1,-1),(1,1,-1),(1,1,1),(1,-1,1)]),((-1,0,0),[(-1,-1,1),(-1,1,1),(-1,1,-1),(-1,-1,-1)]),
            ((0,1,0),[(-1,1,-1),(-1,1,1),(1,1,1),(1,1,-1)]),((0,-1,0),[(-1,-1,1),(-1,-1,-1),(1,-1,-1),(1,-1,1)]),
            ((0,0,1),[(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]),((0,0,-1),[(1,-1,-1),(-1,-1,-1),(-1,1,-1),(1,1,-1)])]
        for normal,corners in faces:
            at=len(vertices)
            for x,y,z in corners: vertices.append([cx+x*dx/2,cy+y*dy/2,cz+z*dz/2]);normals.append(normal)
            indices.extend([at,at+1,at+2,at,at+2,at+3])
    for side in [-1,1]:
        x=side*rx*1.15
        for dy in [-ry,ry]: box(x,cy+dy,z,rx*1.9,.004,.006)
        for dx in [-rx*.95,rx*.95]: box(x+dx,cy,z,.004,ry*2,.006)
        box(side*rx*2.1,cy,z+.042,.004,.004,.086)
    box(0,cy+.002,z,.025,.004,.006)
    material=len(model.j['materials']);model.j['materials'].append({'name':'SalaryMan tailored wire frames','pbrMetallicRoughness':{'baseColorFactor':[.0085,.0134,.0153,1],'metallicFactor':.2,'roughnessFactor':.5}})
    vertices=(np.linalg.inv(head_matrix)@np.column_stack([vertices,np.ones(len(vertices))]).T).T[:,:3]
    normals=(head_matrix[:3,:3].T@np.array(normals).T).T
    normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-8)
    count=len(vertices)
    face['primitives'].append({'attributes':{'POSITION':model.accessor(vertices,'VEC3'),'NORMAL':model.accessor(normals,'VEC3'),
        'JOINTS_0':model.accessor([[head,0,0,0]]*count,'VEC4',5123),'WEIGHTS_0':model.accessor([[1,0,0,0]]*count,'VEC4')},
        'indices':model.accessor(indices,'SCALAR',5123),'material':material,'mode':4})


def tailored_jacket(model, profile):
    if not profile.get('jacket'): return
    body=next(m for m in model.j['meshes'] if m.get('name','').lower().startswith('body'))
    mesh_i=model.j['meshes'].index(body);node=next(n for n in model.j['nodes'] if n.get('mesh')==mesh_i)
    skin=model.j['skins'][node['skin']];names=[model.j['nodes'][j].get('name','') for j in skin['joints']]
    arm={i for i,n in enumerate(names) if any(n.endswith(part) for part in ('UpperArm','Forearm','Clavicle'))}
    srgb=np.array(profile['cloth'])/255
    cloth=np.where(srgb<=.04045,srgb/12.92,((srgb+.055)/1.055)**2.4).tolist()
    material=len(model.j['materials']);model.j['materials'].append({'name':'SalaryMan tailored jacket / sleeves','pbrMetallicRoughness':{'baseColorFactor':cloth+[1],'roughnessFactor':.92,'metallicFactor':0}})
    # Sew skinned sleeves over the existing arm surfaces; retain their weights.
    selected=[];attributes=None
    for primitive in list(body['primitives']):
        mat=model.j['materials'][primitive['material']].get('name','').lower()
        if not ('body' in mat or 'tops' in mat): continue
        a=primitive['attributes'];joints=model.read(a['JOINTS_0']).astype(int);weights=model.read(a['WEIGHTS_0'])
        influence=np.sum(weights*np.isin(joints,list(arm)),axis=1)
        indices=model.read(primitive['indices']).ravel().reshape(-1,3)
        triangles=indices[np.all(influence[indices]>.10,axis=1)]
        if not len(triangles): continue
        # Different primitives in the authored body share the same vertex pool.
        if attributes is None: attributes=a
        if a!=attributes: raise ValueError('Jacket source must share body vertex attributes')
        selected.extend(triangles.ravel().tolist())
    if selected:
        pos=model.read(attributes['POSITION']);norm=model.read(attributes['NORMAL']);pos=pos+norm*.008
        a=dict(attributes);a['POSITION']=model.accessor(pos,'VEC3')
        body['primitives'].append({'attributes':a,'indices':model.accessor(selected,'SCALAR',5123),'material':material,'mode':4})
    # A pair of notched lapels, bound to the chest, gives the suit its silhouette.
    chest=names.index('Bip01_Spine1');points=[];indices=[]
    for side in [-1,1]:
        start=len(points)
        points.extend([[side*.065,1.59,-.142],[side*.115,1.49,-.153],[side*.073,1.455,-.16],[side*.025,1.285,-.157]])
        indices.extend([start,start+1,start+2,start,start+2,start+3])
    lapel=len(model.j['materials']);model.j['materials'].append({'name':'SalaryMan tailored jacket / lapels','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[min(1,c*1.18) for c in cloth]+[1],'roughnessFactor':.85,'metallicFactor':0}})
    body['primitives'].append({'attributes':{'POSITION':model.accessor(points,'VEC3'),'NORMAL':model.accessor([[0,0,-1]]*8,'VEC3'),
        'JOINTS_0':model.accessor([[chest,0,0,0]]*8,'VEC4',5123),'WEIGHTS_0':model.accessor([[1,0,0,0]]*8,'VEC4')},
        'indices':model.accessor(indices,'SCALAR',5123),'material':lapel,'mode':4})


def rebuild(name, profile, source_ref, output_dir=None):
    relative='Web/people/'+name+'.glb'
    raw=subprocess.check_output(['git','show',source_ref+':'+relative],cwd=ROOT)
    model=Model(raw); reshape(model,profile)
    if name.startswith(('salaryman_','man_')) or (name.startswith('seiko_') and name[6:] in ('office','suit_black','suit_charcoal','suit_check','waistcoat')):
        # Recover the original navy-vest/white-shirt separation before tinting.
        # The earlier office export had baked both into almost the same white.
        reference=Model(subprocess.check_output(['git','show',source_ref+':Web/people/salaryman_01.glb'],cwd=ROOT))
        for material in model.j['materials']:
            if 'tops' not in material.get('name','').lower(): continue
            target=model.j['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
            source=next(m for m in reference.j['materials'] if 'tops' in m.get('name','').lower())
            source_image=reference.j['images'][reference.j['textures'][source['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
            view=reference.j['bufferViews'][source_image['bufferView']];offset=view.get('byteOffset',0)
            model.j['images'][target]['bufferView']=model.blob(reference.data[offset:offset+view['byteLength']]);model.j['images'][target]['mimeType']=source_image['mimeType']
    recolored=set()
    for material in model.j['materials']:
        name_m=material.get('name','').lower(); pbr=material.get('pbrMetallicRoughness',{})
        color=None;kind='tint'
        if 'hair' in name_m or 'facebrow' in name_m: color=profile['hair']
        elif 'eyeiris' in name_m: color=profile.get('eyes',[68,63,48])
        elif 'tops' in name_m or 'onepiece' in name_m: color=profile['cloth'];kind='cloth'
        elif 'bottoms' in name_m: color=profile.get('trousers',[31,43,49])
        elif 'accessoryneck' in name_m: color=profile.get('tie',[153,65,48])
        if color is None: continue
        texture=pbr.get('baseColorTexture')
        if texture:
            image=model.j['textures'][texture['index']]['source']
            if image not in recolored: model.image(image,lambda pixels,c=color,k=kind:tint(pixels,c,k));recolored.add(image)
            pbr['baseColorFactor']=[1,1,1,pbr.get('baseColorFactor',[1,1,1,1])[3]]
        else: pbr['baseColorFactor']=[c/255 for c in color]+[1]
    accessories(model,profile)
    tailored_jacket(model,profile)
    model.j.setdefault('extras',{})['salarymanDesign']={'version':2,'identity':profile['identity'],'sourceCommit':source_ref,'rig':'Biped / existing retargeter'}
    path=(Path(output_dir) if output_dir else ROOT/'Web/people')/(name+'.glb');model.save(path)
    primitives=sum(len(m['primitives']) for m in model.j['meshes'])
    print(name,profile['identity'],primitives,'primitives',path.stat().st_size,'bytes')


if __name__=='__main__':
    config=json.loads(CONFIG.read_text())
    import sys
    selected=set(sys.argv[1:])
    for name,profile in config['characters'].items():
        if not selected or name in selected: rebuild(name,profile,config['sourceCommit'])
    index_path=ROOT/'Web/people/index.json';index=json.loads(index_path.read_text())
    for e in index['people']:
        profile=config['characters'][Path(e['file']).stem]
        e['bytes']=(index_path.parent/e['file']).stat().st_size;e['identity']=profile['identity'];e['designVersion']=2
    index['designVersion']=2
    index_path.write_text(json.dumps(index,indent=1)+'\n')
