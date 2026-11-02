extends Node
var out := "/tmp/godot/shoot_wheels"
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
	for i in 4:
		await get_tree().process_frame
	n += 1
	get_tree().root.get_texture().get_image().save_png("%s/%02d_%s.png" % [out, n, name])
	print("saved ", name)
	RenderingServer.render_loop_enabled = false

func _go() -> void:
	var gs = get_node("/root/GameState")
	await sim(60)
	for it in GameData.raw.items:
		if it.cat in ["food", "drink", "med"]:
			gs.give(it.id, 1 + (hash(it.id) % 3))
	for id in ["umbrella", "baton", "pistol", "earbuds", "headphones"]:
		gs.give(id, 1)
	gs.owned["p16"] = true
	gs.owned["blockfall"] = true
	gs.owned["snakerun"] = true
	gs.owned["heron"] = true
	g.equip_wheel.sel = 5
	g._open_equip()
	g.equip_wheel._fade = 1.0
	await snap("wheel_equipment_food")
	g.equip_wheel.sel = 2
	await snap("wheel_equipment_phones")
	g.equip_wheel.sel = 0
	await snap("wheel_equipment_hands")
	g._close_equip()
	await sim(20)
	g.enter(g.parked[0])
	await sim(30)
	g.radio_wheel.sel = 2
	g._radio_press()
	g.radio_wheel.open()
	g.radio_wheel.sel = 2
	g.radio_wheel._fade = 1.0
	await snap("wheel_radio_kpop")
	g.radio_wheel.sel = 5
	await snap("wheel_radio_talk")
	g.radio_wheel.sel = 7
	await snap("wheel_radio_off")
	g._radio_release()
	get_tree().quit()
