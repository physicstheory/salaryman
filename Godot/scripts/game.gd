class_name Game
extends Node3D
## Boots the city, the player, the cars and the traffic, and wires the controls.

const START := Vector3(2.0 * CityWorld.P + 7.0, 0.3, 5.0 * CityWorld.P + 11.0)
const TRAFFIC := 14

var world: CityWorld
var player: Player
var rig: CamRig
var hud: Hud
var parked: Array[Vehicle] = []
var traffic: Array[Vehicle] = []
var current: Vehicle
var lights := false
var smoke_test := false
var smoke_test_mute := false
var shop_ui: ShopUI
var activity_ui: ActivityUI
var map_ui: MapUI
var phone_ui: PhoneUI
var phone_open := false
var _fade: ColorRect
var pause_menu: PauseMenu
var title_screen: TitleScreen
var title_up := false
var beam: MeshInstance3D
var equip_wheel: EquipWheel
var radio_wheel: RadioWheel
var radio: CarRadio
var pad: PadInput
var _ptr := Vector2.ZERO
var _radio_hold := -1.0
var ui_open := false
var _t := 0.0

# the 3D view is drawn into a SubViewport at a fraction of the window size and upscaled on screen,
# which keeps the HUD at full resolution and buys frame rate on weaker graphics
const SCALES := [1.0, 0.85, 0.75, 0.67, 0.5]
var stage: SubViewport
var view_layer: CanvasLayer
var view: TextureRect
var scale_index := 0
var sharpness := 0.4
var _settings_path := "user://settings.cfg"

func _ready() -> void:
	_input_map()
	_load_settings()
	_setup_stage()
	world = CityWorld.new()
	stage.add_child(world)
	world.build()
	player = Player.new()
	player.position = START
	stage.add_child(player)
	player.died.connect(_on_died)
	rig = CamRig.new()
	stage.add_child(rig)
	rig.target = player
	rig.snap_to_target()
	var layer := CanvasLayer.new()
	add_child(layer)
	layer.layer = 5
	hud = Hud.new()
	layer.add_child(hud)
	shop_ui = ShopUI.new()
	layer.add_child(shop_ui)
	shop_ui.visible = false
	shop_ui.closed.connect(_on_shop_closed)
	GameState.notice.connect(func(app: String, title: String, body: String, secs: float): hud.toast(app, title, body, secs))
	activity_ui = ActivityUI.new()
	layer.add_child(activity_ui)
	activity_ui.closed.connect(_on_shop_closed)
	map_ui = MapUI.new()
	layer.add_child(map_ui)
	map_ui.closed.connect(_on_map_closed)
	pause_menu = PauseMenu.new()
	pause_menu.game = self
	layer.add_child(pause_menu)
	pause_menu.resume.connect(_resume)
	pause_menu.open_map.connect(func(): pause_menu.visible = false; _open_map())
	pause_menu.quit_to_title.connect(_to_title)
	hud.minimap.world = world
	phone_ui = PhoneUI.new()
	phone_ui.game = self
	layer.add_child(phone_ui)
	phone_ui.closed.connect(_on_phone_closed)
	radio = CarRadio.new()
	add_child(radio)
	radio.changed.connect(func(t: String): GameState.say("Radio", t, "", 3.0))
	pad = PadInput.new()
	pad.game = self
	add_child(pad)
	equip_wheel = EquipWheel.new()
	layer.add_child(equip_wheel)
	radio_wheel = RadioWheel.new()
	radio_wheel.radio = radio
	layer.add_child(radio_wheel)
	_fade = ColorRect.new()
	_fade.color = Color(0, 0, 0, 0)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(_fade)
	_make_beam()
	if not smoke_test:
		_show_title()
	_spawn_player_cars()
	_spawn_traffic()
	if not smoke_test:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	hud.say("TŌKONTO NIGHTS", 3.0)

