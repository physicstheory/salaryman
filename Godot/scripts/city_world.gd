class_name CityWorld
extends Node3D
## Tōkonto Nights: an 8 x 8 block city built from Kenney's CC0 city and train kits,
## with a fenced railway, a station and level crossings, a night sky and street lamps.
## Roads run on the grid lines x = i * P and z = j * P; blocks sit between them.

const P := 52.0
const N := 8
const KIT_LOW := ["building-a", "building-b", "building-c", "building-d", "building-f", "building-g", "building-h"]
const KIT_WIDE := ["building-e", "building-i", "building-j", "building-k", "building-n"]
const KIT_TALL := ["building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c", "building-skyscraper-d", "building-skyscraper-e", "building-m", "building-l"]
const SIGNS := [["ラーメン", Color(1.0, 0.35, 0.5)], ["パチンコ", Color(1.0, 0.82, 0.2)], ["BAR 夜", Color(0.4, 0.85, 1.0)], ["HOTEL", Color(1.0, 0.6, 0.2)], ["24時間", Color(0.45, 1.0, 0.6)], ["カラオケ", Color(0.88, 0.48, 1.0)], ["薬局", Color(0.45, 1.0, 0.6)], ["居酒屋", Color(1.0, 0.5, 0.3)]]

var W := P * N
var rail_x := 3.0 * P + P * 0.5
var rng := RandomNumberGenerator.new()
var crossings: Array[Crossing] = []
var trains: Array[Train] = []
var building_count := 0
var forest: BirchForest
var _sizes := {}                 # kit name -> unscaled size
var _prepared := {}
var _asphalt: ImageTexture

func build() -> void:
	rng.seed = 11
	_environment()
	_ground()
	_roads()
	forest = BirchForest.new()
	add_child(forest)
	_blocks()
	_rail()
	_lamps()
	forest.commit()

# ---- sky, light and the sea
func _environment() -> void:
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.015, 0.025, 0.07)
	sky_mat.sky_horizon_color = Color(0.17, 0.1, 0.22)
	sky_mat.ground_horizon_color = Color(0.1, 0.08, 0.14)
	sky_mat.ground_bottom_color = Color(0.02, 0.02, 0.04)
	sky_mat.sun_angle_max = 0.0
	var sky := Sky.new()
	sky.sky_material = sky_mat
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.32, 0.38, 0.6)
	env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.1
	env.fog_enabled = true
	env.fog_light_color = Color(0.1, 0.09, 0.17)
	env.fog_density = 0.0035
	env.glow_enabled = true
	env.glow_intensity = 0.7
	env.glow_bloom = 0.05
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.1
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var moon := DirectionalLight3D.new()
	moon.light_color = Color(0.6, 0.7, 1.0)
	moon.light_energy = 0.55
	moon.rotation_degrees = Vector3(-52, 38, 0)
	moon.shadow_enabled = true
	moon.directional_shadow_max_distance = 140.0
	moon.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	add_child(moon)

