import copy
import struct
import unittest
from optimize_people import batch_primitives


class BatchPrimitivesTest(unittest.TestCase):
    def fixture(self, alpha='OPAQUE'):
        return {'buffers': [{'byteLength': 12}], 'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 12}],
                'accessors': [{'bufferView': 0, 'componentType': 5123, 'count': 3, 'type': 'SCALAR', 'byteOffset': offset} for offset in (0, 6)],
                'materials': [{'alphaMode': alpha}], 'skins': [{'joints': [1, 2]}],
                'meshes': [{'primitives': [{'attributes': {'POSITION': 2, 'JOINTS_0': 3, 'WEIGHTS_0': 4},
                                           'indices': i, 'material': 0} for i in (0, 1)]}]}

    def test_preserves_triangle_order_and_rig(self):
        doc = self.fixture()
        original = copy.deepcopy(doc)
        binary = struct.pack('<6H', 0, 1, 2, 2, 3, 0)
        result, data, before, after = batch_primitives(doc, binary)
        self.assertEqual((before, after), (2, 1))
        primitive = result['meshes'][0]['primitives'][0]
        accessor = result['accessors'][primitive['indices']]
        view = result['bufferViews'][accessor['bufferView']]
        self.assertEqual(struct.unpack_from('<6H', data, view['byteOffset']), (0, 1, 2, 2, 3, 0))
        self.assertEqual(result['skins'], doc['skins'])
        self.assertEqual(primitive['attributes'], doc['meshes'][0]['primitives'][0]['attributes'])
        self.assertEqual(doc, original, 'Caller data must not be mutated')
        again, same, before, after = batch_primitives(result, data)
        self.assertEqual((before, after), (1, 1))
        self.assertEqual(same, data)

    def test_transparency_keeps_draw_order(self):
        doc = self.fixture('BLEND')
        result, _, before, after = batch_primitives(doc, bytes(12))
        self.assertEqual((before, after), (2, 2))
        self.assertEqual(result['meshes'], doc['meshes'])

    def test_different_skin_attributes_cannot_merge(self):
        doc = self.fixture()
        doc['meshes'][0]['primitives'][1]['attributes']['JOINTS_0'] = 9
        _, _, before, after = batch_primitives(doc, bytes(12))
        self.assertEqual((before, after), (2, 2))


if __name__ == '__main__':
    unittest.main()
