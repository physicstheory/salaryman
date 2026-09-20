"""Which way does the model in this FBX actually face?

Blender is Z up and Unity is Y up, and the export converts between them. Reasoning about
that conversion is how a character ends up walking backwards: the answer depends on the
exporter's axis settings, the importer's handedness flip and which way the artist modelled
the thing, and getting any one of the three wrong looks exactly like getting the other two
wrong. So this does not reason about it. It reads the vertex positions back out of the
exported file, matches them against the positions that went in, and solves for the
transform that was actually applied - then applies it to the direction the model faces in
Blender to find the direction it faces in the file.

That is a small binary FBX reader plus a least squares fit, and it turns a convention
argument into a measurement.
"""
import struct, zlib, sys

def _read_record(f, ver):
    fmt, size = ('<QQQ', 24) if ver >= 7500 else ('<III', 12)
    head = f.read(size)
    if len(head) < size:
        return None
    end, nprops, plen = struct.unpack(fmt, head)
    nlen = struct.unpack('<B', f.read(1))[0]
    name = f.read(nlen).decode('utf-8', 'replace')
    if end == 0:
        return None
    props = []
    stop = f.tell() + plen
    while f.tell() < stop:
        t = f.read(1).decode('ascii')
        if t == 'Y': props.append(struct.unpack('<h', f.read(2))[0])
        elif t == 'C': props.append(struct.unpack('<?', f.read(1))[0])
        elif t == 'I': props.append(struct.unpack('<i', f.read(4))[0])
        elif t == 'F': props.append(struct.unpack('<f', f.read(4))[0])
        elif t == 'D': props.append(struct.unpack('<d', f.read(8))[0])
        elif t == 'L': props.append(struct.unpack('<q', f.read(8))[0])
        elif t in 'fdlib':
            n, enc, clen = struct.unpack('<III', f.read(12))
            raw = f.read(clen)
            if enc: raw = zlib.decompress(raw)
            code = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'b'}[t]
            props.append(list(struct.unpack('<%d%s' % (n, code), raw)))
        elif t in 'SR':
            n = struct.unpack('<I', f.read(4))[0]
            raw = f.read(n)
            props.append(raw.decode('utf-8', 'replace') if t == 'S' else raw)
        else:
            raise ValueError('unknown property type %r in %s' % (t, name))
    children = []
    while f.tell() < end:
        c = _read_record(f, ver)
        if c is None: break
        children.append(c)
    f.seek(end)
    return (name, props, children)

def read(path):
    f = open(path, 'rb')
    magic = f.read(23)
    if not magic.startswith(b'Kaydara FBX Binary'):
        raise ValueError('not a binary FBX')
    ver = struct.unpack('<I', f.read(4))[0]
    root = []
    while True:
        r = _read_record(f, ver)
        if r is None: break
        root.append(r)
    return ver, root

def find(nodes, name):
    for n in nodes:
        if n[0] == name: yield n
        for m in find(n[2], name): yield m

def vertices(path):
    ver, root = read(path)
    out = []
    for geom in find(root, 'Geometry'):
        for v in find(geom[2], 'Vertices'):
            out.append(v[1][0])
    return ver, out

