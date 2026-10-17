extends SceneTree
## Renders a few frames to PNGs. Needs a display (xvfb is fine): see README.
var out := "/tmp/godot/shots"

func _initialize() -> void:
	DirAccess.make_dir_recursive_absolute(out)
	var scene := load("res://scenes/main.tscn") as PackedScene
	var g := scene.instantiate() as Game
	g.smoke_test = true
	root.add_child(g)
	_go.call_deferred(g)

func _snap(name: String) -> void:
	await process_frame
	await process_frame
	var img := root.get_texture().get_image()
	img.save_png("%s/%s.png" % [out, name])
	print("saved ", name)

func _go(g: Game) -> void:
	for i in 60: await physics_frame
	await _snap("1_onfoot")
	var P := CityWorld.P
	# into the sports car on open road
	var v := g.parked[0]
	v.global_position = Vector3(2.0 * P - 3.0, 0.6, 5.0 * P + 40.0)
	v.global_rotation = Vector3.ZERO
	for i in 30: await physics_frame
	g.player.global_position = v.global_position + Vector3(2, 0.2, 0)
	g.enter(v)
	g.set_physics_process(false)
	v.lights_on = true
	for i in 120: 
		v.throttle = 0.8
		await physics_frame
	await _snap("2_chase")
	# a turn at speed, sliding
	for i in 80:
		v.throttle = 1.0
		v.steer_in = 0.5
		await physics_frame
	await _snap("3_turning")
	# beside the railway
	var tr: Train = g.world.trains[0]
	g.leave()
	v.throttle = 0; v.brake = 1
	g.player.global_position = Vector3(g.world.rail_x - 22.0, 0.4, 2.0 * P + 30.0)
	g.rig.snap_to_target()
	for i in 600:
		await physics_frame
		if tr.waiting <= 0.0 and tr.z > 2.0 * P - 60.0 and tr.z < 2.0 * P - 30.0: break
	g.rig.yaw = PI * 0.5
	g.rig.pitch = -0.1
	for i in 20: await physics_frame
	await _snap("4_train")
	quit()
