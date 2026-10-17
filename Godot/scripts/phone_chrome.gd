class_name PhoneChrome
extends Control
## The handset itself: the body in its colour, the bezel, the cut-out (punch-hole, notch, island), the status bar and what runs along the bottom.
## It is drawn from the same catalogue entry the web build uses (top / nav / ui / colours), so each brand reads as its own phone.
## One instance sits behind the screen (the body) and one in front of it (bezel, cut-out, status, keys).

signal key(name: String)

var dev: Dictionary = {}
var paint := 0
var front := false
var lay: Dictionary = {}
var keys: Dictionary = {}          # name -> Rect2, the parts that can be pressed
var music := false

static func is_basic(d: Dictionary) -> bool:
	return d.get("ui", "") == "basic"

static func layout(d: Dictionary) -> Dictionary:
	if is_basic(d):
		return {"bw": 312.0, "bh": 680.0, "screen": Rect2(30, 84, 252, 290), "status": 22.0, "nav": 20.0, "bez": 5.0, "r": 54.0}
	var inch := float(String(d.get("screen", "6.1\"")).replace("\"", ""))
	var bw := 318.0 + (inch - 6.1) * 12.0
	var top := String(d.get("top", "punch"))
	var status := {"punch": 28.0, "notch": 32.0, "island": 40.0, "island2": 38.0}.get(top, 28.0) as float
	var nav := 30.0 if d.get("nav", "bar") == "buttons" else 20.0
	var bez := 6.0 if d.get("flat", false) else 7.0
	return {"bw": bw, "bh": 680.0, "screen": Rect2(bez, bez, bw - bez * 2.0, 680.0 - bez * 2.0), "status": status, "nav": nav, "bez": bez, "r": 30.0 if d.get("flat", false) else 46.0}

func shell() -> Color:
	if is_basic(dev):
		return Color(String(dev.get("body", ["#0d7a4c", "#08492d"])[0]))
	var cols: Array = dev.get("colours", [["", "#6a6f77"]])
	return Color(String(cols[clampi(paint, 0, cols.size() - 1)][1]))

func _sb(c: Color, r: float, border := Color(0, 0, 0, 0), bw := 0, fill := true) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = c
	s.draw_center = fill
	s.set_corner_radius_all(int(r))
	s.anti_aliasing = true
	if bw > 0:
		s.border_color = border
		s.set_border_width_all(bw)
	return s

func _has_point(p: Vector2) -> bool:
	if not front:
		return false
	for k in keys:
		if (keys[k] as Rect2).has_point(p):
			return true
	return false

func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		for k in keys:
			if (keys[k] as Rect2).has_point(e.position):
				key.emit(k)
				accept_event()
				return

