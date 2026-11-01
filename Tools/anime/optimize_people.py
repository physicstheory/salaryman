#!/usr/bin/env python3
"""Batch compatible opaque/cutout GLB primitives without changing skinning or art.

Usage: python3 Tools/anime/optimize_people.py Web/people/*.glb
Only primitives with identical vertex accessors and material are combined.
Transparent primitives retain their ordering. No geometry is decimated.
"""
import copy
import json
from pathlib import Path
import struct
import sys


def batch_primitives(document, binary):
    doc = copy.deepcopy(document)
    data = bytearray(binary)
    before = after = 0
    for mesh in doc.get('meshes', []):
        groups = {}
        result = []
        before += len(mesh['primitives'])
        for primitive in mesh['primitives']:
            material = doc.get('materials', [])[primitive['material']] if 'material' in primitive else {}
            eligible = (primitive.get('mode', 4) == 4 and 'indices' in primitive
                        and material.get('alphaMode', 'OPAQUE') != 'BLEND'
                        and set(primitive) <= {'attributes', 'indices', 'material', 'mode'})
            key = json.dumps({k: v for k, v in primitive.items() if k != 'indices'}, sort_keys=True)
            accessor = doc['accessors'][primitive['indices']] if eligible else {}
            eligible = eligible and 'sparse' not in accessor and accessor.get('componentType') in (5121, 5123, 5125)
            if eligible:
                if key not in groups:
                    groups[key] = []
                    result.append(primitive)
                groups[key].append(primitive)
            else:
                result.append(primitive)
        for primitives in groups.values():
            if len(primitives) < 2:
                continue
            indices = []
            for primitive in primitives:
                accessor = doc['accessors'][primitive['indices']]
                view = doc['bufferViews'][accessor['bufferView']]
                if view.get('buffer', 0) != 0:
                    raise ValueError('Only embedded GLB buffers are supported')
                fmt = {5121: 'B', 5123: 'H', 5125: 'I'}[accessor['componentType']]
                stride = view.get('byteStride', struct.calcsize(fmt))
                offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
                indices.extend(struct.unpack_from('<' + fmt, binary, offset + i * stride)[0]
                               for i in range(accessor['count']))
            while len(data) % 4:
                data.append(0)
            component, fmt = (5123, 'H') if max(indices, default=0) <= 65535 else (5125, 'I')
            packed = struct.pack('<' + fmt * len(indices), *indices)
            doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(data), 'byteLength': len(packed), 'target': 34963})
            data.extend(packed)
            doc['accessors'].append({'bufferView': len(doc['bufferViews']) - 1, 'componentType': component,
                                     'count': len(indices), 'type': 'SCALAR', 'min': [min(indices)], 'max': [max(indices)]})
            primitives[0]['indices'] = len(doc['accessors']) - 1
        mesh['primitives'] = result
        after += len(result)
    while len(data) % 4:
        data.append(0)
    doc['buffers'][0]['byteLength'] = len(data)
    return doc, bytes(data), before, after


def optimize(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', raw)
    if (magic, version, length) != (0x46546C67, 2, len(raw)):
        raise ValueError(f'Invalid GLB: {path}')
    size, kind = struct.unpack_from('<II', raw, 12)
    if kind != 0x4E4F534A:
        raise ValueError('Missing JSON chunk')
    doc = json.loads(raw[20:20 + size])
    offset = 20 + size
    bin_size, kind = struct.unpack_from('<II', raw, offset)
    if kind != 0x004E4942 or offset + 8 + bin_size != len(raw):
        raise ValueError('Expected one embedded binary chunk')
    doc, binary, before, after = batch_primitives(doc, raw[offset + 8:])
    if before == after:
        return before, after
    metadata = json.dumps(doc, separators=(',', ':')).encode()
    metadata += b' ' * (-len(metadata) % 4)
    output = (struct.pack('<III', magic, version, 28 + len(metadata) + len(binary))
              + struct.pack('<II', len(metadata), 0x4E4F534A) + metadata
              + struct.pack('<II', len(binary), 0x004E4942) + binary)
    path.write_bytes(output)
    return before, after


if __name__ == '__main__':
    for name in sys.argv[1:]:
        before, after = optimize(Path(name))
        print(f'{name}: {before} -> {after} primitives')