func _mat(c: Color, rough := 0.9, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m

func _box(parent: Node, size: Vector3, pos: Vector3, mat: Material, solid := true) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = pos
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	bm.material = mat
	mi.mesh = bm
	body.add_child(mi)
	if solid:
		var cs := CollisionShape3D.new()
		var sh := BoxShape3D.new()
		sh.size = size
		cs.shape = sh
		body.add_child(cs)
	parent.add_child(body)
	return body

func _ground() -> void:
	var half := W * 0.5
	var g := StaticBody3D.new()
	g.name = "Ground"
	g.set_meta("grip", 1.0)
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = Vector3(W + 160.0, 2.0, W + 160.0)
	cs.shape = sh
	cs.position = Vector3(half, -1.0, half)
	g.add_child(cs)
	var pm := PhysicsMaterial.new()
	pm.friction = 1.0
	g.physics_material_override = pm
	var mi := MeshInstance3D.new()
	var pl := PlaneMesh.new()
	pl.size = Vector2(W + 160.0, W + 160.0)
	pl.material = _mat(Color(0.08, 0.085, 0.1), 1.0)
	mi.mesh = pl
	mi.position = Vector3(half, -0.02, half)
	g.add_child(mi)
	add_child(g)
	var sea := MeshInstance3D.new()
	var sp := PlaneMesh.new()
	sp.size = Vector2(2400, 2400)
	sp.material = _mat(Color(0.03, 0.08, 0.15), 0.15, 0.6)
	sea.mesh = sp
	sea.position = Vector3(half, -0.9, half)
	add_child(sea)
	# the edge of the map: low walls, so nothing drives into the sea
	var wall_m := _mat(Color(0.2, 0.22, 0.28))
	var e := 34.0
	_box(self, Vector3(W + 2 * e, 3.0, 1.0), Vector3(half, 1.5, -e), wall_m)
	_box(self, Vector3(W + 2 * e, 3.0, 1.0), Vector3(half, 1.5, W + e), wall_m)
	_box(self, Vector3(1.0, 3.0, W + 2 * e), Vector3(-e, 1.5, half), wall_m)
	_box(self, Vector3(1.0, 3.0, W + 2 * e), Vector3(W + e, 1.5, half), wall_m)

func _asphalt_texture() -> ImageTexture:
	if _asphalt:
		return _asphalt
	var img := Image.create(32, 64, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.105, 0.115, 0.14))
	for y in 64:
		for x in 32:
			var n := rng.randf() * 0.025
			img.set_pixel(x, y, Color(0.105 + n, 0.115 + n, 0.14 + n))
		if y > 4 and y < 26:
			for x in range(14, 18):
				img.set_pixel(x, y, Color(0.8, 0.7, 0.35))
		img.set_pixel(1, y, Color(0.8, 0.8, 0.8))
		img.set_pixel(30, y, Color(0.8, 0.8, 0.8))
	_asphalt = ImageTexture.create_from_image(img)
	return _asphalt

func _roads() -> void:
	var road_mat := StandardMaterial3D.new()
	road_mat.albedo_texture = _asphalt_texture()
	road_mat.roughness = 0.38
	road_mat.metallic_specular = 0.7
	road_mat.uv1_scale = Vector3(1, (W + 12.0) / 16.0, 1)
	road_mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	var plain := _mat(Color(0.11, 0.12, 0.145), 0.38)
	plain.metallic_specular = 0.7
	for k in N + 1:
		var a := MeshInstance3D.new()
		var pa := PlaneMesh.new()
		pa.size = Vector2(12, W + 12.0)
		pa.material = road_mat
		a.mesh = pa
		a.position = Vector3(k * P, 0.02, W * 0.5)
		add_child(a)
		var b := MeshInstance3D.new()
		var pb := PlaneMesh.new()
		pb.size = Vector2(12, W + 12.0)
		pb.material = road_mat
		b.mesh = pb
		b.rotation.y = PI * 0.5
		b.position = Vector3(W * 0.5, 0.021, k * P)
		add_child(b)
	# junctions are plain asphalt, so the lane paint stops at the kerb
	var jm := MultiMeshInstance3D.new()
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var jq := PlaneMesh.new()
	jq.size = Vector2(12, 12)
	jq.material = plain
	mm.mesh = jq
	mm.instance_count = (N + 1) * (N + 1)
	var idx := 0
	for i in N + 1:
		for j in N + 1:
			mm.set_instance_transform(idx, Transform3D(Basis.IDENTITY, Vector3(i * P, 0.04, j * P)))
			idx += 1
	jm.multimesh = mm
	add_child(jm)

# ---- Kenney models
func _kit_scene(dir: String, name: String) -> PackedScene:
	return load("res://assets/kenney/%s/%s.glb" % [dir, name]) as PackedScene

func _prepare_materials(root: Node, glow: float) -> void:
	for n in root.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		if mi.mesh == null:
			continue
		if _prepared.has(mi.mesh):
			continue
		_prepared[mi.mesh] = true
		for s in mi.mesh.get_surface_count():
			var m := mi.mesh.surface_get_material(s) as StandardMaterial3D
			if m:
				m.roughness = 0.85
				m.metallic = 0.0
				m.metallic_specular = 0.3
				# at night the colour map doubles as a faint glow, so windows read as lit
				m.emission_enabled = true
				m.emission_texture = m.albedo_texture
				m.emission_energy_multiplier = glow

