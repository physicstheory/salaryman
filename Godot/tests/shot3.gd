extends SceneTree
var out := "/tmp/godot/shots"
var cam: Camera3D
func _initialize() -> void:
	var scene := load("res://scenes/main.tscn") as PackedScene
	var g := scene.instantiate() as Game
	g.smoke_test = true
	root.add_child(g)
	_go.call_deferred(g)
func _snap(name: String, pos: Vector3, look: Vector3) -> void:
	cam.global_position = pos
	cam.look_at(look, Vector3.UP)
	await process_frame
	await process_frame
	root.get_texture().get_image().save_png("%s/%s.png" % [out, name])
func _go(g: Game) -> void:
	for i in 30: await physics_frame
	g.rig.set_process(false)
	cam = Camera3D.new()
	cam.fov = 50
	g.add_child(cam)
	cam.current = true
	var P := CityWorld.P
	var kinds := ["sports", "sedan", "kei", "keivan"]
	for n in 4:
		# hide everything but this car, put it on open road with a marker ahead of it
		for k in g.parked.size():
			g.parked[k].global_position = Vector3(300 + k * 40, 0.6, 250)
		var v := g.parked[n]
		var base := Vector3(2.0 * P + 3.0, 0.6, 3.0 * P + 30.0)
		v.global_position = base
		v.global_rotation = Vector3.ZERO
		for i in 60: await physics_frame
		var mk := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.4
		sm.height = 0.8
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(1, 0, 0)
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		sm.material = m
		mk.mesh = sm
		mk.global_position = base + Vector3(0, 2.5, -4.0)   # ahead of the nose, -Z
		g.add_child(mk)
		await _snap("orient_%s" % kinds[n], base + Vector3(9, 6, 2), base + Vector3(0, 0.8, -1))
		mk.queue_free()
	quit()