func _input_map() -> void:
	var add := func(action: String, keys: Array, axes: Array = []):
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.2)
		for k in keys:
			var e := InputEventKey.new()
			e.physical_keycode = k
			InputMap.action_add_event(action, e)
		for a in axes:
			var j := InputEventJoypadMotion.new()
			j.axis = a[0]
			j.axis_value = a[1]
			InputMap.action_add_event(action, j)
	add.call("move_forward", [KEY_W, KEY_UP], [[JOY_AXIS_TRIGGER_RIGHT, 1.0], [JOY_AXIS_LEFT_Y, -1.0]])
	add.call("move_back", [KEY_S, KEY_DOWN], [[JOY_AXIS_TRIGGER_LEFT, 1.0], [JOY_AXIS_LEFT_Y, 1.0]])
	add.call("move_left", [KEY_A, KEY_LEFT], [[JOY_AXIS_LEFT_X, -1.0]])
	add.call("move_right", [KEY_D, KEY_RIGHT], [[JOY_AXIS_LEFT_X, 1.0]])
	add.call("handbrake", [KEY_SPACE])
	add.call("jump", [KEY_SPACE])
	add.call("sprint", [KEY_SHIFT])
	add.call("interact", [KEY_E])
	add.call("reset_car", [KEY_T])
	add.call("lights", [KEY_L])
	add.call("hide_help", [KEY_H])
	var jb := InputEventJoypadButton.new()
	jb.button_index = JOY_BUTTON_X
	InputMap.action_add_event("interact", jb)
	var jy := InputEventJoypadButton.new()
	jy.button_index = JOY_BUTTON_RIGHT_STICK
	InputMap.action_add_event("reset_car", jy)
	var js := InputEventJoypadButton.new()
	js.button_index = JOY_BUTTON_LEFT_STICK
	InputMap.action_add_event("sprint", js)
	var jc := InputEventJoypadButton.new()
	jc.button_index = JOY_BUTTON_B
	InputMap.action_add_event("lights", jc)
	var jh := InputEventJoypadButton.new()
	jh.button_index = JOY_BUTTON_A
	InputMap.action_add_event("handbrake", jh)
	InputMap.action_add_event("jump", jh)

func _spawn_vehicle(kind: String, pos: Vector3, yaw_deg: float) -> Vehicle:
	var v := Vehicle.new()
	v.kind = kind
	v.position = pos
	v.rotation_degrees.y = yaw_deg
	stage.add_child(v)
	v.crashed.connect(func(s: float):
		if v == current:
			rig.bump(s)
			pad.rumble(s))
	return v

func _spawn_player_cars() -> void:
	var P := CityWorld.P
	var kinds := ["rsq8", "a7", "byd_song", "kei"]
	for i in kinds.size():
		# parked in the road beside the start, nose up the street
		var v := _spawn_vehicle(kinds[i], Vector3(2.0 * P + 3.0, 0.9, 5.0 * P + 4.0 - 8.0 * i), 0.0)
		parked.append(v)

func _spawn_traffic() -> void:
	var P := CityWorld.P
	var N := CityWorld.N
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	var kinds := ["a7", "byd_song", "rsq8", "kei", "keivan", "sedan"]
	for i in TRAFFIC:
		var vert := rng.randf() < 0.5
		var road := rng.randi_range(0, N)
		var along := rng.randf_range(20.0, P * N - 20.0)
		var dir := 1.0 if rng.randf() < 0.5 else -1.0
		var h := Vector3(0, 0, dir) if vert else Vector3(dir, 0, 0)
		var left := Vector3(h.z, 0, -h.x)
		var pos := Vector3(road * P, 0.9, along) + left * 3.0 if vert else Vector3(along, 0.9, road * P) + left * 3.0
		pos.y = 0.9
		# keep clear of the start and of the railway cutting
		if pos.distance_to(START) < 45.0 or absf(pos.x - world.rail_x) < 12.0:
			continue
		var yaw := rad_to_deg(atan2(-h.x, -h.z))
		var v := _spawn_vehicle(kinds[rng.randi() % kinds.size()], pos, yaw)
		v.lights_on = true
		var ai := AIDriver.new()
		v.add_child(ai)
		ai.setup(v, world, h, rng.randf_range(9.0, 14.0))
		traffic.append(v)

func nearest_vehicle(p: Vector3, max_d := 4.0) -> Vehicle:
	var best: Vehicle = null
	var bd := max_d
	for v in parked + traffic:
		var d := v.global_position.distance_to(p)
		if d < bd:
			bd = d
			best = v
	return best

func enter(v: Vehicle) -> void:
	if current:
		return
	current = v
	# take it over from the AI if it was driving itself
	for ch in v.get_children():
		if ch is AIDriver:
			ch.queue_free()
	if traffic.has(v):
		traffic.erase(v)
		parked.append(v)
	player.active = false
	player.visible = false
	player.remove_from_group("killable")
	v.add_to_group("killable")
	v.driver_present = true
	v.lights_on = lights
	v.start_engine_audio()
	rig.target = v
	rig.chase = true
	hud.vehicle = v
	hud.say("")

