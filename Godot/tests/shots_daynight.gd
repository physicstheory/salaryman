extends Node
## One street corner and one aerial view at eight times of day.
var out := "/tmp/godot/shoot_day"
var g: Game
var n := 0

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(out)
	g = (load("res://scenes/main.tscn") as PackedScene).instantiate() as Game
	g.smoke_test = true
	g.smoke_test_mute = true
	add_child(g)
	_go.call_deferred()

func sim(frames: int) -> void:
	RenderingServer.render_loop_enabled = false
	for i in frames:
		await get_tree().physics_frame
	RenderingServer.render_loop_enabled = true

func snap(name: String) -> void:
	RenderingServer.render_loop_enabled = true
	for i in 6:
		await get_tree().process_frame
	n += 1
	get_tree().root.get_texture().get_image().save_png("%s/%02d_%s.png" % [out, n, name])
	print("saved ", name)
	RenderingServer.render_loop_enabled = false

func _go() -> void:
	await sim(60)
	g.hud.visible = false
	for h in [6.2, 8.5, 12.5, 17.1, 18.4, 19.5, 22.0, 3.0]:
		g.world.sky.debug_hour = h
		await snap("street_%04.1f" % h)
	# an aerial
	g.rig.set_process(false)
	g.title_up = true
	var c := g.world.W * 0.5
	for h in [13.0, 18.3, 23.0]:
		g.world.sky.debug_hour = h
		g.rig.global_position = Vector3(c + 120.0, 85.0, c + 260.0)
		g.rig.look_at(Vector3(c, 10.0, c - 30.0), Vector3.UP)
		await snap("aerial_%04.1f" % h)
	get_tree().quit()
