extends Node
## Drives the game with controller events only, and checks that the menus, the wheels and the sticks answer.
var g: Game
var fails := 0

func _ready() -> void:
	g = (load("res://scenes/main.tscn") as PackedScene).instantiate() as Game
	g.smoke_test = true
	g.smoke_test_mute = true
	add_child(g)
	_go.call_deferred()

func check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		fails += 1

func btn(b: int, pressed: bool) -> void:
	var e := InputEventJoypadButton.new()
	e.button_index = b
	e.pressed = pressed
	Input.parse_input_event(e)

func tap(b: int) -> void:
	btn(b, true)
	await get_tree().physics_frame
	btn(b, false)
	await get_tree().physics_frame
	await get_tree().physics_frame

func axis(a: int, v: float) -> void:
	var e := InputEventJoypadMotion.new()
	e.axis = a
	e.axis_value = v
	Input.parse_input_event(e)

func _go() -> void:
	for i in 30:
		await get_tree().physics_frame
	var p0 := g.player.global_position
	axis(JOY_AXIS_LEFT_Y, -1.0)
	for i in 60:
		await get_tree().physics_frame
	axis(JOY_AXIS_LEFT_Y, 0.0)
	check(g.player.global_position.distance_to(p0) > 1.0, "left stick walks (moved %.1f m)" % g.player.global_position.distance_to(p0))
	var yaw0 := g.rig.yaw
	axis(JOY_AXIS_RIGHT_X, 1.0)
	for i in 30:
		await get_tree().physics_frame
	axis(JOY_AXIS_RIGHT_X, 0.0)
	check(absf(g.rig.yaw - yaw0) > 0.2, "right stick looks (yaw %.2f -> %.2f)" % [yaw0, g.rig.yaw])
	await tap(JOY_BUTTON_START)
	check(g.pause_menu.visible, "Start opens the pause menu")
	await tap(JOY_BUTTON_RIGHT_SHOULDER)
	check(g.pause_menu._tabs.current_tab == 1, "RB next tab (%d)" % g.pause_menu._tabs.current_tab)
	await tap(JOY_BUTTON_B)
	check(not g.pause_menu.visible, "B resumes")
	await tap(JOY_BUTTON_BACK)
	check(g.map_ui.visible, "View opens the map")
	await tap(JOY_BUTTON_DPAD_RIGHT)
	await tap(JOY_BUTTON_A)
	check(GameState.waypoint != Vector3.INF, "A sets a waypoint from the crosshair")
	await tap(JOY_BUTTON_B)
	check(not g.map_ui.visible, "B closes the map")
	await tap(JOY_BUTTON_Y)
	check(g.phone_open, "Y opens the phone")
	await tap(JOY_BUTTON_A)
	check(g.phone_ui.app != "", "A opens the focused app (%s)" % g.phone_ui.app)
	await tap(JOY_BUTTON_B)
	check(g.phone_ui.app == "", "B goes back to the home screen")
	await tap(JOY_BUTTON_Y)
	check(not g.phone_open, "Y closes the phone")
	btn(JOY_BUTTON_LEFT_SHOULDER, true)
	await get_tree().physics_frame
	check(g.equip_wheel.is_open, "LB holds the equipment wheel up")
	await tap(JOY_BUTTON_DPAD_RIGHT)
	btn(JOY_BUTTON_LEFT_SHOULDER, false)
	await get_tree().physics_frame
	check(not g.equip_wheel.is_open, "letting go closes it")
	g.enter(g.parked[0])
	for i in 30:
		await get_tree().physics_frame
	var st0 := g.radio.st
	await tap(JOY_BUTTON_DPAD_LEFT)
	check(g.radio.st != st0, "D-pad left taps to the next station (%d -> %d)" % [st0, g.radio.st])
	btn(JOY_BUTTON_DPAD_LEFT, true)
	for i in 50:
		await get_tree().physics_frame
	check(g.radio_wheel.is_open, "holding D-pad left opens the radio wheel")
	axis(JOY_AXIS_RIGHT_X, 1.0)
	await get_tree().physics_frame
	await get_tree().physics_frame
	axis(JOY_AXIS_RIGHT_X, 0.0)
	var sel := g.radio_wheel.sel
	btn(JOY_BUTTON_DPAD_LEFT, false)
	await get_tree().physics_frame
	await get_tree().physics_frame
	check(not g.radio_wheel.is_open and g.radio.st == sel, "letting go tunes the station under the stick (%d)" % sel)
	print("PAD TEST ", "PASSED" if fails == 0 else "FAILED (%d)" % fails)
	get_tree().quit(fails)
