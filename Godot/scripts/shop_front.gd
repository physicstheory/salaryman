class_name ShopFront
extends Node3D
## The branded face of a shop on a building's street wall: a coloured fascia with the name in
## Japanese and English, the chain's stripes, a lit glass door under a canopy. `door` is where you
## stand to go in.

var brand := "eleven"
var shop_name := ""
var door := Vector3.ZERO
var out_n := Vector3.FORWARD
var kind := "shop"          # shop, vending, capsule, plaza

static func col(s: String) -> Color:
	return Color(s)

func build(brand_id: String, wall_pos: Vector3, n: Vector3, width: float, ground_y: float) -> void:
	brand = brand_id
	out_n = n
	var b: Dictionary = GameData.brand(brand_id)
	shop_name = b.name
	var yaw := atan2(n.x, n.z)
	position = wall_pos
	rotation.y = yaw
	var band := col(b.band)
	var ink := col(b.ink)
	var st1 := col(b.stripes[0])
	var st2 := col(b.stripes[1])
	var w := clampf(width, 5.0, 9.5)
	# fascia, the lit name board
	_box(Vector3(w, 1.25, 0.3), Vector3(0, ground_y + 3.55, 0.2), band, 0.8)
	var jp: String = b.get("jp", "")
	var title: String = b.name
	_label(title, ink, Vector3(0, ground_y + 3.85, 0.38), 0.0068 * minf(1.0, 11.0 / maxf(11.0, title.length() * 1.0)), 84)
	if jp != "":
		_label(jp, ink, Vector3(0, ground_y + 3.25, 0.38), 0.0052, 70)
	else:
		_label(b.get("tag", ""), ink, Vector3(0, ground_y + 3.25, 0.38), 0.0042, 60)
	# stripes under the fascia, as on a chain store
	_box(Vector3(w, 0.16, 0.32), Vector3(0, ground_y + 2.82, 0.2), st1, 0.8)
	_box(Vector3(w, 0.12, 0.32), Vector3(0, ground_y + 2.66, 0.2), st2, 0.8)
	# canopy
	_box(Vector3(w * 0.9, 0.08, 1.4), Vector3(0, ground_y + 2.5, 0.8), band.darkened(0.2), 0.0)
	# glass door and windows, lit from inside
	_box(Vector3(w * 0.88, 2.2, 0.12), Vector3(0, ground_y + 1.25, 0.15), Color(1.0, 0.86, 0.6), 0.4)
	_box(Vector3(1.5, 2.25, 0.16), Vector3(0, ground_y + 1.2, 0.2), Color(0.8, 0.92, 1.0), 0.55)
	for sx in [-0.75, 0.75]:
		_box(Vector3(0.06, 2.3, 0.2), Vector3(sx, ground_y + 1.2, 0.22), Color(0.08, 0.08, 0.1), 0.0)
	# the door sits a couple of metres in front of the wall
	door = global_position + n * 2.0
	door.y = 0.0

func _box(size: Vector3, pos: Vector3, c: Color, energy: float) -> void:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	var m := StandardMaterial3D.new()
	m.albedo_color = c.darkened(0.5) if energy > 0.0 else c
	if energy > 0.0:
		m.emission_enabled = true
		m.emission = c
		m.emission_energy_multiplier = energy
		SkyCycle.glowers.append([m, energy, 0.4])
	m.roughness = 0.7
	bm.material = m
	mi.mesh = bm
	mi.position = pos
	mi.visibility_range_end = 220.0
	add_child(mi)

func _label(text: String, c: Color, pos: Vector3, px: float, size: int) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.modulate = c
	l.shaded = false
	l.double_sided = false
	l.font_size = size
	l.pixel_size = px
	l.outline_size = 6
	l.outline_modulate = Color(0, 0, 0, 0.6)
	l.position = pos
	l.visibility_range_end = 160.0
	add_child(l)
	return l
