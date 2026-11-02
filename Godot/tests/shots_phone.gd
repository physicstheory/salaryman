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
	gs.give("earbuds", 1)
	gs.wearing = "earbuds"
	gs.say("MyGram", "Aiko liked your photo", "Seen from the platform", 20.0)
	g._open_phone()
	await snap("phone_home")
	for pair in [["Ryde", "phone_ryde"], ["Wallet", "phone_wallet"], ["MyGram", "phone_mygram"], ["Nihon", "phone_nihon"], ["Mail", "phone_mail"], ["Music", "phone_music"], ["Contacts", "phone_contacts"], ["Settings", "phone_settings"], ["Camera", "phone_camera"]]:
		g.phone_ui.open_app(pair[0])
		await snap(pair[1])
	g.phone_ui.open_app("Poodle")
	await snap("phone_poodle")
	g.phone_ui._site(GameData.raw.web[0])
	await snap("phone_poodle_11eleven")
	g.phone_ui._back()
	g.phone_ui._site(GameData.raw.web[2])
	await snap("phone_poodle_dokoto")
	get_tree().quit()