func _world_aabb(root: Node3D) -> AABB:
	var box := AABB()
	var first := true
	for n in root.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		var b := mi.global_transform * mi.get_aabb()
		if first:
			box = b
			first = false
		else:
			box = box.merge(b)
	return box

func _place_kit(name: String, cx: float, cz: float, yaw: float, target: float, y := 0.12) -> void:
	var scn := _kit_scene("city", name)
	if scn == null:
		return
	var inst := scn.instantiate() as Node3D
	if not _sizes.has(name):
		add_child(inst)
		inst.global_transform = Transform3D.IDENTITY
		var raw := _world_aabb(inst)
		_sizes[name] = raw
		remove_child(inst)
		_prepare_materials(inst, 0.3)
	var raw: AABB = _sizes[name]
	var s := target / maxf(raw.size.x, raw.size.z)
	inst.scale = Vector3.ONE * s
	inst.rotation.y = yaw
	inst.position = Vector3(cx, y - raw.position.y * s, cz)
	add_child(inst)
	var wb := _world_aabb(inst)
	var body := StaticBody3D.new()
	body.position = wb.get_center()
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = wb.size
	cs.shape = sh
	body.add_child(cs)
	add_child(body)
	building_count += 1
	if rng.randf() < 0.55:
		_sign(cx, cz, yaw, wb.size, y)

func _sign(cx: float, cz: float, yaw: float, size: Vector3, y: float) -> void:
	var s: Array = SIGNS[rng.randi() % SIGNS.size()]
	var f := Vector3(sin(yaw), 0, cos(yaw))
	var depth := absf(f.x) * size.x * 0.5 + absf(f.z) * size.z * 0.5
	var l := Label3D.new()
	l.text = s[0]
	l.modulate = s[1]
	l.shaded = false
	l.double_sided = true
	l.font_size = 96
	l.pixel_size = 0.028
	l.outline_size = 14
	l.outline_modulate = Color(0.02, 0.02, 0.04)
	l.position = Vector3(cx, y + 3.4 + rng.randf() * 1.8, cz) + f * (depth + 0.15)
	l.rotation.y = yaw
	add_child(l)

func _blocks() -> void:
	var pad_mat := _mat(Color(0.2, 0.21, 0.25), 0.9)
	var park_mat := _mat(Color(0.08, 0.2, 0.11), 1.0)
	var tree_cone := ConeMesh_make()
	for i in N:
		for j in N:
			var x0 := i * P + 6.0
			var z0 := j * P + 6.0
			var s := P - 12.0
			var is_park := (i == 4 and (j == 3 or j == 4))
			var pad := _box(self, Vector3(s, 0.12, s), Vector3(x0 + s * 0.5, 0.06, z0 + s * 0.5), park_mat if is_park else pad_mat)
			pad.set_meta("grip", 1.0)
			if is_park:
				for t in 16:
					var v: int = BirchForest.VARIANTS[rng.randi() % BirchForest.VARIANTS.size()]
					forest.add(v, Vector3(x0 + 4.0 + rng.randf() * (s - 8.0), 0.12, z0 + 4.0 + rng.randf() * (s - 8.0)), rng.randf_range(0.75, 1.15), rng.randf() * TAU, BirchForest.leaf_colour(rng))
				continue
			if i == 3:
				continue            # the railway cutting
			var mid := absf(i - 3.5) + absf(j - 3.5)
			_lot(x0 + 1.0, z0 + 1.0, s - 2.0, mid)
			_street_trees(x0, z0, s)