func leave() -> void:
	if current == null:
		return
	var v := current
	current = null
	v.driver_present = false
	v.remove_from_group("killable")
	v.throttle = 0.0
	v.brake = 0.5
	v.steer_in = 0.0
	v.handbrake = true
	var left := -v.global_transform.basis.x
	player.global_position = v.global_position + left * 2.3 + Vector3(0, 0.3 - v.spec.com_height + 0.3, 0)
	player.velocity = Vector3.ZERO
	player.visible = true
	player.active = true
	player.add_to_group("killable")
	player.cam_yaw = rig.yaw
	rig.target = player
	rig.chase = false
	hud.vehicle = null

func _on_died(reason: String) -> void:
	hud.say(reason, 3.0)
	await get_tree().create_timer(2.5).timeout
	player.revive(START)
	rig.target = player
	rig.snap_to_target()

## The nearest door you can go through: a shop's, or a vending machine.
func nearest_door(p: Vector3, r := 3.2) -> Node:
	var best: Node = null
	var bd := r
	for s in world.shops + world.vendors + world.spots:
		var d := Vector2(s.door.x - p.x, s.door.z - p.z).length()
		if d < bd:
			bd = d
			best = s
	return best

func open_shop(door: Node) -> void:
	ui_open = true
	player.active = false
	player.velocity = Vector3.ZERO
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if door.brand in ["sento", "pachinko", "karaoke", "arcade", "bench", "fishing"]:
		activity_ui.open(door.brand)
	else:
		shop_ui.open(door.brand)

func _on_shop_closed() -> void:
	ui_open = false
	player.active = true
	if not smoke_test:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	GameState.save_game()

func _unhandled_input(e: InputEvent) -> void:
	if ui_open or title_up or phone_open:
		return
	if e is InputEventKey and e.pressed and not e.echo and e.keycode == KEY_ESCAPE:
		_pause()
		return
	if e is InputEventKey and e.pressed and not e.echo and e.keycode == KEY_M:
		_open_map()
		return
	if e is InputEventKey and e.pressed and not e.echo and e.keycode == KEY_P:
		_open_phone()
		return
	if e is InputEventMouseButton and e.pressed and not smoke_test and not get_tree().paused:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	if Input.is_action_just_pressed("hide_help"):
		hud.show_help = not hud.show_help
	if Input.is_action_just_pressed("interact"):
		if current:
			if absf(current.forward_speed) < 4.0:
				leave()
		elif not player.dead:
			var door := nearest_door(player.global_position)
			if door:
				open_shop(door)
			else:
				var v := nearest_vehicle(player.global_position)
				if v and not v.wrecked:
					enter(v)
	if Input.is_action_just_pressed("lights"):
		lights = not lights
		if current:
			current.lights_on = lights
	if Input.is_action_just_pressed("reset_car") and current:
		current.reset_upright()

func _physics_process(dt: float) -> void:
	_t += dt
	if title_up:
		return
	GameState.tick(dt)
	radio.update(current != null and not smoke_test_mute)
	if _radio_hold >= 0.0 and not radio_wheel.is_open:
		_radio_hold += dt
		if _radio_hold > 0.28 and current != null:
			_ptr = Vector2.ZERO
			radio_wheel.open()
	if equip_wheel.is_open or radio_wheel.is_open:
		_wheel_stick()
	GameState.outdoors = (not current) and world.in_park(player.global_position)
	var strain := GameState.strain()
	player.speed_mult = 1.0 - 0.42 * strain
	if current and not phone_open:
		var locked := radio_wheel.is_open or equip_wheel.is_open
		var f := 0.0 if locked else Input.get_action_strength("move_forward")
		var b := 0.0 if locked else Input.get_action_strength("move_back")
		var s := 0.0 if locked else Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
		# a man at the end of his rope drives badly: he cannot hold the pedal, the wheel wanders, and he lapses
		f *= 1.0 - 0.35 * strain
		if strain > 0.2 and fmod(_t, 7.0) < 0.35 * strain:
			f *= 0.3
		s += sin(_t * 3.1) * 0.22 * strain
		current.throttle = move_toward(current.throttle, f, dt * 5.0)
		current.brake = move_toward(current.brake, b, dt * 6.0)
		var rate := 4.5 if absf(s) > 0.01 else 7.0
		current.steer_in = move_toward(current.steer_in, clampf(s, -1.0, 1.0), dt * rate)
		current.handbrake = Input.is_action_pressed("handbrake")
		hud.prompt = ""
		if current.wrecked:
			hud.prompt = "Wrecked. E to get out."
		elif absf(current.forward_speed) < 4.0:
			hud.prompt = "E: get out"
	else:
		player.cam_yaw = rig.yaw
		var door := nearest_door(player.global_position)
		var v := nearest_vehicle(player.global_position)
		if ui_open:
			hud.prompt = ""
		elif door:
			hud.prompt = "E: " + ("buy a drink" if door is VendingMachine else ("sit down" if door.brand == "bench" else ("fish" if door.brand == "fishing" else "enter " + door.shop_name)))
		else:
			hud.prompt = "E: get in" if v and not v.wrecked and not player.dead else ""

