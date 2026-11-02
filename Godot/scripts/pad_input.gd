class_name PadInput
extends Node
## Controller support. Walking and driving read the sticks and triggers through the input map (see Game._input_map); this node covers the rest:
## it turns the pad into the keyboard for every menu, so the shop, the phone, the map, the pause menu and the activities all work from the sofa.
##   D-pad / left stick  navigate        A  confirm        B / Start  back or pause        Y  phone        View  map
##   LB / RB  previous / next tab (zoom out / in on the map)        X  clear waypoint        right stick  look        L3  sprint
## It also rumbles on a hard crash.

var game: Game
var _held := {}
var _btn_key := {}                 # pad button -> the key it is holding down, so a release always finds it
var _stick_dir := Vector2i.ZERO
var _stick_t := 0.0

const NAV := {JOY_BUTTON_DPAD_UP: KEY_UP, JOY_BUTTON_DPAD_DOWN: KEY_DOWN, JOY_BUTTON_DPAD_LEFT: KEY_LEFT, JOY_BUTTON_DPAD_RIGHT: KEY_RIGHT}

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

func _menu_mode() -> bool:
	return game.ui_open or game.phone_open or game.title_up or game.get_tree().paused or game.map_ui.visible or game.pause_menu.visible

func _key(code: Key, pressed: bool) -> void:
	if pressed == _held.has(code):
		return
	if pressed:
		_held[code] = true
	else:
		_held.erase(code)
	var k := InputEventKey.new()
	k.keycode = code
	k.physical_keycode = code
	k.pressed = pressed
	Input.parse_input_event(k)

func _tap(code: Key) -> void:
	_key(code, true)
	_key(code, false)

func _input(e: InputEvent) -> void:
	if not (e is InputEventJoypadButton):
		return
	var b: int = e.button_index
	var down: bool = e.pressed
	if not down and _btn_key.has(b):
		# the menu may have closed while the button was down: let the key go anyway
		_key(_btn_key[b], false)
		_btn_key.erase(b)
		get_viewport().set_input_as_handled()
		return
	if b == JOY_BUTTON_START or b == JOY_BUTTON_BACK or b == JOY_BUTTON_Y:
		# pause, map and phone work from anywhere; inside a menu they close it
		if down:
			var code: Key
			if b == JOY_BUTTON_Y:
				code = KEY_P
			elif b == JOY_BUTTON_BACK:
				code = KEY_M
			else:
				code = KEY_ESCAPE
			# inside a menu Start and View back out of it; Y closes the phone it opened
			if _menu_mode() and b == JOY_BUTTON_START:
				code = KEY_ESCAPE
			_tap(code)
		get_viewport().set_input_as_handled()
		return
	if not _menu_mode():
		return
	var map := {JOY_BUTTON_A: KEY_ENTER, JOY_BUTTON_B: KEY_ESCAPE, JOY_BUTTON_X: KEY_X, JOY_BUTTON_LEFT_SHOULDER: KEY_Q, JOY_BUTTON_RIGHT_SHOULDER: KEY_E}
	if game.map_ui.visible:
		map[JOY_BUTTON_LEFT_SHOULDER] = KEY_MINUS
		map[JOY_BUTTON_RIGHT_SHOULDER] = KEY_EQUAL
	if NAV.has(b):
		_key(NAV[b], true)
		_btn_key[b] = NAV[b]
	elif map.has(b):
		_key(map[b], true)
		_btn_key[b] = map[b]
	else:
		return
	get_viewport().set_input_as_handled()

func _process(dt: float) -> void:
	var v := Vector2(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), Input.get_joy_axis(0, JOY_AXIS_LEFT_Y))
	if _menu_mode():
		# the left stick navigates like the D-pad, repeating while it is held
		var d := Vector2i.ZERO
		if v.length() > 0.6:
			d = Vector2i(signi(int(roundf(v.x))), 0) if absf(v.x) > absf(v.y) else Vector2i(0, signi(int(roundf(v.y))))
		if d != _stick_dir or (d != Vector2i.ZERO and _stick_t <= 0.0):
			for k in NAV.values():
				_key(k, false)
			if d.x < 0: _tap(KEY_LEFT)
			elif d.x > 0: _tap(KEY_RIGHT)
			elif d.y < 0: _tap(KEY_UP)
			elif d.y > 0: _tap(KEY_DOWN)
			_stick_t = 0.28 if d != _stick_dir else 0.11
			_stick_dir = d
		_stick_t -= dt
		return
	_stick_dir = Vector2i.ZERO
	# the right stick looks
	if game.rig and game.equip_wheel and not game.equip_wheel.is_open and not game.radio_wheel.is_open and not game.title_up:
		var r := Vector2(Input.get_joy_axis(0, JOY_AXIS_RIGHT_X), Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y))
		if r.length() > 0.18:
			game.rig.look(r * (r.length() - 0.18) / 0.82 * 1100.0 * dt)

func rumble(strength: float) -> void:
	if Input.get_connected_joypads().is_empty():
		return
	Input.start_joy_vibration(0, clampf(strength * 0.05, 0.0, 0.6), clampf(strength * 0.08, 0.0, 1.0), 0.28)
