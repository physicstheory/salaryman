extends Node
var out := "/tmp/godot/shoot"
var g: Game
var n := 0

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(out)
	var scene := load("res://scenes/main.tscn") as PackedScene
	g = scene.instantiate() as Game
	g.smoke_test = false
	add_child(g)
	_go.call_deferred()

func sim(frames: int) -> void:
	RenderingServer.render_loop_enabled = false
	for i in frames:
		await get_tree().physics_frame
	RenderingServer.render_loop_enabled = true

func snap(name: String) -> void:
	RenderingServer.render_loop_enabled = true
	for i in 4:
		await get_tree().process_frame
	n += 1
	get_tree().root.get_texture().get_image().save_png("%s/%02d_%s.png" % [out, n, name])
	print("saved ", name)
	RenderingServer.render_loop_enabled = false

func _go() -> void:
	var gs = get_node("/root/GameState")
	await sim(60)
	await snap("title_screen")
	g._begin(false)
	var P := CityWorld.P
	# some history: a bag, a few notifications, a waypoint
	gs.give("bento", 2); gs.give("coffee", 3); gs.give("painkiller", 1); gs.give("earbuds", 1); gs.give("ramune", 2)
	gs.stress = 0.62
	gs.health = 0.74
	gs.waypoint = Vector3(5.0 * P, 0, 3.0 * P)
	gs.waypoint_name = "Aoyama Road at Akasaka Street"
	gs.say("Map", "Waypoint set", gs.waypoint_name, 30.0)
	gs.say("MyGram", "Aiko liked your photo", "Seen from the platform at Tōkonto Station", 30.0)
	gs.say("Ryde", "Your driver is 3 minutes away", "A grey Audi A7", 30.0)
	gs.say("Bag", "Katsu bento. A proper meal", "", 30.0)
	var v := g.parked[0]
	v.global_position = Vector3(2.0 * P - 3.0, 0.6, 5.0 * P + 40.0)
	v.global_rotation = Vector3.ZERO
	await sim(40)
	g.player.global_position = v.global_position + Vector3(2, 0.2, 0)
	g.enter(v)
	g.set_physics_process(false)
	for k in 160:
		v.throttle = 0.7
		RenderingServer.render_loop_enabled = false
		await get_tree().physics_frame
	await snap("hud_driving_minimap_toasts")
	g._open_map()
	await snap("full_map_waypoint")
	g.map_ui.close()
	g.pause_menu.game = g
	g._pause()
	await snap("pause_bag")
	g.pause_menu._tabs.current_tab = 1
	await snap("pause_stats")
	g.pause_menu._tabs.current_tab = 2
	await snap("pause_settings")
	g.pause_menu._tabs.current_tab = 3
	await snap("pause_controls")
	get_tree().quit()