# ---- render scale and the upscaler
func _setup_stage() -> void:
	stage = SubViewport.new()
	stage.msaa_3d = Viewport.MSAA_2X
	stage.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	stage.handle_input_locally = false
	stage.audio_listener_enable_3d = true
	stage.size = _target_size()
	add_child(stage)
	view_layer = CanvasLayer.new()
	view_layer.layer = 0
	add_child(view_layer)
	view = TextureRect.new()
	view.set_anchors_preset(Control.PRESET_FULL_RECT)
	view.stretch_mode = TextureRect.STRETCH_SCALE
	view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	view.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	view.texture = stage.get_texture()
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders_upscale.gdshader")
	mat.set_shader_parameter("src", stage.get_texture())
	view.material = mat
	view_layer.add_child(view)
	_apply_upscaler()

func _target_size() -> Vector2i:
	var win := get_window().size
	var s: float = SCALES[scale_index]
	return Vector2i(maxi(int(win.x * s), 320), maxi(int(win.y * s), 180))

func _apply_upscaler() -> void:
	stage.size = _target_size()
	var mat := view.material as ShaderMaterial
	mat.set_shader_parameter("src_size", Vector2(stage.size))
	# at full scale there is nothing to resample, only the sharpen is worth having
	mat.set_shader_parameter("resample", scale_index != 0)
	mat.set_shader_parameter("sharpness", sharpness if scale_index != 0 else minf(sharpness, 0.25))

func render_info() -> String:
	var win := get_window().size
	var s: Vector2i = stage.size
	if scale_index == 0:
		return "Render %dx%d (native)   sharpen %d%%" % [s.x, s.y, int(sharpness * 100.0)]
	return "Render %dx%d, upscaled to %dx%d (%d%%)   sharpen %d%%" % [s.x, s.y, win.x, win.y, int(SCALES[scale_index] * 100.0), int(sharpness * 100.0)]

func _step_scale(d: int) -> void:
	scale_index = clampi(scale_index + d, 0, SCALES.size() - 1)
	_apply_upscaler()
	_save_settings()
	hud.say_small(render_info())

func _step_sharp() -> void:
	sharpness = fposmod(sharpness + 0.2, 1.0 + 0.0001)
	if sharpness > 1.0:
		sharpness = 0.0
	_apply_upscaler()
	_save_settings()
	hud.say_small(render_info())

func _load_settings() -> void:
	var cf := ConfigFile.new()
	if cf.load(_settings_path) == OK:
		scale_index = clampi(int(cf.get_value("video", "scale_index", 0)), 0, SCALES.size() - 1)
		sharpness = clampf(float(cf.get_value("video", "sharpness", 0.4)), 0.0, 1.0)

func _save_settings() -> void:
	var cf := ConfigFile.new()
	cf.set_value("video", "scale_index", scale_index)
	cf.set_value("video", "sharpness", sharpness)
	cf.save(_settings_path)

func _wheel_ok() -> bool:
	return not (ui_open or title_up or phone_open or get_tree().paused)

func _open_equip() -> void:
	if not _wheel_ok() or radio_wheel.is_open or equip_wheel.is_open:
		return
	_ptr = Vector2.ZERO
	equip_wheel.open()
	if current == null:
		player.active = false

func _close_equip() -> void:
	if not equip_wheel.is_open:
		return
	var line := equip_wheel.close()
	if current == null and not phone_open and not ui_open:
		player.active = true
	if line != "":
		GameState.say("Bag", line, "", 2.5)

