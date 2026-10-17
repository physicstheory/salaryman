class_name BirchForest
extends Node3D
## The five birches from the tree kit, drawn as a handful of MultiMeshes (one for bark and one for
## leaves per variant) so hundreds of trees cost ten draw calls. Every trunk gets a solid collider.

const VARIANTS := [1, 2, 4, 5, 6]

var _bark_mat: StandardMaterial3D
var _leaf_mat: StandardMaterial3D
var _items := {}          # variant -> Array of [Transform3D, Color]
var _bark := {}           # variant -> ArrayMesh with just the bark surface
var _leaf := {}
var count := 0

func _init() -> void:
	_bark_mat = StandardMaterial3D.new()
	_bark_mat.albedo_color = Color(0.86, 0.84, 0.79)
	_bark_mat.roughness = 0.85
	_leaf_mat = StandardMaterial3D.new()
	_leaf_mat.vertex_color_use_as_albedo = true
	_leaf_mat.albedo_color = Color.WHITE
	_leaf_mat.roughness = 0.8
	_leaf_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	for v in VARIANTS:
		_items[v] = []
		var m := load("res://assets/trees/Birch_%d.obj" % v) as Mesh
		if m == null:
			continue
		for s in m.get_surface_count():
			var one := ArrayMesh.new()
			one.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, m.surface_get_arrays(s))
			var nm := m.surface_get_material(s).resource_name if m.surface_get_material(s) else ""
			if nm.contains("Leaves") or (nm == "" and s == 1):
				one.surface_set_material(0, _leaf_mat)
				_leaf[v] = one
			else:
				one.surface_set_material(0, _bark_mat)
				_bark[v] = one

## A pleasant spread of greens, now and then turning gold.
static func leaf_colour(rng: RandomNumberGenerator) -> Color:
	var r := rng.randf()
	if r < 0.12:
		return Color(0.82, 0.66, 0.16).lerp(Color(0.9, 0.45, 0.1), rng.randf() * 0.5)
	return Color(0.27, 0.5, 0.17).lerp(Color(0.5, 0.64, 0.2), rng.randf())

func add(variant: int, pos: Vector3, tree_scale: float, yaw: float, leaf: Color, solid := true) -> void:
	if not _items.has(variant) or not _bark.has(variant):
		return
	var t := Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * tree_scale), pos)
	_items[variant].append([t, leaf])
	count += 1
	if solid:
		var body := StaticBody3D.new()
		body.position = pos
		var cs := CollisionShape3D.new()
		var sh := CylinderShape3D.new()
		sh.radius = 0.32 * tree_scale + 0.08
		sh.height = 4.0 * tree_scale
		cs.shape = sh
		cs.position.y = 2.0 * tree_scale
		body.add_child(cs)
		add_child(body)

func commit() -> void:
	for v in VARIANTS:
		var items: Array = _items[v]
		if items.is_empty() or not _bark.has(v):
			continue
		var mb := MultiMesh.new()
		mb.transform_format = MultiMesh.TRANSFORM_3D
		mb.mesh = _bark[v]
		mb.instance_count = items.size()
		var ml := MultiMesh.new()
		ml.transform_format = MultiMesh.TRANSFORM_3D
		ml.use_colors = true
		ml.mesh = _leaf[v]
		ml.instance_count = items.size()
		for i in items.size():
			mb.set_instance_transform(i, items[i][0])
			ml.set_instance_transform(i, items[i][0])
			ml.set_instance_color(i, items[i][1])
		var a := MultiMeshInstance3D.new()
		a.multimesh = mb
		add_child(a)
		var b := MultiMeshInstance3D.new()
		b.multimesh = ml
		add_child(b)
