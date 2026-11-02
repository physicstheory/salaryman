class_name ActivitySpot
extends Node3D
## A place in the open with something to do: a park bench, or a spot on the pier to fish from.
var brand := "bench"
var shop_name := "Bench"
var door := Vector3.ZERO

func build(kind: String, pos: Vector3, yaw: float) -> void:
	brand = kind
	shop_name = "Bench" if kind == "bench" else "Pier"
	position = pos
	rotation.y = yaw
	var wood := StandardMaterial3D.new()
	wood.albedo_color = Color(0.42, 0.27, 0.15)
	wood.roughness = 0.9
	var dark := StandardMaterial3D.new()
	dark.albedo_color = Color(0.12, 0.13, 0.16)
	dark.metallic = 0.5
	if kind == "bench":
		_box(Vector3(1.8, 0.1, 0.5), Vector3(0, 0.5, 0), wood)
		_box(Vector3(1.8, 0.5, 0.08), Vector3(0, 0.85, -0.22), wood)
		for sx in [-0.8, 0.8]:
			_box(Vector3(0.08, 0.5, 0.45), Vector3(sx, 0.25, 0), dark)
		door = global_position + Vector3(sin(yaw), 0, cos(yaw)) * 0.9
	else:
		# a plank deck with posts and a rail, and a lit sign
		_box(Vector3(14.0, 0.25, 4.0), Vector3(0, 0.0, 0), wood)
		for k in 6:
			_box(Vector3(0.25, 1.4, 0.25), Vector3(-6.5 + k * 2.6, 0.7, -1.9), dark)
		_box(Vector3(14.0, 0.08, 0.1), Vector3(0, 1.1, -1.9), dark)
		var l := Label3D.new()
		l.text = "釣り  FISHING"
		l.shaded = false
		l.modulate = Color(0.5, 0.9, 1.0)
		l.font_size = 90
		l.pixel_size = 0.012
		l.position = Vector3(0, 2.4, -1.9)
		l.visibility_range_end = 120.0
		add_child(l)
		var l2 := l.duplicate() as Label3D
		l2.rotation.y = PI
		add_child(l2)
		door = global_position + Vector3(sin(yaw), 0, cos(yaw)) * 0.5
	door.y = 0.0

func _box(size: Vector3, pos: Vector3, m: Material) -> void:
	var sb := StaticBody3D.new()
	sb.position = pos
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	bm.material = m
	mi.mesh = bm
	sb.add_child(mi)
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = size
	cs.shape = sh
	if size.y > 0.4 and size.x > 5.0:
		pass
	sb.add_child(cs)
	add_child(sb)
