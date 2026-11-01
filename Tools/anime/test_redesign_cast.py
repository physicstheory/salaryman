import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import numpy as np
from redesign_cast import Model, ROOT, CONFIG, rebuild


class RedesignCastTest(unittest.TestCase):
    def test_all_assets_keep_their_rigs_and_valid_skinning(self):
        config = json.loads(CONFIG.read_text())
        for name in config['characters']:
            with self.subTest(character=name):
                original = Model(subprocess.check_output(['git','show',config['sourceCommit']+':Web/people/'+name+'.glb'],cwd=ROOT))
                model = Model((ROOT/'Web/people'/f'{name}.glb').read_bytes())
                self.assertEqual(model.j['nodes'], original.j['nodes'])
                self.assertEqual(len(model.j['skins']), len(original.j['skins']))
                for skin, old in zip(model.j['skins'],original.j['skins']):
                    self.assertEqual(skin['joints'],old['joints'])
                    np.testing.assert_array_equal(model.read(skin['inverseBindMatrices']), original.read(old['inverseBindMatrices']))
                old_meshes = {m['name']:m for m in original.j['meshes']}
                for mesh in model.j['meshes']:
                    old = old_meshes[mesh['name']]['primitives'][0]['attributes']
                    new = mesh['primitives'][0]['attributes']
                    for field in ['JOINTS_0','WEIGHTS_0']:
                        np.testing.assert_array_equal(model.read(new[field]),original.read(old[field]))
                    node=next(n for n in model.j['nodes'] if n.get('mesh')==model.j['meshes'].index(mesh))
                    joint_count=len(model.j['skins'][node['skin']]['joints'])
                    for primitive in mesh['primitives']:
                        attrs=primitive['attributes'];pos=model.read(attrs['POSITION']);indices=model.read(primitive['indices'])
                        self.assertTrue(np.all(np.isfinite(pos)))
                        self.assertLess(indices.max(),len(pos))
                        self.assertLess(model.read(attrs['JOINTS_0']).max(),joint_count)
                        np.testing.assert_allclose(model.read(attrs['WEIGHTS_0']).sum(axis=1),1,atol=.002)
                        self.assertTrue(np.all(np.isfinite(model.read(attrs['NORMAL']))))
                self.assertEqual(model.j['extras']['salarymanDesign']['version'],2)
                self.assertEqual(model.j['buffers'][0]['byteLength'],len(model.data))

    def test_rebuilding_a_tailored_hero_is_deterministic(self):
        config=json.loads(CONFIG.read_text());profile=config['characters']['seiko_suit_black']
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            rebuild('seiko_suit_black',profile,config['sourceCommit'],folder)
            path=Path(folder)/'seiko_suit_black.glb';first=hashlib.sha256(path.read_bytes()).digest()
            rebuild('seiko_suit_black',profile,config['sourceCommit'],folder)
            self.assertEqual(hashlib.sha256(path.read_bytes()).digest(),first)
            self.assertEqual(path.read_bytes(),(ROOT/'Web/people/seiko_suit_black.glb').read_bytes())


if __name__=='__main__':
    unittest.main()
