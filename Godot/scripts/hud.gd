class_name Hud
extends Control
## Speedometer, tach, gear, damage and prompts, drawn directly so there are no scenes to keep in step.

var vehicle: Vehicle
var prompt := ""
var banner := ""
var banner_t := 0.0
var show_help := true
var fps_text := ""
var small := ""
var small_t := 0.0
var toasts: Array = []
var minimap: MiniMap
var waypoint_line := ""
const APP_COLOURS := {"Ryde": "#12b36b", "Poodle": "#3b6ea8", "Wallet": "#2a2f38", "Camera": "#4a5058", "MyGram": "#8a2be2", "Nihon": "#157a46", "Phone": "#2f8a4c", "Mail": "#2f6fb0", "Music": "#b4365c", "Photos": "#d99a1c", "Health": "#ff2d55", "Map": "#e0457b", "Bag": "#9a6bf0", "System": "#6b7076", "Capsule": "#1d2430", "Hayabin": "#f08a2c"}
var _font: Font

func _fit() -> void:
	# sit exactly over the window; a Control under a CanvasLayer does not size itself from anchors
	position = Vector2.ZERO
	size = get_viewport().get_visible_rect().size

func _ready() -> void:
	_fit()
	get_viewport().size_changed.connect(_fit)
	minimap = MiniMap.new()
	add_child(minimap)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = ThemeDB.fallback_font

func say(t: String, secs := 3.0) -> void:
	banner = t
	banner_t = secs

func say_small(t: String, secs := 3.5) -> void:
	small = t
	small_t = secs

## A notification, shown as a toast stack above the minimap.
func toast(app: String, title: String, body: String, secs := 4.0) -> void:
	toasts.append({"app": app, "title": title, "body": body, "t": secs, "life": secs})
	while toasts.size() > 4:
		toasts.pop_front()

func _process(dt: float) -> void:
	banner_t = maxf(0.0, banner_t - dt)
	small_t = maxf(0.0, small_t - dt)
	for n in toasts:
		n.t -= dt
	toasts = toasts.filter(func(n): return n.t > 0.0)
	fps_text = "%d fps" % Engine.get_frames_per_second()
	queue_redraw()

func _txt(s: String, p: Vector2, size: int, col := Color.WHITE, align := HORIZONTAL_ALIGNMENT_LEFT) -> void:
	draw_string(_font, p + Vector2(1, 1), s, align, -1, size, Color(0, 0, 0, 0.7))
	draw_string(_font, p, s, align, -1, size, col)

func _draw() -> void:
	var sz := size
	minimap.position = Vector2(14, sz.y - 200)
	_txt(fps_text, Vector2(14, 22), 14, Color(1, 1, 1, 0.6))
	# money and the clock, top right
	_txt(GameState.yen(GameState.money), Vector2(sz.x - 20, 34), 28, Color(0.95, 0.9, 0.7), HORIZONTAL_ALIGNMENT_RIGHT)
	_txt("Day %d  %s" % [GameState.day, GameState.clock_text()], Vector2(sz.x - 20, 58), 16, Color(1, 1, 1, 0.7), HORIZONTAL_ALIGNMENT_RIGHT)
	# health and stress, bottom left: two thin bars
	for k in 2:
		var vv: float = GameState.health if k == 0 else GameState.stress
		var cc := Color(0.85, 0.28, 0.24) if k == 0 else Color(0.25, 0.55, 0.9)
		var yy := sz.y - 38.0 + k * 16.0
		draw_rect(Rect2(212, yy, 150, 9), Color(0, 0, 0, 0.55))
		draw_rect(Rect2(213, yy + 1, 148.0 * vv, 7), cc)
		_txt("HEALTH" if k == 0 else "STRESS", Vector2(370, yy + 9), 12, Color(1, 1, 1, 0.7))
	if small_t > 0.0:
		_txt(small, Vector2(14, 44), 15, Color(0.7, 0.95, 1.0, minf(1.0, small_t)))
	if vehicle:
		var c := Vector2(sz.x - 150, sz.y - 120)
		var r := 82.0
		draw_arc(c, r, deg_to_rad(135), deg_to_rad(405), 48, Color(1, 1, 1, 0.18), 7.0)
		var t := clampf(vehicle.rpm / vehicle.spec.redline, 0.0, 1.05)
		var col := Color(0.4, 0.9, 1.0) if t < 0.82 else Color(1.0, 0.35, 0.25)
		draw_arc(c, r, deg_to_rad(135), deg_to_rad(135 + 270 * t), 48, col, 7.0)
		_txt("%d" % int(absf(vehicle.speed_kmh())), c + Vector2(0, 10), 44, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
		_txt("km/h", c + Vector2(0, 34), 14, Color(1, 1, 1, 0.7), HORIZONTAL_ALIGNMENT_CENTER)
		var g := "R" if vehicle.gear == -1 else ("N" if vehicle.gear == 0 else str(vehicle.gear))
		_txt(g, c + Vector2(0, 62), 28, Color(1, 0.85, 0.3), HORIZONTAL_ALIGNMENT_CENTER)
		# damage
		var bx := sz.x - 260.0
		var by := sz.y - 24.0
		draw_rect(Rect2(bx, by, 220, 8), Color(0, 0, 0, 0.55))
		draw_rect(Rect2(bx + 1, by + 1, 218 * vehicle.health / 100.0, 6), Color(0.3, 0.85, 0.45) if vehicle.health > 35.0 else Color(0.9, 0.3, 0.25))
		var slip := 0.0
		for w in vehicle.wheels:
			slip = maxf(slip, w.slip)
		if slip > 1.2:
			_txt("SLIDING", Vector2(sz.x - 150, sz.y - 14), 13, Color(1, 0.6, 0.2), HORIZONTAL_ALIGNMENT_CENTER)
	# notification toasts above the minimap
	var ty := sz.y - 214.0
	for k in range(toasts.size() - 1, -1, -1):
		var n: Dictionary = toasts[k]
		var a := clampf(minf(n.t, 0.5) * 2.0, 0.0, 1.0)
		var h := 52.0
		ty -= h + 6.0
		draw_rect(Rect2(14, ty, 330, h), Color(0.07, 0.08, 0.11, 0.9 * a))
		draw_rect(Rect2(14, ty, 6, h), Color(APP_COLOURS.get(n.app, "#888888")))
		_txt(n.app.to_upper(), Vector2(30, ty + 17), 11, Color(1, 1, 1, 0.55 * a))
		_txt(n.title, Vector2(30, ty + 34), 16, Color(1, 1, 1, a))
		if n.body != "":
			_txt(n.body, Vector2(30, ty + 49), 12, Color(1, 1, 1, 0.7 * a))
	if waypoint_line != "":
		_txt(waypoint_line, Vector2(14, sz.y - 206.0), 14, Color(1.0, 0.5, 0.75))
	if prompt != "":
		_txt(prompt, Vector2(sz.x * 0.5, sz.y * 0.72), 22, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	if banner_t > 0.0:
		_txt(banner, Vector2(sz.x * 0.5, sz.y * 0.28), 40, Color(1, 0.3, 0.45), HORIZONTAL_ALIGNMENT_CENTER)
	if show_help:
		var lines := ["WASD / arrows: move and drive      Shift: run      Space: jump / handbrake", "E: get in or out      T: flip the car upright      L: headlights      H: hide this", "Q (hold): equipment wheel      R: radio, hold for the wheel      P: phone      M: map      Esc: pause"]
		for i in lines.size():
			_txt(lines[i], Vector2(14, 68 + i * 18), 13, Color(1, 1, 1, 0.65))
