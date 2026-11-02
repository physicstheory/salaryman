extends Node
var out := "/tmp/godot/shoot"
var g: Game
var n := 0

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(out)
	var scene := load("res://scenes/main.tscn") as PackedScene
	g = scene.instantiate() as Game
	g.smoke_test = true
	add_child(g)
	_go.call_deferred()

func snap(name: String) -> void:
	RenderingServer.render_loop_enabled = true
	for i in 4:
		await get_tree().process_frame
	n += 1
	get_tree().root.get_texture().get_image().save_png("%s/%02d_%s.png" % [out, n, name])
	print("saved ", name)
	RenderingServer.render_loop_enabled = false

func sim(frames: int) -> void:
	RenderingServer.render_loop_enabled = false
	for i in frames:
		await get_tree().physics_frame
	RenderingServer.render_loop_enabled = true

func _go() -> void:
	var gs = get_node("/root/GameState")
	await sim(60)
	gs.money = 200000
	var act: ActivityUI = g.activity_ui
	for k in ["sento", "pachinko", "karaoke", "arcade", "fishing"]:
		act.open(k)
		await snap("activity_menu_" + k)
	act.open("pachinko"); act._choose(0)
	for i in 30: act.step(0.04)
	await snap("pachinko_reels")
	act.close()
	act.open("karaoke"); act._choose(1)
	for i in 300: act.step(0.02)
	await snap("karaoke_notes")
	act.close()
	act.open("arcade"); act._choose(0)
	for i in 120: act.step(0.04)
	await snap("snake")
	act.close()
	act.open("arcade"); act._choose(1)
	for i in 40: act.step(0.02)
	await snap("breakout")
	act.close()
	act.open("fishing"); act._choose(0)
	for i in 200:
		act.step(0.02)
		if act._bite: break
	await snap("fishing_bite")
	act.close()
	# the buildings and spots outside
	var cam := Camera3D.new()
	g.add_child(cam)
	cam.current = true
	g.view_layer.visible = true
	var P := CityWorld.P
	for brand in ["sento", "pachinko", "karaoke", "arcade"]:
		for s in g.world.shops:
			if s.brand == brand:
				var n3: Vector3 = s.out_n
				cam.fov = 62
				cam.global_position = s.global_position + n3 * 9.5 + Vector3(-n3.z, 0, n3.x) * 2.5 + Vector3(0, 1.7, 0)
				cam.look_at(s.global_position + Vector3(0, 3.0, 0))
				g.hud.visible = false
				await snap("front_" + brand)
				break
	for sp in g.world.spots:
		if sp.brand == "fishing":
			cam.global_position = sp.global_position + Vector3(-14, 4, 6)
			cam.look_at(sp.global_position + Vector3(0, 1, 0))
			await snap("pier")
			break
	for sp in g.world.spots:
		if sp.brand == "bench":
			cam.global_position = sp.global_position + Vector3(3.5, 1.8, 3.5)
			cam.look_at(sp.global_position + Vector3(0, 0.6, 0))
			await snap("bench")
			break
	# the camera app's viewfinder
	g.hud.visible = true
	g.rig.cam.current = true
	g._open_phone()
	g.phone_ui.open_app("Camera")
	await snap("camera_viewfinder")
	get_tree().quit()