func _radio_press() -> void:
	if not _wheel_ok() or current == null:
		return
	_radio_hold = 0.0

func _radio_release() -> void:
	if radio_wheel.is_open:
		radio_wheel.close()
	elif _radio_hold >= 0.0 and current != null:
		radio.next(1)
	_radio_hold = -1.0

func _input(e: InputEvent) -> void:
	var wheel_on := equip_wheel.is_open or radio_wheel.is_open
	# the camera lives inside the SubViewport, which does not see the window's events, so mouse look is forwarded
	if e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and rig:
		if wheel_on:
			# with a wheel up the mouse points instead of looking: nudge a virtual pointer away from the middle
			_ptr = (_ptr + (e as InputEventMouseMotion).relative / 110.0).limit_length(1.0)
			(equip_wheel if equip_wheel.is_open else radio_wheel).point(_ptr)
		else:
			rig.look((e as InputEventMouseMotion).relative)
	if e is InputEventKey and not e.echo:
		if e.pressed:
			match e.keycode:
				KEY_BRACKETLEFT: _step_scale(1)
				KEY_BRACKETRIGHT: _step_scale(-1)
				KEY_BACKSLASH: _step_sharp()
				KEY_Q: _open_equip()
				KEY_R: _radio_press()
		else:
			match e.keycode:
				KEY_Q: _close_equip()
				KEY_R: _radio_release()
	if e is InputEventJoypadButton:
		if e.button_index == JOY_BUTTON_LEFT_SHOULDER:
			if e.pressed: _open_equip()
			else: _close_equip()
		elif e.button_index == JOY_BUTTON_DPAD_LEFT and not equip_wheel.is_open:
			if e.pressed: _radio_press()
			else: _radio_release()
	if wheel_on and e.is_pressed() and not e.is_echo():
		_wheel_nav(e)
	if wheel_on and e is InputEventJoypadMotion and absf((e as InputEventJoypadMotion).axis_value) > 0.0:
		_wheel_stick()

## Arrows, the D-pad, the scroll wheel and 1-8 move around whichever wheel is up.
func _wheel_nav(e: InputEvent) -> void:
	var w: WheelBase = equip_wheel if equip_wheel.is_open else radio_wheel
	var dx := 0
	var dy := 0
	if e is InputEventKey:
		match e.keycode:
			KEY_LEFT: dx = -1
			KEY_RIGHT: dx = 1
			KEY_UP: dy = -1
			KEY_DOWN: dy = 1
			KEY_ENTER, KEY_SPACE:
				if equip_wheel.is_open: _close_equip()
				else: radio_wheel.close()
				return
			_:
				if radio_wheel.is_open and e.keycode >= KEY_1 and e.keycode <= KEY_8 and e.keycode - KEY_1 < w.count():
					w.sel = e.keycode - KEY_1
					w.queue_redraw()
				return
	elif e is InputEventJoypadButton:
		match e.button_index:
			JOY_BUTTON_DPAD_LEFT: dx = -1
			JOY_BUTTON_DPAD_RIGHT: dx = 1
			JOY_BUTTON_DPAD_UP: dy = -1
			JOY_BUTTON_DPAD_DOWN: dy = 1
			_: return
	elif e is InputEventMouseButton and equip_wheel.is_open:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP: equip_wheel.step_item(-1)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN: equip_wheel.step_item(1)
		return
	else:
		return
	if equip_wheel.is_open:
		if dx != 0: equip_wheel.step(dx)
		if dy != 0: equip_wheel.step_item(dy)
	else:
		radio_wheel.step(dx if dx != 0 else dy)
	get_viewport().set_input_as_handled()

func _wheel_stick() -> void:
	var v := Vector2(Input.get_joy_axis(0, JOY_AXIS_RIGHT_X), Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y))
	if v.length() < 0.45:
		v = Vector2(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), Input.get_joy_axis(0, JOY_AXIS_LEFT_Y))
	(equip_wheel if equip_wheel.is_open else radio_wheel).point(v)