## Birches along the pavement, in the strip between the kerb and the shopfronts, clear of the junctions.
func _street_trees(x0: float, z0: float, s: float) -> void:
	var edge := 0.9           # metres in from the kerb line of the block
	for side in 4:
		var n := 0
		for k in [11.0, 27.0]:
			if rng.randf() < 0.18:
				continue
			var p := Vector3.ZERO
			match side:
				0: p = Vector3(x0 + k, 0.12, z0 + edge)
				1: p = Vector3(x0 + k, 0.12, z0 + s - edge)
				2: p = Vector3(x0 + edge, 0.12, z0 + k)
				3: p = Vector3(x0 + s - edge, 0.12, z0 + k)
			var v: int = BirchForest.VARIANTS[rng.randi() % BirchForest.VARIANTS.size()]
			forest.add(v, p, rng.randf_range(0.42, 0.6), rng.randf() * TAU, BirchForest.leaf_colour(rng))
			n += 1

func ConeMesh_make() -> Array:
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 2.2
	cone.height = 6.0
	cone.radial_segments = 7
	cone.material = _mat(Color(0.1, 0.3, 0.17), 1.0)
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.3
	trunk.bottom_radius = 0.4
	trunk.height = 2.0
	trunk.material = _mat(Color(0.25, 0.17, 0.1), 1.0)
	return [cone, trunk]

func _tree(p: Vector3, meshes: Array) -> void:
	var body := StaticBody3D.new()
	body.position = p
	var t := MeshInstance3D.new()
	t.mesh = meshes[1]
	t.position.y = 1.0
	body.add_child(t)
	var c := MeshInstance3D.new()
	c.mesh = meshes[0]
	c.position.y = 4.5
	body.add_child(c)
	var cs := CollisionShape3D.new()
	var sh := CylinderShape3D.new()
	sh.radius = 0.4
	sh.height = 3.0
	cs.shape = sh
	cs.position.y = 1.5
	body.add_child(cs)
	add_child(body)

func _pick(a: Array) -> String:
	return a[rng.randi() % a.size()]

func _lot(x: float, z: float, sz: float, mid: float) -> void:
	var cx := x + sz * 0.5
	var cz := z + sz * 0.5
	if rng.randf() < 0.26:
		var yaw := (0.0 if rng.randf() < 0.5 else PI) + (0.0 if rng.randf() < 0.5 else PI * 0.5)
		_place_kit(_pick(KIT_WIDE), cx, cz, yaw, sz - 1.0)
		return
	for a in 2:
		for b in 2:
			var dx := 1.0 if a == 1 else -1.0
			var dz := 1.0 if b == 1 else -1.0
			var yaw := atan2(dx, 0.0) if rng.randf() < 0.5 else atan2(0.0, dz)
			var tall := (mid < 3.0 and rng.randf() < 0.75) or rng.randf() < 0.15
			_place_kit(_pick(KIT_TALL if tall else KIT_LOW), x + sz * (0.25 + 0.5 * a), z + sz * (0.25 + 0.5 * b), yaw, sz * 0.5 - 1.8)

