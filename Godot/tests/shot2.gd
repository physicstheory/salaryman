extends SceneTree
var out := "/tmp/godot/shots"
var cam: Camera3D

func _initialize() -> void:
	DirAccess.make_dir_recursive_absolute(out)
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
	g.view_layer.visible = false
	cam = Camera3D.new()
	cam.fov = 55
	g.add_child(cam)
	cam.current = true
	var P := CityWorld.P
	# park each car on open road and photograph from the side and rear quarter
	var spots := [Vector3(2.0 * P - 3.0, 0.6, 5.0 * P + 60.0), Vector3(2.0 * P - 3.0, 0.6, 5.0 * P + 70.0)]
	var kinds := ["sports", "sedan", "kei", "keivan"]
	for n in 4:
		var v := g.parked[n]
		v.global_position = Vector3(2.0 * P + 3.0, 0.6, 3.0 * P + 20.0)
		v.global_rotation = Vector3.ZERO
		for i in 60: await physics_frame
		var c := v.global_position
		await _snap("car_%s_side" % kinds[n], c + Vector3(7, 1.4, 0), c + Vector3(0, 0.6, 0))
		await _snap("car_%s_rear" % kinds[n], c + Vector3(4, 2.0, 7), c + Vector3(0, 0.6, 0))
		v.global_position = Vector3(2.0 * P + 3.0, 0.6, 5.0 * P + 4.0 - 8.0 * n)
		for i in 5: await physics_frame
	# the train and crossing: wait until the first train is near the crossing at z = 2P
	var tr: Train = g.world.trains[0]
	for i in 3000:
		await physics_frame
		if tr.waiting <= 0.0 and tr.z > 2.0 * P - 45.0: break
	var rx := g.world.rail_x
	await _snap("train_cross", Vector3(rx - 16, 5, 2.0 * P - 26), Vector3(rx, 3, 2.0 * P + 6))
	await _snap("train_side", Vector3(rx - 12, 3, tr.z - 22), Vector3(rx, 3, tr.z))
	await _snap("station", Vector3(rx - 30, 12, 3.0 * P + 6), Vector3(rx, 3, 3.0 * P + 30))
	await _snap("overview", Vector3(2.0 * P, 90, 5.0 * P + 60), Vector3(3.5 * P, 0, 3.0 * P))
	quit()
