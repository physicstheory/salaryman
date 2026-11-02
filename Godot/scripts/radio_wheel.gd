class_name RadioWheel
extends WheelBase
## Hold R in a car: a ring of stations, each with its logo and what it is playing, and the one you point at in the middle.
## The mouse, a stick, the arrows or 1-8 pick; letting go tunes it.

var radio: CarRadio
var _logos: Dictionary = {}

func count() -> int:
	return radio.stations().size()

func open() -> void:
	is_open = true
	visible = true
	sel = radio.st
	queue_redraw()

func close() -> void:
	if not is_open:
		return
	is_open = false
	if sel != radio.st:
		radio.set_station(sel)

func _logo(id: String) -> Texture2D:
	if not _logos.has(id):
		var p := "res://assets/radio/%s.jpg" % id
		_logos[id] = load(p) if ResourceLoader.exists(p) else null
	return _logos[id]

func _plate(c: Vector2, s: Dictionary, w: float, h: float) -> void:
	var f := ThemeDB.fallback_font
	var col := Color(String(s.get("colour", "#59606a")))
	if s.get("off", false):
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.105, 0.118, 0.137)
		sb.set_corner_radius_all(int(h * 0.2))
		sb.anti_aliasing = true
		draw_style_box(sb, Rect2(c - Vector2(w, h) * 0.5, Vector2(w, h)))
		draw_arc(c + Vector2(0, h * 0.02), h * 0.26, deg_to_rad(-54.0), deg_to_rad(234.0), 24, Color(0.81, 0.84, 0.86), maxf(3.0, h * 0.07), true)
		draw_line(c + Vector2(0, -h * 0.3), c + Vector2(0, h * 0.02), Color(0.81, 0.84, 0.86), maxf(3.0, h * 0.07), true)
		return
	var tex := _logo(String(s.get("logo", ""))) if not s.has("talk") else null
	if tex:
		var ts := tex.get_size()
		var k := minf(w / ts.x, h / ts.y)
		draw_texture_rect(tex, Rect2(c - ts * k * 0.5, ts * k), false)
		return
	var sb2 := StyleBoxFlat.new()
	sb2.bg_color = col
	sb2.set_corner_radius_all(int(h * 0.2))
	sb2.anti_aliasing = true
	draw_style_box(sb2, Rect2(c - Vector2(w, h) * 0.5, Vector2(w, h)))
	var night: bool = s.get("talk", "") == "night"
	draw_string(f, c + Vector2(-w * 0.5, -h * 0.08), "NIGHT OWL" if night else "KONTO TALK", HORIZONTAL_ALIGNMENT_CENTER, w, int(h * 0.34), Color.WHITE)
	draw_string(f, c + Vector2(-w * 0.5, h * 0.3), String(s.freq) + ("  ·  24 HOURS" if night else "  AM"), HORIZONTAL_ALIGNMENT_CENTER, w, int(h * 0.2), Color.WHITE)

func _process(dt: float) -> void:
	super._process(dt)
	if is_open:
		queue_redraw()

func _draw() -> void:
	if not visible or radio == null:
		return
	var sc := minf(size.x, size.y)
	var c := size * 0.5
	var outer := sc * 0.42
	var inner := outer * 0.5
	var f := ThemeDB.fallback_font
	var list := radio.stations()
	var n := list.size()
	var stepa := TAU / n
	draw_rect(Rect2(Vector2.ZERO, size), Color(0, 0, 0, 0.4))
	for i in n:
		var s: Dictionary = list[i]
		var col := Color(String(s.colour))
		var mid := i * stepa - PI / 2.0
		var poly := seg(c, inner, outer, mid - stepa / 2.0 + 0.012, mid + stepa / 2.0 - 0.012)
		var on := i == sel
		var live := i == radio.st
		draw_colored_polygon(poly, col.lerp(Color.WHITE, 0.12) if on else col.lerp(Color(0.047, 0.055, 0.07), 0.78))
		var pl := poly.duplicate()
		pl.append(poly[0])
		draw_polyline(pl, Color.WHITE if on else (col if live else Color(1, 1, 1, 0.1)), 4.0 if on else (3.0 if live else 1.5), true)
		var gr := (inner + outer) * 0.5
		var g := c + Vector2(cos(mid), sin(mid)) * gr
		_plate(g + Vector2(0, -14), s, outer * 0.36, outer * 0.17)
		var tcol := Color(0.047, 0.055, 0.07) if on else Color(0.91, 0.93, 0.94)
		var w := outer * 0.4
		if s.get("off", false):
			draw_string(f, g + Vector2(-w * 0.5, outer * 0.13), "Radio off", HORIZONTAL_ALIGNMENT_CENTER, w, int(sc * 0.0155), tcol)
		else:
			var inf := radio.info(s)
			var tt: String = "On air" if s.has("talk") else String(inf.title)
			draw_string(f, g + Vector2(-w * 0.5, outer * 0.13), _fit_text(f, tt, int(sc * 0.0155), w), HORIZONTAL_ALIGNMENT_CENTER, w, int(sc * 0.0155), tcol)
	# the middle: the station you point at
	var s2: Dictionary = list[sel]
	var col2 := Color(String(s2.colour))
	draw_circle(c, inner - 8.0, Color(0.04, 0.043, 0.055, 0.93))
	draw_arc(c, inner - 8.0, 0, TAU, 48, col2, 4.0, true)
	_plate(c + Vector2(0, -inner * 0.42), s2, inner * 1.05, inner * 0.5)
	var iw := inner * 1.7
	var x0 := c.x - iw * 0.5
	if s2.get("off", false):
		draw_string(f, Vector2(x0, c.y + inner * 0.14), "Radio off", HORIZONTAL_ALIGNMENT_CENTER, iw, int(sc * 0.026), Color.WHITE)
		draw_string(f, Vector2(x0, c.y + inner * 0.38), "Let go to switch it off", HORIZONTAL_ALIGNMENT_CENTER, iw, int(sc * 0.018), Color(0.66, 0.69, 0.72))
		return
	var inf2 := radio.info(s2)
	draw_string(f, Vector2(x0, c.y + inner * 0.09), "%s  ·  %s" % [s2.freq, s2.genre], HORIZONTAL_ALIGNMENT_CENTER, iw, int(sc * 0.019), col2)
	draw_string(f, Vector2(x0, c.y + inner * 0.31), _fit_text(f, String(inf2.title), int(sc * 0.024), iw), HORIZONTAL_ALIGNMENT_CENTER, iw, int(sc * 0.024), Color.WHITE)
	var who: String = String(inf2.cap) if s2.has("talk") else String(inf2.artist)
	draw_string(f, Vector2(x0, c.y + inner * 0.49), _fit_text(f, who, int(sc * 0.018), iw), HORIZONTAL_ALIGNMENT_CENTER, iw, int(sc * 0.018), Color(0.66, 0.69, 0.72))
	if not s2.has("talk"):
		var bx := c.x - inner * 0.7
		var bw := inner * 1.4
		draw_rect(Rect2(bx, c.y + inner * 0.62, bw, 5), Color(1, 1, 1, 0.15))
		draw_rect(Rect2(bx, c.y + inner * 0.62, bw * clampf(float(inf2.pos) / float(inf2.dur), 0.0, 1.0), 5), col2)