# ---- railway: a fenced cutting down block column 3
func _rail() -> void:
	var gravel := _mat(Color(0.17, 0.16, 0.15), 1.0)
	var fence := _mat(Color(0.24, 0.27, 0.32), 0.7, 0.4)
	var plat := _mat(Color(0.5, 0.52, 0.56), 0.8)
	var roof := _mat(Color(0.16, 0.42, 0.29), 0.6, 0.2)
	var ts := 3.4
	var tile := _kit_scene("train", "railroad-straight")
	var tile_len := 4.0 * ts
	for j in N:
		var z0 := j * P + 6.0
		var z1 := (j + 1) * P - 6.0
		var zc := (z0 + z1) * 0.5
		var ln := z1 - z0
		_box(self, Vector3(P - 16.0, 0.14, ln), Vector3(rail_x, 0.19, zc), gravel, false)
		for sd in [-1.0, 1.0]:
			_box(self, Vector3(0.25, 2.2, ln), Vector3(rail_x + sd * (P * 0.5 - 8.1), 1.2, zc), fence)
	if tile:
		var holder := Node3D.new()
		add_child(holder)
		_prepare_materials(tile.instantiate(), 0.3)
		var n := 0
		while n * tile_len < W + tile_len:
			for off in [-2.0, 2.0]:
				var t := tile.instantiate() as Node3D
				t.scale = Vector3.ONE * ts
				t.position = Vector3(rail_x + off, 0.24, n * tile_len + tile_len * 0.0)
				holder.add_child(t)
			n += 1
	# the station, in the fourth block down
	var sz0 := 3.0 * P + 6.0
	for sd in [-1.0, 1.0]:
		var px: float = rail_x + sd * 6.4
		_box(self, Vector3(4.4, 1.0, 34.0), Vector3(px, 0.5, sz0 + 20.0), plat)
		_box(self, Vector3(5.0, 0.3, 30.0), Vector3(px, 5.4, sz0 + 20.0), roof, false)
		for dz in [-12.0, 0.0, 12.0]:
			_box(self, Vector3(0.3, 5.0, 0.3), Vector3(px + sd * 1.7, 2.9, sz0 + 20.0 + dz), fence)
		var l := Label3D.new()
		l.text = "東都駅  TŌKONTO"
		l.modulate = Color(1, 1, 1)
		l.shaded = false
		l.double_sided = true
		l.font_size = 80
		l.pixel_size = 0.03
		l.position = Vector3(px, 4.4, sz0 + 20.0 - 15.2)
		add_child(l)
	for k in N + 1:
		var c := Crossing.new()
		add_child(c)
		c.setup(k * P, rail_x)
		crossings.append(c)
	var consists := [["train-electric-city-a", "train-electric-city-b", "train-electric-city-b", "train-electric-city-c"], ["train-electric-bullet-a", "train-electric-bullet-b", "train-electric-bullet-b", "train-electric-bullet-c"]]
	for i in 2:
		var tr := Train.new()
		add_child(tr)
		tr.setup(consists[i], 1.0 if i == 0 else -1.0, rail_x, W, 22.0 if i == 0 else 34.0, 90.0, 0.0 if i == 0 else 7.0)
		trains.append(tr)

func _process(dt: float) -> void:
	for c in crossings:
		c.update_state(dt, trains)

## Distance along a heading to the stop line of a lowered barrier, or INF when the way is clear.
func barrier_distance(pos: Vector3, heading: Vector3) -> float:
	if absf(heading.x) < 0.5:
		return INF
	var k := int(round(pos.z / P))
	if k < 0 or k >= crossings.size():
		return INF
	var c := crossings[k]
	if not c.down or absf(pos.z - k * P) > 6.0:
		return INF
	var d := (rail_x - 10.8 - pos.x) if heading.x > 0.0 else (pos.x - (rail_x + 10.8))
	return d if d > -1.0 and d < 40.0 else INF

# ---- street lamps
func _lamps() -> void:
	var count := (N + 1) * (N + 1) * 2
	var post := MultiMesh.new()
	post.transform_format = MultiMesh.TRANSFORM_3D
	var pm := CylinderMesh.new()
	pm.top_radius = 0.12
	pm.bottom_radius = 0.15
	pm.height = 7.0
	pm.material = _mat(Color(0.12, 0.13, 0.17), 0.6, 0.4)
	post.mesh = pm
	post.instance_count = count
	var head := MultiMesh.new()
	head.transform_format = MultiMesh.TRANSFORM_3D
	var hm := SphereMesh.new()
	hm.radius = 0.5
	hm.height = 1.0
	var glow := StandardMaterial3D.new()
	glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	glow.albedo_color = Color(1.0, 0.86, 0.55)
	hm.material = glow
	head.mesh = hm
	head.instance_count = count
	var idx := 0
	for i in N + 1:
		for j in N + 1:
			for o in [Vector2(7, 7), Vector2(-7, -7)]:
				post.set_instance_transform(idx, Transform3D(Basis.IDENTITY, Vector3(i * P + o.x, 3.5, j * P + o.y)))
				head.set_instance_transform(idx, Transform3D(Basis.IDENTITY, Vector3(i * P + o.x, 7.2, j * P + o.y)))
				idx += 1
	var a := MultiMeshInstance3D.new()
	a.multimesh = post
	add_child(a)
	var b := MultiMeshInstance3D.new()
	b.multimesh = head
	add_child(b)
