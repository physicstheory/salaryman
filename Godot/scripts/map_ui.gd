class_name MapUI
extends Control
## The full-screen map. Wheel zooms, right-drag or arrows pan, left-click sets a waypoint, X clears it, M or Esc closes.

signal closed

var world: CityWorld
var player_pos := Vector3.ZERO
var player_heading := 0.0
var _md := MapDraw.new()
var _zoom := 0.55
var _pan := Vector2.ZERO          # world centre
var _dragging := false
var _hover := Vector2.ZERO

func _init() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

func _fit() -> void:
	position = Vector2.ZERO
	size = get_viewport().get_visible_rect().size

func _ready() -> void:
	_fit()
	get_viewport().size_changed.connect(_fit)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false

func open(w: CityWorld, p: Vector3, heading: float) -> void:
	world = w
	player_pos = p
	player_heading = heading
	_pan = Vector2(p.x, p.z)
	_zoom = clampf((size.y - 120.0) / (CityWorld.P * CityWorld.N + 70.0), 0.5, 3.0)
	_pan = Vector2(CityWorld.P * CityWorld.N * 0.5, CityWorld.P * CityWorld.N * 0.5)
	visible = true
	queue_redraw()

func close() -> void:
	visible = false
	closed.emit()

func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton:
		var m := e as InputEventMouseButton
		if m.button_index == MOUSE_BUTTON_WHEEL_UP and m.pressed:
			_zoom = clampf(_zoom * 1.15, 0.4, 4.0)
		elif m.button_index == MOUSE_BUTTON_WHEEL_DOWN and m.pressed:
			_zoom = clampf(_zoom / 1.15, 0.4, 4.0)
		elif m.button_index == MOUSE_BUTTON_RIGHT or m.button_index == MOUSE_BUTTON_MIDDLE:
			_dragging = m.pressed
		elif m.button_index == MOUSE_BUTTON_LEFT and m.pressed:
			var w := _md.to_world(m.position)
			GameState.waypoint = Vector3(w.x, 0, w.y)
			GameState.waypoint_name = MapDraw.street_name(world, w.x, w.y)
			GameState.say("Map", "Waypoint set", GameState.waypoint_name, 3.0)
		queue_redraw()
	elif e is InputEventMouseMotion:
		var mm := e as InputEventMouseMotion
		_hover = mm.position
		if _dragging:
			_pan -= mm.relative.rotated(-_md.rot) / _md.scale
		queue_redraw()

func _unhandled_key_input(e: InputEvent) -> void:
	if not visible or not (e is InputEventKey) or not e.pressed:
		return
	match e.keycode:
		KEY_ESCAPE, KEY_M:
			close()
			get_viewport().set_input_as_handled()
		KEY_X:
			GameState.waypoint = Vector3.INF
			queue_redraw()
		KEY_LEFT: _pan.x -= 30.0 / _zoom
		KEY_RIGHT: _pan.x += 30.0 / _zoom
		KEY_UP: _pan.y -= 30.0 / _zoom
		KEY_DOWN: _pan.y += 30.0 / _zoom
		KEY_EQUAL, KEY_KP_ADD: _zoom = clampf(_zoom * 1.2, 0.25, 4.0)
		KEY_MINUS, KEY_KP_SUBTRACT: _zoom = clampf(_zoom / 1.2, 0.25, 4.0)
		KEY_C: _pan = Vector2(player_pos.x, player_pos.z)
	queue_redraw()

func _draw() -> void:
	if world == null:
		return
	_md.origin = size * 0.5
	_md.scale = _zoom
	_md.rot = 0.0
	_md.centre = _pan
	_md.draw(self, world, true)
	_md.draw_marker(self, player_pos.x, player_pos.z, player_heading, Color(1, 0.9, 0.2), 10.0)
	_md.draw_waypoint(self, GameState.waypoint)
	var f := ThemeDB.fallback_font
	# header and the line under the cursor
	draw_rect(Rect2(0, 0, size.x, 44), Color(0, 0, 0, 0.6))
	draw_string(f, Vector2(20, 29), "TŌKONTO", HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color(1, 1, 1))
	var w := _md.to_world(_hover)
	draw_string(f, Vector2(160, 29), MapDraw.street_name(world, w.x, w.y), HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(0.7, 0.9, 1.0))
	var near := _nearest_shop(w)
	if near != "":
		draw_string(f, Vector2(size.x * 0.5, 29), near, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(1, 0.9, 0.5))
	draw_string(f, Vector2(size.x - 20, 29), "wheel zoom · right-drag pan · click waypoint · X clear · C centre · M close", HORIZONTAL_ALIGNMENT_RIGHT, -1, 14, Color(1, 1, 1, 0.65))
	# legend
	var shown := {}
	var y := 70.0
	draw_rect(Rect2(14, 54, 190, 230), Color(0, 0, 0, 0.55))
	for s in world.shops:
		if shown.has(s.brand):
			continue
		shown[s.brand] = true
		var b: Dictionary = GameData.brand(s.brand)
		draw_circle(Vector2(30, y - 5), 7, Color(b.band))
		draw_circle(Vector2(30, y - 5), 3, Color(b.stripes[0]))
		draw_string(f, Vector2(46, y), b.name, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(1, 1, 1, 0.85))
		y += 19.0
	draw_circle(Vector2(30, y - 5), 4, Color(0.85, 0.3, 0.25))
	draw_string(f, Vector2(46, y), "Vending machine", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(1, 1, 1, 0.85))
	if GameState.waypoint != Vector3.INF:
		var d := Vector2(GameState.waypoint.x - player_pos.x, GameState.waypoint.z - player_pos.z).length()
		draw_string(f, Vector2(size.x * 0.5, size.y - 22), "Waypoint: %s · %d m away" % [GameState.waypoint_name, int(d)], HORIZONTAL_ALIGNMENT_CENTER, -1, 20, Color(1, 0.5, 0.75))

func _nearest_shop(w: Vector2) -> String:
	var best := ""
	var bd := 14.0 / maxf(_zoom, 0.3)
	for s in world.shops:
		var d := Vector2(s.door.x - w.x, s.door.z - w.y).length()
		if d < bd:
			bd = d
			best = s.shop_name
	return best
