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

func _ready() -> void:
	_input_map()
	world = CityWorld.new()
	add_child(world)
	world.build()
	player = Player.new()
	player.position = START
	add_child(player)
	player.died.connect(_on_died)
	rig = CamRig.new()
	add_child(rig)
	rig.target = player
	rig.snap_to_target()
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Hud.new()
	layer.add_child(hud)
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
	add.call("reset_car", [KEY_R])
	add.call("lights", [KEY_L])
	add.call("hide_help", [KEY_H])
	var jb := InputEventJoypadButton.new()
	jb.button_index = JOY_BUTTON_X
	InputMap.action_add_event("interact", jb)
	var jh := InputEventJoypadButton.new()
	jh.button_index = JOY_BUTTON_A
	InputMap.action_add_event("handbrake", jh)
	InputMap.action_add_event("jump", jh)

func _spawn_vehicle(kind: String, pos: Vector3, yaw_deg: float) -> Vehicle:
	var v := Vehicle.new()
	v.kind = kind
	v.position = pos
	v.rotation_degrees.y = yaw_deg
	add_child(v)
	v.crashed.connect(func(s: float): if v == current: rig.bump(s))
	return v

func _spawn_player_cars() -> void:
	var P := CityWorld.P
	var kinds := ["sports", "sedan", "kei", "keivan"]
	for i in kinds.size():
		# parked in the road beside the start, nose up the street
		var v := _spawn_vehicle(kinds[i], Vector3(2.0 * P + 3.0, 0.9, 5.0 * P + 4.0 - 8.0 * i), 0.0)
		parked.append(v)

func _spawn_traffic() -> void:
	var P := CityWorld.P
	var N := CityWorld.N
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	var kinds := ["sedan", "sedan", "kei", "keivan"]
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

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and e.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else Input.MOUSE_MODE_CAPTURED
	elif e is InputEventMouseButton and e.pressed and not smoke_test:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	if Input.is_action_just_pressed("hide_help"):
		hud.show_help = not hud.show_help
	if Input.is_action_just_pressed("interact"):
		if current:
			if absf(current.forward_speed) < 4.0:
				leave()
		elif not player.dead:
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
	if current:
		var f := Input.get_action_strength("move_forward")
		var b := Input.get_action_strength("move_back")
		var s := Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
		current.throttle = move_toward(current.throttle, f, dt * 5.0)
		current.brake = move_toward(current.brake, b, dt * 6.0)
		var rate := 4.5 if absf(s) > 0.01 else 7.0
		current.steer_in = move_toward(current.steer_in, s, dt * rate)
		current.handbrake = Input.is_action_pressed("handbrake")
		hud.prompt = ""
		if current.wrecked:
			hud.prompt = "Wrecked. E to get out."
		elif absf(current.forward_speed) < 4.0:
			hud.prompt = "E: get out"
	else:
		player.cam_yaw = rig.yaw
		var v := nearest_vehicle(player.global_position)
		hud.prompt = "E: get in" if v and not v.wrecked and not player.dead else ""