var _last_win := Vector2i.ZERO
func _process(_dt: float) -> void:
	if title_up and rig:
		# the camera drifts slowly round the city behind the title
		rig.set_process(false)
		var a := Time.get_ticks_msec() * 0.00006
		var cx := world.W * 0.5
		var camp := Vector3(cx + cos(a) * 190.0, 70.0, cx + sin(a) * 190.0)
		rig.global_position = camp
		rig.look_at(Vector3(cx, 8.0, cx), Vector3.UP)
	if hud and hud.minimap and rig:
		var pos := current.global_position if current else player.global_position
		hud.minimap.player_pos = pos
		hud.minimap.cam_yaw = rig.yaw
		if current:
			var f := -current.global_transform.basis.z
			hud.minimap.heading = atan2(f.z, f.x)
		else:
			hud.minimap.heading = atan2(-cos(rig.yaw), -sin(rig.yaw))
		_update_waypoint()
	var w := get_window().size
	if w != _last_win:
		_last_win = w
		_apply_upscaler()

# ---- pause, map, title
func _pause() -> void:
	get_tree().paused = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	pause_menu.open_menu()

func _resume() -> void:
	pause_menu.visible = false
	get_tree().paused = false
	if not smoke_test:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _open_map() -> void:
	get_tree().paused = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var pos := current.global_position if current else player.global_position
	var heading := atan2(-cos(rig.yaw), -sin(rig.yaw))
	if current:
		var f := -current.global_transform.basis.z
		heading = atan2(f.z, f.x)
	map_ui.open(world, pos, heading)

func _on_map_closed() -> void:
	get_tree().paused = false
	if not smoke_test:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _make_beam() -> void:
	beam = MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 1.4
	cm.bottom_radius = 1.4
	cm.height = 90.0
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(1.0, 0.25, 0.55, 0.3)
	m.emission_enabled = true
	m.emission = Color(1.0, 0.25, 0.55)
	m.emission_energy_multiplier = 1.5
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cm.material = m
	beam.mesh = cm
	beam.visible = false
	stage.add_child(beam)

func _update_waypoint() -> void:
	if beam == null:
		return
	var wp := GameState.waypoint
	if wp == Vector3.INF:
		beam.visible = false
		hud.minimap.visible = true
		hud.waypoint_line = ""
		return
	var pos := current.global_position if current else player.global_position
	var d := Vector2(wp.x - pos.x, wp.z - pos.z).length()
	beam.visible = true
	beam.global_position = Vector3(wp.x, 45.0, wp.z)
	hud.waypoint_line = "%s · %d m" % [GameState.waypoint_name, int(d)]
	# arriving takes the waypoint away, as in the web build
	if d < 14.0:
		GameState.waypoint = Vector3.INF
		GameState.say("Map", "You have arrived", GameState.waypoint_name, 3.5)

func _show_title() -> void:
	title_up = true
	player.active = false
	title_screen = TitleScreen.new()
	title_screen.start_new.connect(func(): _begin(false))
	title_screen.start_continue.connect(func(): _begin(true))
	hud.get_parent().add_child(title_screen)
	hud.visible = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _begin(continue_game: bool) -> void:
	if continue_game:
		GameState.load_game()
	title_up = false
	title_screen.queue_free()
	title_screen = null
	hud.visible = true
	player.active = true
	rig.set_process(true)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _to_title() -> void:
	get_tree().paused = false
	pause_menu.visible = false
	GameState.save_game()
	if current:
		leave()
	_show_title()

func set_scale_index(i: int) -> void:
	scale_index = clampi(i, 0, SCALES.size() - 1)
	_apply_upscaler()
	_save_settings()

func set_sharpness(v: float) -> void:
	sharpness = clampf(v, 0.0, 1.0)
	_apply_upscaler()
	_save_settings()

func _open_phone() -> void:
	phone_open = true
	if current == null:
		player.active = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	phone_ui.open_phone()

func _on_phone_closed() -> void:
	phone_open = false
	if current == null:
		player.active = true
	if not smoke_test:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

## A Ryde car takes you to a place: a fade, a short ride, a fade back.
func ryde_to(pos: Vector3, place: String) -> void:
	GameState.say("Ryde", "Driver on the way", "Heading to %s" % place, 3.0)
	player.active = false
	var tw := create_tween()
	tw.tween_property(_fade, "color:a", 1.0, 0.6)
	await tw.finished
	player.global_position = Vector3(pos.x, 0.4, pos.z)
	player.velocity = Vector3.ZERO
	GameState.advance_minutes(8.0)
	GameState.add_stress(-0.02)
	rig.snap_to_target()
	await get_tree().create_timer(0.5).timeout
	var tw2 := create_tween()
	tw2.tween_property(_fade, "color:a", 0.0, 0.6)
	player.active = true
	GameState.say("Ryde", "You have arrived", place, 3.5)
