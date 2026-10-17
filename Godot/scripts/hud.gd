class_name Hud
extends Control
## Speedometer, tach, gear, damage and prompts, drawn directly so there are no scenes to keep in step.

var vehicle: Vehicle
var prompt := ""
var banner := ""
var banner_t := 0.0
var show_help := true
var fps_text := ""
var _font: Font

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = ThemeDB.fallback_font

func say(t: String, secs := 3.0) -> void:
	banner = t
	banner_t = secs

func _process(dt: float) -> void:
	banner_t = maxf(0.0, banner_t - dt)
	fps_text = "%d fps" % Engine.get_frames_per_second()
	queue_redraw()

func _txt(s: String, p: Vector2, size: int, col := Color.WHITE, align := HORIZONTAL_ALIGNMENT_LEFT) -> void:
	draw_string(_font, p + Vector2(1, 1), s, align, -1, size, Color(0, 0, 0, 0.7))
	draw_string(_font, p, s, align, -1, size, col)

func _draw() -> void:
	var sz := size
	_txt(fps_text, Vector2(14, 22), 14, Color(1, 1, 1, 0.6))
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
	if prompt != "":
		_txt(prompt, Vector2(sz.x * 0.5, sz.y * 0.72), 22, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	if banner_t > 0.0:
		_txt(banner, Vector2(sz.x * 0.5, sz.y * 0.28), 40, Color(1, 0.3, 0.45), HORIZONTAL_ALIGNMENT_CENTER)
	if show_help:
		var lines := ["WASD / arrows: move and drive      Shift: run      Space: jump / handbrake", "E: get in or out      R: flip the car upright      L: headlights      H: hide this", "Mouse: look      Esc: release the mouse"]
		for i in lines.size():
			_txt(lines[i], Vector2(14, sz.y - 62 + i * 20), 14, Color(1, 1, 1, 0.75))
