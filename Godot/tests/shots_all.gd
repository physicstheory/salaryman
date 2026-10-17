extends Node
## A full photo shoot of the build. Needs a display (xvfb works), run with --fixed-fps 120.
var out := "/tmp/godot/shoot"
var g: Game
var cam: Camera3D
var n := 0

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(out)
	var scene := load("res://scenes/main.tscn") as PackedScene
	g = scene.instantiate() as Game
	g.smoke_test = true
	add_child(g)
	_go.call_deferred()

func sim(frames: int) -> void:
	RenderingServer.render_loop_enabled = false
	for i in frames:
		await get_tree().physics_frame
	RenderingServer.render_loop_enabled = true

func snap(name: String) -> void:
	RenderingServer.render_loop_enabled = true
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().process_frame
	n += 1
	get_tree().root.get_texture().get_image().save_png("%s/%02d_%s.png" % [out, n, name])
	print("saved ", name)
	RenderingServer.render_loop_enabled = false

func free_cam(pos: Vector3, look: Vector3, fov := 60.0, hud := false) -> void:
	g.view_layer.visible = false
	g.hud.visible = hud
	cam.fov = fov
	cam.global_position = pos
	cam.look_at(look, Vector3.UP)

func game_cam() -> void:
	g.view_layer.visible = true
	g.hud.visible = true
	cam.current = false
	g.rig.cam.current = true

