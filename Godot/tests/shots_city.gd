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

	cam.current = true
	g.set_physics_process(false)
	free_cam(Vector3(2.0 * P, 95, 5.0 * P + 70), Vector3(3.5 * P, 0, 3.0 * P), 62)
	await snap("city_overview")
	free_cam(Vector3(2.0 * P - 3.0, 1.7, 2.0 * P + 38.0), Vector3(2.0 * P - 3.0, 7.0, 2.0 * P - 20.0), 70)
	await snap("street_level_signs")
	free_cam(Vector3(5.0 * P + 14.0, 3.0, 4.0 * P + 14.0), Vector3(5.0 * P - 4.0, 6.0, 4.0 * P - 6.0), 75)
	await snap("junction_ads")
	free_cam(Vector3(1.0 * P + 8.0, 2.0, 1.0 * P + 40.0), Vector3(1.0 * P + 8.0, 9.0, 1.0 * P + 6.0), 65)
	await snap("avenue_blade_signs")
	free_cam(Vector3(6.0 * P - 2.0, 18.0, 6.0 * P + 40.0), Vector3(6.0 * P + 6.0, 16.0, 6.0 * P), 60)
	await snap("rooftop_billboards")
	free_cam(Vector3(3.0 * P - 20.0, 2.5, 7.0 * P + 20.0), Vector3(3.0 * P + 6.0, 10.0, 7.0 * P + 6.0), 80)
	await snap("towers_from_pavement")
	free_cam(Vector3(7.0 * P - 4.0, 55, 2.0 * P - 30.0), Vector3(5.5 * P, 0, 3.0 * P), 66)
	await snap("downtown_aerial")
	free_cam(Vector3(2.0 * P + 6.0, 4.0, 3.0 * P + 14.0), Vector3(2.0 * P + 6.0, 8.0, 3.0 * P - 6.0), 85)
	await snap("shopfronts_close")
	get_tree().quit()
