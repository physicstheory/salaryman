class_name JpBuildings
extends RefCounted
## The city's own buildings (assets/buildings/jp, 50 meshes) textured in code as a Japanese street:
## a procedural facade shader per building (windows, balconies, air-conditioners, shopfronts, lit
## windows at night), then signs, billboards and banners from AdBoards.

const COUNT := 50
const WALLS := [Color(0.80, 0.78, 0.72), Color(0.74, 0.70, 0.62), Color(0.62, 0.64, 0.66), Color(0.70, 0.52, 0.42),
	Color(0.58, 0.64, 0.60), Color(0.82, 0.82, 0.84), Color(0.55, 0.58, 0.66), Color(0.72, 0.68, 0.55), Color(0.45, 0.44, 0.46)]
const SHOP_COLS := [Color(1.0, 0.35, 0.45), Color(1.0, 0.8, 0.2), Color(0.3, 0.8, 1.0), Color(0.5, 1.0, 0.5), Color(1.0, 0.55, 0.2), Color(0.85, 0.5, 1.0), Color(0.95, 0.95, 0.95)]

var ok := false
var items: Array = []         # {mesh, bb (unscaled), foot, height}
var _shader: Shader
var placed := 0

func _init() -> void:
	_shader = load("res://shaders/facade.gdshader") as Shader
	for i in range(1, COUNT + 1):
		var path := "res://assets/buildings/jp/b%02d.obj" % i
		if not ResourceLoader.exists(path):
			continue
		var m := load(path) as Mesh
		if m == null:
			continue
		var bb := m.get_aabb()
		items.append({"mesh": m, "bb": bb, "foot": maxf(bb.size.x, bb.size.z), "height": bb.size.y, "id": i})
	ok = items.size() > 10 and _shader != null

func pick(rng: RandomNumberGenerator, min_foot: float, max_foot: float, want_tall: float) -> Dictionary:
	var pool: Array = []
	for it in items:
		if it.foot >= min_foot and it.foot <= max_foot:
			var w := 1.0 + want_tall * clampf((it.height - 14.0) / 20.0, -0.6, 1.0)
			for k in int(maxf(1.0, w * 3.0)):
				pool.append(it)
	if pool.is_empty():
		pool = items
	return pool[rng.randi() % pool.size()]

func _material(rng: RandomNumberGenerator, it: Dictionary) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _shader
	var tall: bool = it.height > 24.0
	var style := 1.0 if (tall and rng.randf() < 0.55) else float(rng.randi_range(0, 3))
	var wall: Color = WALLS[rng.randi() % WALLS.size()]
	m.set_shader_parameter("wall_col", wall)
	m.set_shader_parameter("trim_col", wall.darkened(0.55))
	m.set_shader_parameter("shop_col", SHOP_COLS[rng.randi() % SHOP_COLS.size()])
	m.set_shader_parameter("style", style)
	m.set_shader_parameter("seed", rng.randf() * 20.0)
	m.set_shader_parameter("lit_ratio", rng.randf_range(0.28, 0.6))
	m.set_shader_parameter("floor_h", rng.randf_range(3.2, 3.7))
	m.set_shader_parameter("bay_w", rng.randf_range(2.8, 3.5))
	return m

## Place one building so it fits a square slot of `slot` metres, centred at (cx, cz), turned `yaw`.
## `outs` are the directions that face a street. Returns the collider box (world space).
func place(parent: Node3D, rng: RandomNumberGenerator, it: Dictionary, cx: float, cz: float, yaw: float, slot: float, outs: Array, y0 := 0.12) -> AABB:
	var bb: AABB = it.bb
	var s := minf(slot / it.foot, 1.3)
	s *= rng.randf_range(0.9, 1.0)
	var wrapper := Node3D.new()
	wrapper.position = Vector3(cx, y0, cz)
	wrapper.rotation.y = yaw
	wrapper.scale = Vector3.ONE * s
	parent.add_child(wrapper)
	var mi := MeshInstance3D.new()
	mi.mesh = it.mesh
	mi.position = Vector3(-(bb.position.x + bb.size.x * 0.5), -bb.position.y, -(bb.position.z + bb.size.z * 0.5))
	mi.material_override = _material(rng, it)
	mi.visibility_range_end = 700.0
	wrapper.add_child(mi)
	var q := int(roundf(yaw / (PI * 0.5))) & 1
	var sx: float = (bb.size.z if q == 1 else bb.size.x) * s
	var sz: float = (bb.size.x if q == 1 else bb.size.z) * s
	var box := AABB(Vector3(cx - sx * 0.5, y0, cz - sz * 0.5), Vector3(sx, bb.size.y * s, sz))
	placed += 1
	AdBoards.dress(parent, rng, box, outs, it.height * s > 20.0)
	return box