func _go() -> void:
	var P := CityWorld.P
	var rx := g.world.rail_x
	await sim(90)
	cam = Camera3D.new()
	g.add_child(cam)
	print("birches placed: ", g.world.forest.count)

	# ---- through the real pipeline, native then upscaled
	await snap("onfoot_native")
	g.scale_index = 3
	g._apply_upscaler()
	await sim(2)
	await snap("onfoot_upscaled_67pct")
	g.scale_index = 4
	g.sharpness = 0.0
	g._apply_upscaler()
	g.view.material.set_shader_parameter("resample", false)
	await sim(2)
	await snap("onfoot_50pct_plain_bilinear")
	g.sharpness = 0.5
	g._apply_upscaler()
	await sim(2)
	await snap("onfoot_50pct_upscaled_sharpened")
	g.scale_index = 0
	g.sharpness = 0.4
	g._apply_upscaler()

	# ---- a car on open road, chase camera
	var kinds := ["sports", "sedan", "kei", "keivan"]
	for i in 4:
		g.parked[i].global_position = Vector3(300.0 + i * 20.0, 0.6, 250.0)
	for i in 4:
		var v := g.parked[i]
		v.global_position = Vector3(2.0 * P - 3.0, 0.6, 5.0 * P + 40.0)
		v.global_rotation = Vector3.ZERO
		v.linear_velocity = Vector3.ZERO
		await sim(40)
		g.player.global_position = v.global_position + Vector3(2, 0.2, 0)
		g.enter(v)
		g.set_physics_process(false)
		v.lights_on = true
		for k in 150:
			v.throttle = 0.7
			v.steer_in = 0.0
			RenderingServer.render_loop_enabled = false
			await get_tree().physics_frame
		await snap("chase_" + kinds[i])
		if i == 0:
			for k in 90:
				v.throttle = 1.0
				v.steer_in = 0.55
				await get_tree().physics_frame
			await snap("sports_cornering")
			v.handbrake = true
			for k in 60:
				v.throttle = 0.0
				v.steer_in = -0.6
				await get_tree().physics_frame
			v.handbrake = false
			await snap("sports_handbrake_slide")
		v.throttle = 0.0
		v.brake = 1.0
		await sim(240)
		g.leave()
		g.set_physics_process(true)
		v.brake = 0.0
		v.handbrake = false
		v.global_position = Vector3(300.0 + i * 20.0, 0.6, 250.0)
	g.set_physics_process(false)
	game_cam()

	# ---- free camera tour
	cam.current = true
	free_cam(Vector3(2.0 * P, 95, 5.0 * P + 70), Vector3(3.5 * P, 0, 3.0 * P), 62)
	await snap("overview_city")
	free_cam(Vector3(4.5 * P, 70, 3.2 * P + 55), Vector3(4.5 * P, 0, 3.5 * P), 60)
	await snap("park_aerial_birches")
	free_cam(Vector3(4.0 * P + 12, 3.0, 3.0 * P + 4), Vector3(4.5 * P, 4.0, 3.5 * P + 8), 70)
	await snap("park_birches_ground")
	free_cam(Vector3(4.0 * P + 9, 1.8, 3.0 * P + 10), Vector3(4.5 * P + 4, 6.0, 3.5 * P + 4), 75)
	await snap("park_birch_canopy_looking_up")

	# a lineup of the five trees on a clean patch of road
	var lineup := BirchForest.new()
	g.stage.add_child(lineup)
	var rng := RandomNumberGenerator.new()
	rng.seed = 3
	for i in BirchForest.VARIANTS.size():
		lineup.add(BirchForest.VARIANTS[i], Vector3(7.0 * P - 10.0 + i * 9.0, 0.0, 6.0 * P + 18.0), 0.9, 0.0, BirchForest.leaf_colour(rng), false)
	lineup.commit()
	free_cam(Vector3(7.0 * P + 8.0, 5.0, 6.0 * P + 50.0), Vector3(7.0 * P + 8.0, 4.5, 6.0 * P + 18.0), 50)
	await snap("birch_lineup_1_2_4_5_6")
	free_cam(Vector3(7.0 * P - 6.0, 3.0, 6.0 * P + 30.0), Vector3(7.0 * P - 1.0, 4.0, 6.0 * P + 18.0), 55)
	await snap("birch_closeup_bark_and_leaves")
	lineup.queue_free()

	free_cam(Vector3(1.0 * P + 7.0, 2.2, 1.0 * P + 36.0), Vector3(1.0 * P + 7.0, 3.5, 1.0 * P + 6.0), 65)
	await snap("street_trees_avenue")
	free_cam(Vector3(2.0 * P - 3.0, 1.7, 2.0 * P + 38.0), Vector3(2.0 * P - 3.0, 6.0, 2.0 * P - 20.0), 70)
	await snap("street_level_towers")
	free_cam(Vector3(5.0 * P + 14.0, 3.0, 4.0 * P + 14.0), Vector3(5.0 * P - 4.0, 5.0, 4.0 * P - 6.0), 75)
	await snap("junction_neon_signs")

	# the railway: wait for a train, then photograph the crossing, the train and the station
	g.set_physics_process(true)
	var tr: Train = g.world.trains[0]
	await sim(1)
	while not (tr.waiting <= 0.0 and tr.z > 2.0 * P - 120.0 and tr.z < 2.0 * P - 100.0):
		await sim(30)
	free_cam(Vector3(rx - 17.0, 4.5, 2.0 * P - 28.0), Vector3(rx, 3.0, 2.0 * P + 6.0), 62)
	await snap("level_crossing_barriers_down")
	await sim(300)
	free_cam(Vector3(rx - 16.0, 3.2, 2.0 * P - 20.0), Vector3(rx + 1.0, 3.0, 2.0 * P + 10.0), 60)
	await snap("train_arriving_at_crossing")
	await sim(90)
	free_cam(Vector3(rx - 13.0, 3.0, tr.z - 26.0), Vector3(rx, 3.2, tr.z), 58)
	await snap("train_side_view")
	free_cam(Vector3(rx - 30.0, 14.0, 3.0 * P + 4.0), Vector3(rx, 3.0, 3.0 * P + 30.0), 62)
	await snap("station_platforms")
	free_cam(Vector3(rx, 38.0, 1.0 * P), Vector3(rx, 0.0, 3.0 * P), 58)
	await snap("railway_cutting_aerial")
	free_cam(Vector3(8.0 * P - 6.0, 14.0, 4.0 * P), Vector3(8.0 * P + 60.0, 0.0, 4.0 * P), 70)
	await snap("harbour_edge_and_sea")
	get_tree().quit()
