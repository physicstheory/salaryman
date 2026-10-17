extends Node
var out := "/tmp/godot/shoot_road"
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
	g.rig.set_process(false)
	var P := CityWorld.P
	# a street corner from above the kerb, and a close look at the surface
	for pair in [[14.0, "day"], [22.0, "night"]]:
		g.world.sky.debug_hour = pair[0]
		g.rig.global_position = Vector3(2.0 * P + 3.0, 3.2, 5.0 * P + 38.0)
		g.rig.look_at(Vector3(2.0 * P + 3.0, 0.0, 5.0 * P - 8.0), Vector3.UP)
		await snap("road_" + pair[1] + "_view")
		g.rig.global_position = Vector3(2.0 * P + 2.0, 1.4, 5.0 * P + 12.0)
		g.rig.look_at(Vector3(2.0 * P + 3.0, 0.0, 5.0 * P + 4.0), Vector3.UP)
		await snap("road_" + pair[1] + "_close")
	get_tree().quit()
