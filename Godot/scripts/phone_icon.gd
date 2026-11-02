class_name PhoneIcon
extends Control
## An app icon, drawn with the same glyphs as the web build's phoneIcon(): a rounded square in the app's colour, a flat white mark on it.

var colour := Color("#3b6ea8")
var glyph := "globe"
var badge := 0

func _init(c := Color("#3b6ea8"), g := "globe") -> void:
	colour = c
	glyph = g
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _rrect(r: Rect2, rad: float, col: Color) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	sb.set_corner_radius_all(int(rad))
	sb.anti_aliasing = true
	draw_style_box(sb, r)

func _line(a: Vector2, b: Vector2, w: float) -> void:
	draw_line(a, b, Color("#f4f6f8"), w, true)

func _draw() -> void:
	var s := minf(size.x, size.y)
	_rrect(Rect2(Vector2.ZERO, Vector2(s, s)), s * 0.235, colour)
	# the same soft shade toward the bottom the web build lays over the colour
	_rrect(Rect2(Vector2(0, s * 0.55), Vector2(s, s * 0.45)), s * 0.235, Color(0, 0, 0, 0.14))
	_rrect(Rect2(Vector2(0, s * 0.55), Vector2(s, s * 0.2)), 0.0, colour)
	_rrect(Rect2(Vector2(0, s * 0.55), Vector2(s, s * 0.2)), 0.0, Color(0, 0, 0, 0.07))
	var c := s * 0.5
	var m := s * 0.5
	var u := s * 0.5
	var w := s * 0.075
	var ink := Color("#f4f6f8")
	var f := ThemeDB.fallback_font
	match glyph:
		"call":
			var pts := PackedVector2Array()
			for i in 13:
				var t := i / 12.0
				var p0 := Vector2(c - u * 0.42, m - u * 0.46)
				var p1 := Vector2(c - u * 0.1, m + u * 0.1)
				var p2 := Vector2(c + u * 0.46, m + u * 0.42)
				pts.append(p0.lerp(p1, t).lerp(p1.lerp(p2, t), t))
			draw_polyline(pts, ink, w, true)
			draw_line(Vector2(c + u * 0.46, m + u * 0.42), Vector2(c + u * 0.46, m + u * 0.12), ink, w, true)
			draw_line(Vector2(c - u * 0.42, m - u * 0.46), Vector2(c - u * 0.12, m - u * 0.46), ink, w, true)
		"chat":
			draw_colored_polygon(PackedVector2Array([Vector2(c - u * 0.5, m - u * 0.36), Vector2(c + u * 0.5, m - u * 0.36), Vector2(c + u * 0.5, m + u * 0.2), Vector2(c - u * 0.14, m + u * 0.2), Vector2(c - u * 0.38, m + u * 0.52), Vector2(c - u * 0.38, m + u * 0.2), Vector2(c - u * 0.5, m + u * 0.2)]), ink)
		"cam":
			draw_arc(Vector2(c, m + u * 0.05), u * 0.3, 0, TAU, 24, ink, w, true)
			draw_rect(Rect2(c - u * 0.52, m - u * 0.3, u * 1.04, u * 0.78), ink, false, w)
			draw_rect(Rect2(c - u * 0.18, m - u * 0.46, u * 0.36, u * 0.16), ink)
		"sos":
			var fs := int(s * 0.27)
			draw_string(f, Vector2(0, m - u * 0.26 + fs * 0.35), "110", HORIZONTAL_ALIGNMENT_CENTER, s, fs, ink)
			draw_string(f, Vector2(0, m + u * 0.26 + fs * 0.35), "119", HORIZONTAL_ALIGNMENT_CENTER, s, fs, ink)
		"rail":
			draw_line(Vector2(c - u * 0.3, m - u * 0.5), Vector2(c - u * 0.3, m + u * 0.5), ink, s * 0.1, true)
			draw_line(Vector2(c + u * 0.3, m - u * 0.5), Vector2(c + u * 0.3, m + u * 0.5), ink, s * 0.1, true)
			draw_line(Vector2(c - u * 0.3, m + u * 0.22), Vector2(c + u * 0.3, m - u * 0.22), ink, s * 0.1, true)
		"ryde":
			var fs := int(s * 0.34)
			draw_string(f, Vector2(0, m + fs * 0.35), "R", HORIZONTAL_ALIGNMENT_CENTER, s, fs, Color("#07140f"))
		"card":
			draw_rect(Rect2(c - u * 0.54, m - u * 0.34, u * 1.08, u * 0.68), ink)
			draw_rect(Rect2(c - u * 0.54, m - u * 0.14, u * 1.08, u * 0.14), Color("#2a2d33"))
		"note":
			draw_circle(Vector2(c - u * 0.18, m + u * 0.3), u * 0.17, ink)
			draw_circle(Vector2(c + u * 0.34, m + u * 0.16), u * 0.17, ink)
			draw_rect(Rect2(c - u * 0.03, m - u * 0.46, u * 0.1, u * 0.78), ink)
			draw_rect(Rect2(c + u * 0.45, m - u * 0.6, u * 0.1, u * 0.78), ink)
			draw_rect(Rect2(c - u * 0.03, m - u * 0.6, u * 0.58, u * 0.14), ink)
		"photo":
			draw_rect(Rect2(c - u * 0.52, m - u * 0.4, u * 1.04, u * 0.8), ink, false, w)
			draw_colored_polygon(PackedVector2Array([Vector2(c - u * 0.46, m + u * 0.34), Vector2(c - u * 0.1, m - u * 0.12), Vector2(c + u * 0.16, m + u * 0.14), Vector2(c + u * 0.32, m - u * 0.02), Vector2(c + u * 0.46, m + u * 0.34)]), ink)
		"globe":
			draw_arc(Vector2(c, m), u * 0.52, 0, TAU, 28, ink, w, true)
			var el := PackedVector2Array()
			for i in 25:
				var a := i / 24.0 * TAU
				el.append(Vector2(c + cos(a) * u * 0.22, m + sin(a) * u * 0.52))
			draw_polyline(el, ink, w, true)
			draw_line(Vector2(c - u * 0.52, m), Vector2(c + u * 0.52, m), ink, w, true)
		"people":
			draw_circle(Vector2(c, m - u * 0.2), u * 0.22, ink)
			draw_circle(Vector2(c, m + u * 0.62), u * 0.46, ink)
		"gear":
			var pts := PackedVector2Array()
			for i in 8:
				var a0 := i / 8.0 * TAU
				var a1 := (i + 0.5) / 8.0 * TAU
				pts.append(Vector2(c + cos(a0) * u * 0.56, m + sin(a0) * u * 0.56))
				pts.append(Vector2(c + cos(a1) * u * 0.38, m + sin(a1) * u * 0.38))
			draw_colored_polygon(pts, ink)
			draw_circle(Vector2(c, m), u * 0.2, colour)
		"heart":
			draw_circle(Vector2(c - u * 0.22, m - u * 0.14), u * 0.28, Color.WHITE)
			draw_circle(Vector2(c + u * 0.22, m - u * 0.14), u * 0.28, Color.WHITE)
			draw_colored_polygon(PackedVector2Array([Vector2(c - u * 0.48, m - u * 0.02), Vector2(c + u * 0.48, m - u * 0.02), Vector2(c, m + u * 0.48)]), Color.WHITE)
		"mynet":
			# the MyGram paper plane over its warm gradient
			draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(s, 0), Vector2(s, s * 0.5), Vector2(0, s * 0.5)]), PackedColorArray([Color("#8a35c8"), Color("#8a35c8"), Color("#e8365a"), Color("#e8365a")]))
			draw_polygon(PackedVector2Array([Vector2(0, s * 0.5), Vector2(s, s * 0.5), Vector2(s, s), Vector2(0, s)]), PackedColorArray([Color("#e8365a"), Color("#e8365a"), Color("#f9b13a"), Color("#f9b13a")]))
			draw_colored_polygon(PackedVector2Array([Vector2(c - u * 0.55, m - u * 0.05), Vector2(c + u * 0.6, m - u * 0.5), Vector2(c + u * 0.2, m + u * 0.5), Vector2(c - u * 0.05, m + u * 0.1)]), Color(1, 1, 1, 0.95))
			draw_line(Vector2(c - u * 0.05, m + u * 0.1), Vector2(c + u * 0.6, m - u * 0.5), colour.darkened(0.2), 1.5, true)
		_:
			var fs := int(s * 0.3)
			draw_string(f, Vector2(0, m + fs * 0.35), glyph.substr(0, 1).to_upper(), HORIZONTAL_ALIGNMENT_CENTER, s, fs, ink)
	if badge > 0:
		draw_circle(Vector2(s * 0.93, s * 0.07), s * 0.19, Color("#ff3b30"))
		var fs2 := int(s * 0.22)
		draw_string(f, Vector2(s * 0.93 - s * 0.19, s * 0.07 + fs2 * 0.35), "9+" if badge > 9 else str(badge), HORIZONTAL_ALIGNMENT_CENTER, s * 0.38, fs2, Color.WHITE)
