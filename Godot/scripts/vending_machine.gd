class_name VendingMachine
extends Node3D
## A drinks machine on the pavement. Press E beside it to buy; the stock is the web build's.
var door := Vector3.ZERO
var brand := "vending"
var shop_name := "Jihanki"

func build(pos: Vector3, yaw: float) -> void:
	position = pos
	rotation.y = yaw
	var body := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.95, 1.95, 0.8)
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.78, 0.2, 0.17)
	m.roughness = 0.5
	bm.material = m
	body.mesh = bm
	body.position.y = 0.975
	add_child(body)
	var glow := MeshInstance3D.new()
	var gm := BoxMesh.new()
	gm.size = Vector3(0.78, 1.1, 0.05)
	var g := StandardMaterial3D.new()
	g.albedo_color = Color(0.2, 0.3, 0.35)
	g.emission_enabled = true
	g.emission = Color(0.7, 0.95, 1.0)
	g.emission_energy_multiplier = 1.2
	SkyCycle.glowers.append([g, 1.2, 0.5])
	gm.material = g
	glow.mesh = gm
	glow.position = Vector3(0, 1.15, 0.42)
	add_child(glow)
	var l := Label3D.new()
	l.text = "自動販売機"
	l.modulate = Color.WHITE
	l.shaded = false
	l.font_size = 60
	l.pixel_size = 0.0075
	l.position = Vector3(0, 1.85, 0.42)
	l.visibility_range_end = 60.0
	add_child(l)
	# a collider so nobody walks through it
	var sb := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = Vector3(0.95, 1.95, 0.8)
	cs.shape = sh
	cs.position.y = 0.975
	sb.add_child(cs)
	add_child(sb)
	door = global_position + Vector3(sin(yaw), 0, cos(yaw)) * 1.3
	door.y = 0.0