func _draw() -> void:
	if dev.is_empty():
		return
	lay = layout(dev)
	var bw: float = lay.bw
	var bh: float = lay.bh
	var r: float = lay.r
	var sr: Rect2 = lay.screen
	var basic := is_basic(dev)
	if not front:
		_draw_body(bw, bh, r, basic)
		return
	keys.clear()
	var f := ThemeDB.fallback_font
	if basic:
		# the glass sits in a black surround, with the speaker slot and the maker's name above it
		draw_style_box(_sb(Color(0, 0, 0, 0), 16.0, Color.BLACK, 6, false), Rect2(sr.position - Vector2(6, 6), sr.size + Vector2(12, 12)))
		draw_rect(Rect2(bw * 0.5 - 30, 28, 60, 5), Color(0, 0, 0, 0.55))
		var nm := "11 PHONE" if dev.id == "eleven" else "PETO"
		draw_string(f, Vector2(0, 58), nm, HORIZONTAL_ALIGNMENT_CENTER, bw, 15, Color.WHITE)
		_status(sr, "11 Mobile" if dev.id == "eleven" else "Peto Link")
		_keypad(bw)
		return
	# bezel: a ring in near-black that rounds the screen's corners
	draw_style_box(_sb(Color(0, 0, 0, 0), r - 1.0, Color(0.02, 0.02, 0.03), int(lay.bez), false), Rect2(0, 0, bw, bh))
	draw_style_box(_sb(Color(0, 0, 0, 0), r, Color(1, 1, 1, 0.28), 1, false), Rect2(0.5, 0.5, bw - 1, bh - 1))
	_status(sr, "5G")
	var top := String(dev.get("top", "punch"))
	var cx := bw * 0.5
	match top:
		"punch":
			draw_circle(Vector2(cx, sr.position.y + 14), 5.5, Color.BLACK)
			draw_circle(Vector2(cx, sr.position.y + 14), 2.0, Color(0.1, 0.12, 0.2))
		"notch":
			var w := bw * 0.4
			draw_style_box(_sb(Color.BLACK, 16.0), Rect2(cx - w * 0.5, sr.position.y - 18, w, 18 + 24))
			draw_style_box(_sb(Color(0.16, 0.16, 0.18), 3.0), Rect2(cx - 22, sr.position.y + 6, 44, 5))
			draw_circle(Vector2(cx + 28, sr.position.y + 9), 3.5, Color(0.08, 0.08, 0.14))
		"island", "island2":
			var w := 92.0 if top == "island" else 74.0
			var h := 26.0 if top == "island" else 21.0
			draw_style_box(_sb(Color.BLACK, h * 0.5), Rect2(cx - w * 0.5, sr.position.y + 9, w, h))
			if music:
				draw_style_box(_sb(Color("#5a3fb0"), 4.0), Rect2(cx - w * 0.5 + 6, sr.position.y + 12, h - 6, h - 6))
				for i in 4:
					var hh := 4.0 + float((i * 5 + int(Time.get_ticks_msec() / 120.0)) % 9)
					draw_rect(Rect2(cx + w * 0.5 - 26 + i * 6, sr.position.y + 9 + h * 0.5 - hh * 0.5, 3, hh), Color("#ff4a6a"))
	# the bottom of the glass
	var by: float = sr.position.y + sr.size.y
	if dev.get("nav", "bar") == "buttons":
		var ink := Color(1, 1, 1, 0.9)
		var ny := by - 15.0
		for i in 3:
			draw_line(Vector2(cx - 70 + i * 4.5, ny - 6), Vector2(cx - 70 + i * 4.5, ny + 6), ink, 1.8, true)
		draw_arc(Vector2(cx, ny), 7.0, 0, TAU, 20, ink, 1.8, true)
		draw_polyline(PackedVector2Array([Vector2(cx + 74, ny - 7), Vector2(cx + 66, ny), Vector2(cx + 74, ny + 7)]), ink, 1.8, true)
		keys["recents"] = Rect2(cx - 90, ny - 14, 40, 28)
		keys["home"] = Rect2(cx - 20, ny - 14, 40, 28)
		keys["back"] = Rect2(cx + 50, ny - 14, 40, 28)
	else:
		draw_style_box(_sb(Color(1, 1, 1, 0.88), 2.0), Rect2(cx - 54, by - 11, 108, 4))
		keys["home"] = Rect2(cx - 60, by - 18, 120, 18)

func _draw_body(bw: float, bh: float, r: float, basic: bool) -> void:
	var c := shell()
	if basic:
		var c2 := Color(String(dev.get("body", ["#0d7a4c", "#08492d"])[1]))
		# a rounded body in two tones: the top colour fading into the bottom one
		draw_style_box(_sb(c2, r), Rect2(0, 0, bw, bh))
		draw_style_box(_sb(c, r), Rect2(0, 0, bw, bh * 0.5))
		draw_polygon(PackedVector2Array([Vector2(0, bh * 0.5), Vector2(bw, bh * 0.5), Vector2(bw, bh - r * 0.5), Vector2(0, bh - r * 0.5)]), PackedColorArray([c, c, c2, c2]))
		draw_style_box(_sb(c2, r), Rect2(0, bh - r * 1.2, bw, r * 1.2))
		draw_style_box(_sb(Color(0, 0, 0, 0), r, Color(1, 1, 1, 0.5), 3, false), Rect2(0, 0, bw, bh))
		return
	# a metal frame, lighter on the left where the light hits it, and the colour inside
	draw_style_box(_sb(c.lerp(Color.WHITE, 0.34), r), Rect2(0, 0, bw, bh))
	draw_style_box(_sb(c, r - 2.0), Rect2(2, 2, bw - 4, bh - 4))
	draw_style_box(_sb(c.lerp(Color.BLACK, 0.5), r - 3.0), Rect2(4, 4, bw - 8, bh - 8))
	# side keys
	draw_rect(Rect2(bw - 1, 150, 3, 56), c.lerp(Color.WHITE, 0.2))
	draw_rect(Rect2(bw - 1, 220, 3, 56), c.lerp(Color.WHITE, 0.2))

