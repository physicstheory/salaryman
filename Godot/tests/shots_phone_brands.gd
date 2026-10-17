extends Node
var out := "/tmp/godot/shoot_brands"
var g: Game
var n := 0

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(out)
	g = (load("res://scenes/main.tscn") as PackedScene).instantiate() as Game
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
	for i in 4:
		await get_tree().process_frame
	n += 1
	get_tree().root.get_texture().get_image().save_png("%s/%02d_%s.png" % [out, n, name])
	print("saved ", name)
	RenderingServer.render_loop_enabled = false

func _go() -> void:
	var gs = get_node("/root/GameState")
	await sim(60)
	for id in ["so24", "so26u", "p15", "p16pm", "p17", "eleven", "petmart"]:
		gs.device = id
		gs.phone_paint = 0
		g._open_phone()
		g.phone_ui.go_home()
		await snap("home_" + id)
		g.phone_ui.close_phone()
		g.phone_open = false
	gs.device = "p16pm"
	gs.phone_paint = 2
	g._open_phone()
	g.phone_ui.open_app("Settings")
	await snap("settings_p16pm")
	get_tree().quit()
