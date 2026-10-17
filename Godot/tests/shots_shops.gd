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
	var want := ["eleven", "ramen", "plaza", "dokoto", "capsule"]
	var seen := {}
	for s in g.world.shops:
		if want.has(s.brand) and not seen.has(s.brand):
			seen[s.brand] = s
	for b in want:
		if not seen.has(b):
			print("missing shop ", b)
			continue
		var s = seen[b]
		var n: Vector3 = s.out_n
		var base: Vector3 = s.global_position
		var side := Vector3(-n.z, 0, n.x)
		cam.current = true
		free_cam(base + n * 9.5 + side * 2.5 + Vector3(0, 1.7, 0), base + Vector3(0, 3.0, 0), 62)
		await snap("front_" + b)
		g.view_layer.visible = true
		g.hud.visible = true
		g.rig.cam.current = true
		g.player.global_position = s.door + Vector3(0, 0.4, 0)
		g.open_shop(s)
		await snap("counter_" + b)
		g.shop_ui.close()
		g.set_physics_process(false)
	# a vending machine
	var vm = g.world.vendors[0]
	var vn := Vector3(sin(vm.rotation.y), 0, cos(vm.rotation.y))
	cam.current = true
	free_cam(vm.global_position + vn * 5.0 + Vector3(2.0, 1.6, 0), vm.global_position + Vector3(0, 1.1, 0), 60)
	await snap("vending_machine")
	g.view_layer.visible = true
	g.hud.visible = true
	g.rig.cam.current = true
	g.player.global_position = vm.door + Vector3(0, 0.4, 0)
	g.open_shop(vm)
	await snap("counter_vending")
	g.shop_ui.close()
	# the plaza lift, then a floor
	var pz = seen.get("plaza")
	if pz:
		g.open_shop(pz)
		await snap("plaza_lift")
		g.shop_ui._item_list.select(0)
		g.shop_ui._buy(0)
		await snap("plaza_floor_shop")
		g.shop_ui.close()
	get_tree().quit()