func _status(sr: Rect2, carrier: String) -> void:
	var f := ThemeDB.fallback_font
	var y := sr.position.y + 19.0
	var ink := Color.WHITE
	var top := String(dev.get("top", "none"))
	var left := sr.position.x + (22.0 if top == "notch" or top.begins_with("island") else 14.0)
	draw_string(f, Vector2(left, y), GameState.clock_text(), HORIZONTAL_ALIGNMENT_LEFT, -1, 13 if not is_basic(dev) else 11, ink)
	var rx := sr.end.x - 12.0
	# battery
	draw_style_box(_sb(Color(0, 0, 0, 0), 3.0, Color(1, 1, 1, 0.75), 1, false), Rect2(rx - 22, y - 10, 22, 11))
	draw_rect(Rect2(rx - 20, y - 8, 15, 7), ink)
	draw_rect(Rect2(rx + 1, y - 7, 2, 5), Color(1, 1, 1, 0.7))
	# signal
	var sx := rx - 56.0
	for i in 4:
		draw_rect(Rect2(sx + i * 5.0, y - 3.0 - i * 2.5, 3.0, 3.0 + i * 2.5), ink)
	if top == "punch" or is_basic(dev):
		draw_string(f, Vector2(sx - 6 - f.get_string_size(carrier, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x, y), carrier, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, ink)

func _keypad(bw: float) -> void:
	var f := ThemeDB.fallback_font
	var accent := Color(String(dev.get("accent", "#e8711a")))
	var shellc := shell()
	var dark := Color(String(dev.get("body", ["#0d7a4c", "#08492d"])[1]))
	var x0 := 26.0
	var kw := (bw - 52.0 - 20.0) / 3.0
	draw_line(Vector2(x0 - 6, 398), Vector2(bw - x0 + 6, 398), Color(0, 0, 0, 0.35), 1.0)
	var y := 410.0
	var soft := [["MENU", "home", shellc.lerp(Color.WHITE, 0.12)], ["OK", "ok", accent], ["BACK", "back", shellc.lerp(Color.WHITE, 0.12)]]
	for i in 3:
		var rc := Rect2(x0 + i * (kw + 10.0), y, kw, 28)
		draw_style_box(_sb(soft[i][2], 8.0, Color(0, 0, 0, 0.3), 1), rc)
		var ink := Color.WHITE if soft[i][1] != "ok" or accent != Color.WHITE else Color("#0e4f9a")
		draw_string(f, Vector2(rc.position.x, rc.position.y + 19), soft[i][0], HORIZONTAL_ALIGNMENT_CENTER, rc.size.x, 12, ink)
		keys[soft[i][1]] = rc
	y += 36.0
	var row2 := [["CALL", "call", Color("#2cb860")], ["C", "clear", shellc.lerp(Color.WHITE, 0.08)], ["END", "end", Color("#cf2027")]]
	for i in 3:
		var rc := Rect2(x0 + i * (kw + 10.0), y, kw, 28)
		draw_style_box(_sb(row2[i][2], 8.0, Color(0, 0, 0, 0.3), 1), rc)
		draw_string(f, Vector2(rc.position.x, rc.position.y + 19), row2[i][0], HORIZONTAL_ALIGNMENT_CENTER, rc.size.x, 12, Color.WHITE)
		keys[row2[i][1]] = rc
	y += 38.0
	var digits := [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]]
	for i in 12:
		var rc := Rect2(x0 + (i % 3) * (kw + 10.0), y + (i / 3) * 40.0, kw, 34)
		draw_style_box(_sb(Color("#f3efe6"), 8.0, Color(0, 0, 0, 0.25), 1), rc)
		draw_string(f, Vector2(rc.position.x + 10, rc.position.y + 24), digits[i][0], HORIZONTAL_ALIGNMENT_LEFT, -1, 20, dark)
		draw_string(f, Vector2(rc.position.x, rc.position.y + 22), digits[i][1], HORIZONTAL_ALIGNMENT_RIGHT, rc.size.x - 8, 8, Color(0.4, 0.4, 0.4))