def axis_map(blender_points, fbx_flat):
    """Least squares 3x3 taking Blender coordinates to the exported file's coordinates.

    The exporter writes the mesh's vertices in the same order it was given them, so the
    two lists correspond point for point and the mapping falls straight out.
    """
    n = min(len(blender_points), len(fbx_flat) // 3)
    if n < 12:
        raise ValueError('not enough points to fit an axis map')

    # Normal equations, one column of the map at a time: (A^T A) m = A^T b
    ata = [[0.0] * 3 for _ in range(3)]
    atb = [[0.0] * 3 for _ in range(3)]
    for i in range(n):
        a = blender_points[i]
        b = fbx_flat[i * 3:i * 3 + 3]
        for r in range(3):
            for c in range(3):
                ata[r][c] += a[r] * a[c]
            for c in range(3):
                atb[r][c] += a[r] * b[c]

    # Gauss-Jordan on the 3x3, solving for all three columns at once.
    m = [row[:] for row in ata]
    rhs = [row[:] for row in atb]
    for i in range(3):
        pivot = max(range(i, 3), key=lambda r: abs(m[r][i]))
        m[i], m[pivot] = m[pivot], m[i]
        rhs[i], rhs[pivot] = rhs[pivot], rhs[i]
        d = m[i][i]
        if abs(d) < 1e-12:
            raise ValueError('degenerate point set')
        m[i] = [v / d for v in m[i]]
        rhs[i] = [v / d for v in rhs[i]]
        for r in range(3):
            if r == i:
                continue
            f = m[r][i]
            m[r] = [m[r][c] - f * m[i][c] for c in range(3)]
            rhs[r] = [rhs[r][c] - f * rhs[i][c] for c in range(3)]
    return rhs      # rhs[r][c]: contribution of blender axis r to file axis c


def direction_in_file(blender_points, fbx_flat, direction):
    """Where a Blender direction ends up in the exported file, as a unit vector."""
    m = axis_map(blender_points, fbx_flat)
    out = [sum(direction[r] * m[r][c] for r in range(3)) for c in range(3)]
    length = sum(v * v for v in out) ** 0.5
    return [v / length for v in out] if length > 1e-9 else out


# ---------------------------------------------------------------- node transforms
# The geometry in an FBX is in its object's own space: Blender's Z up to Y up conversion
# is carried by the node transforms, not by the vertices. So the vertex fit above is only
# half the answer, and this is the other half.

def _props70(node):
    out = {}
    for child in node[2]:
        if child[0] != 'Properties70':
            continue
        for p in child[2]:
            if p[0] != 'P' or not p[1]:
                continue
            vals = [v for v in p[1][4:] if isinstance(v, (int, float))]
            out[p[1][0]] = vals
    return out


def _euler_matrix(deg):
    import math
    rx, ry, rz = (math.radians(v) for v in deg)
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    # FBX's default euler order, as a row-vector convention matching the vertex fit above.
    mx = [[1, 0, 0], [0, cx, sx], [0, -sx, cx]]
    my = [[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]]
    mz = [[cz, sz, 0], [-sz, cz, 0], [0, 0, 1]]
    return _mul(_mul(mx, my), mz)


def _mul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(3)) for c in range(3)] for r in range(3)]


def node_rotation(path, kind='Mesh'):
    """The rotation the file applies to a model's geometry, including its parents'."""
    ver, root = read(path)
    models, parent = {}, {}
    for objs in find(root, 'Objects'):
        for m in find(objs[2], 'Model'):
            ident = m[1][0]
            name = m[1][1].split('::')[-1] if len(m[1]) > 1 else ''
            models[ident] = (name, m[1][2] if len(m[1]) > 2 else '', _props70(m))
    for conns in find(root, 'Connections'):
        for c in conns[2]:
            if c[0] == 'C' and len(c[1]) >= 3 and c[1][0] == 'OO':
                parent[c[1][1]] = c[1][2]

    target = next((i for i, m in models.items() if m[1] == kind), None)
    if target is None:
        return [[1, 0, 0], [0, 1, 0], [0, 0, 1]], []

    chain, node = [], target
    seen = set()
    while node in models and node not in seen:
        seen.add(node)
        chain.append(models[node])
        node = parent.get(node)

    out = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    names = []
    for name, _, props in chain:
        names.append(name)
        pre = props.get('PreRotation')
        lcl = props.get('Lcl Rotation')
        if pre and len(pre) >= 3:
            out = _mul(out, _euler_matrix(pre[:3]))
        if lcl and len(lcl) >= 3:
            out = _mul(out, _euler_matrix(lcl[:3]))
    return out, names


def facing_in_unity(path, blender_points, blender_forward=(0.0, 1.0, 0.0)):
    """Where a Blender direction points once Unity has imported this file.

    Two steps: the transform the exporter actually applied, measured by fitting the
    vertices and reading the node rotations, and then Unity's own handedness flip, which
    negates X and leaves Z alone.
    """
    ver, arrays = vertices(path)
    if not arrays:
        raise ValueError('no geometry in ' + path)
    geom = direction_in_file(blender_points, arrays[0], blender_forward)
    rot, chain = node_rotation(path)
    out = [sum(geom[r] * rot[r][c] for r in range(3)) for c in range(3)]
    length = sum(v * v for v in out) ** 0.5
    if length > 1e-9:
        out = [v / length for v in out]
    return [-out[0], out[1], out[2]], chain


if __name__ == '__main__':
    ver, arrays = vertices(sys.argv[1])
    print('fbx version', ver, 'geometries', len(arrays), 'verts', [len(a) // 3 for a in arrays])
