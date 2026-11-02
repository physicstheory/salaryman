class_name WheelIcon
extends RefCounted
## The little pictures on the equipment wheel, drawn from shapes: a fist, a pistol, a handset, a can, a rice ball.

static func _col(id: String, s := 0.55, v := 0.8) -> Color:
	return Color.from_hsv(float(absi(id.hash()) % 360) / 360.0, s, v)

static func _rr(ci: CanvasItem, r: Rect2, rad: float, col: Color, border := Color(0, 0, 0, 0), bw := 0) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	sb.set_corner_radius_all(int(rad))
	sb.anti_aliasing = true
	if bw > 0:
		sb.border_color = border
		sb.set_border_width_all(bw)
	ci.draw_style_box(sb, r)

static func draw_icon(ci: CanvasItem, e: Dictionary, cat: String, c: Vector2, r: float, dim := false) -> void:
	var a := 0.45 if dim else 1.0
	var ink := Color(0.96, 0.97, 0.98, a)
	var id: String = e.get("id", "")
	match cat:
		"hand":
			if id == "umbrella":
				var pts := PackedVector2Array()
				for i in 17:
					var t := PI + float(i) / 16.0 * PI
					pts.append(c + Vector2(cos(t) * r * 0.9, sin(t) * r * 0.7 - r * 0.05))
				ci.draw_colored_polygon(pts, Color(0.75, 0.9, 1.0, 0.55 * a))
				ci.draw_polyline(pts, ink, 2.0, true)
				ci.draw_line(c + Vector2(0, -r * 0.05), c + Vector2(0, r * 0.7), ink, 3.0, true)
				ci.draw_arc(c + Vector2(-r * 0.12, r * 0.7), r * 0.12, 0, PI, 8, ink, 3.0, true)
			elif id == "baton":
				ci.draw_line(c + Vector2(-r * 0.7, r * 0.6), c + Vector2(r * 0.7, -r * 0.6), Color(0.2, 0.22, 0.26, a), r * 0.2, true)
				ci.draw_line(c + Vector2(-r * 0.7, r * 0.6), c + Vector2(-r * 0.35, r * 0.25), ink, r * 0.2, true)
			else:
				_rr(ci, Rect2(c + Vector2(-r * 0.55, -r * 0.25), Vector2(r * 1.1, r * 0.8)), r * 0.25, Color(0.96, 0.82, 0.62, a))
				for i in 4:
					_rr(ci, Rect2(c + Vector2(-r * 0.5 + i * r * 0.27, -r * 0.55), Vector2(r * 0.24, r * 0.5)), r * 0.1, Color(0.96, 0.82, 0.62, a))
		"gun":
			var col := Color(0.93, 0.7, 0.72, a)
			var len := 0.8 if id == "pistol" else 1.1
			_rr(ci, Rect2(c + Vector2(-r * len * 0.55, -r * 0.3), Vector2(r * len * 1.1, r * 0.26)), 2.0, col)
			ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-r * 0.2, -r * 0.05), c + Vector2(r * 0.08, -r * 0.05), c + Vector2(r * 0.02, r * 0.6), c + Vector2(-r * 0.24, r * 0.6)]), col)
			if id != "pistol":
				_rr(ci, Rect2(c + Vector2(-r * 0.05, -r * 0.05), Vector2(r * 0.14, r * 0.5)), 1.0, col)
		"phone":
			var d: Dictionary = GameData.raw.devices.get(id, {})
			var shell := Color(String(d.get("colours", [["", "#4b4e54"]])[0][1])) if d.has("colours") else Color(String(d.get("body", ["#4b4e54"])[0]))
			var basic: bool = d.get("ui", "") == "basic"
			var w := r * (0.62 if not basic else 0.58)
			_rr(ci, Rect2(c + Vector2(-w * 0.5, -r * 0.75), Vector2(w, r * 1.5)), r * 0.14, shell.lerp(Color.WHITE, 0.15) * Color(1, 1, 1, a), Color(0, 0, 0, 0.4 * a), 1)
			if basic:
				_rr(ci, Rect2(c + Vector2(-w * 0.4, -r * 0.62), Vector2(w * 0.8, r * 0.6)), 2.0, Color(0.1, 0.2, 0.3, a))
				for k in 6:
					ci.draw_rect(Rect2(c + Vector2(-w * 0.36 + (k % 3) * w * 0.26, r * 0.12 + (k / 3) * r * 0.24), Vector2(w * 0.2, r * 0.16)), Color(0.95, 0.94, 0.9, a))
			else:
				_rr(ci, Rect2(c + Vector2(-w * 0.43, -r * 0.68), Vector2(w * 0.86, r * 1.36)), r * 0.1, Color(0.1, 0.18, 0.34, a))
				ci.draw_rect(Rect2(c + Vector2(-w * 0.43, r * 0.1), Vector2(w * 0.86, r * 0.58)), Color(0.9, 0.45, 0.4, 0.7 * a))
		"audio":
			if id.begins_with("headphones"):
				ci.draw_arc(c + Vector2(0, r * 0.1), r * 0.6, PI, TAU, 16, ink, 3.0, true)
				_rr(ci, Rect2(c + Vector2(-r * 0.75, r * 0.0), Vector2(r * 0.3, r * 0.55)), r * 0.1, ink)
				_rr(ci, Rect2(c + Vector2(r * 0.45, r * 0.0), Vector2(r * 0.3, r * 0.55)), r * 0.1, ink)
			else:
				for sx in [-1.0, 1.0]:
					ci.draw_circle(c + Vector2(sx * r * 0.32, -r * 0.2), r * 0.2, ink)
					ci.draw_line(c + Vector2(sx * r * 0.32, -r * 0.05), c + Vector2(sx * r * 0.32, r * 0.55), ink, r * 0.1, true)
		"game":
			var col := _col(id)
			_rr(ci, Rect2(c + Vector2(-r * 0.5, -r * 0.7), Vector2(r, r * 1.4)), 4.0, Color(col.r, col.g, col.b, a))
			_rr(ci, Rect2(c + Vector2(-r * 0.38, -r * 0.58), Vector2(r * 0.76, r * 0.7)), 2.0, Color(0.05, 0.06, 0.1, a))
			ci.draw_string(ThemeDB.fallback_font, c + Vector2(-r * 0.5, r * 0.45), String(e.get("name", "?")).substr(0, 1), HORIZONTAL_ALIGNMENT_CENTER, r, int(r * 0.45), Color(1, 1, 1, a))
		"food":
			if id.contains("onigiri") or id.contains("rice"):
				ci.draw_colored_polygon(PackedVector2Array([c + Vector2(0, -r * 0.7), c + Vector2(r * 0.7, r * 0.55), c + Vector2(-r * 0.7, r * 0.55)]), Color(0.98, 0.98, 0.95, a))
				ci.draw_rect(Rect2(c + Vector2(-r * 0.35, r * 0.15), Vector2(r * 0.7, r * 0.4)), Color(0.07, 0.12, 0.1, a))
			else:
				var col2 := _col(id, 0.5, 0.9)
				ci.draw_arc(c + Vector2(0, -r * 0.05), r * 0.62, 0, PI, 16, Color(col2.r, col2.g, col2.b, a), r * 0.5, true)
				ci.draw_line(c + Vector2(-r * 0.7, r * 0.2), c + Vector2(r * 0.7, r * 0.2), ink, 3.0, true)
				for i in 3:
					ci.draw_line(c + Vector2(-r * 0.25 + i * r * 0.25, -r * 0.45), c + Vector2(-r * 0.15 + i * r * 0.25, -r * 0.7), Color(1, 1, 1, 0.5 * a), 2.0, true)
		"drink":
			var col3 := _col(id, 0.6, 0.85)
			_rr(ci, Rect2(c + Vector2(-r * 0.28, -r * 0.62), Vector2(r * 0.56, r * 1.24)), r * 0.1, Color(0.82, 0.84, 0.87, a))
			_rr(ci, Rect2(c + Vector2(-r * 0.28, -r * 0.28), Vector2(r * 0.56, r * 0.6)), 1.0, Color(col3.r, col3.g, col3.b, a))
			ci.draw_circle(c + Vector2(0, r * 0.02), r * 0.12, Color(1, 1, 1, 0.8 * a))
		"med":
			_rr(ci, Rect2(c + Vector2(-r * 0.5, -r * 0.5), Vector2(r, r)), r * 0.12, Color(0.97, 0.97, 0.97, a))
			ci.draw_rect(Rect2(c + Vector2(-r * 0.1, -r * 0.34), Vector2(r * 0.2, r * 0.68)), Color(0.85, 0.15, 0.2, a))
			ci.draw_rect(Rect2(c + Vector2(-r * 0.34, -r * 0.1), Vector2(r * 0.68, r * 0.2)), Color(0.85, 0.15, 0.2, a))
		_:
			_rr(ci, Rect2(c + Vector2(-r * 0.4, -r * 0.3), Vector2(r * 0.8, r * 0.6)), r * 0.1, Color(0.6, 0.64, 0.7, a))
			ci.draw_line(c + Vector2(-r * 0.2, -r * 0.3), c + Vector2(-r * 0.2, -r * 0.65), ink, 3.0, true)
			ci.draw_line(c + Vector2(r * 0.2, -r * 0.3), c + Vector2(r * 0.2, -r * 0.65), ink, 3.0, true)
