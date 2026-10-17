class_name EquipWheel
extends WheelBase
## Hold Q (or LB): a ring of categories — hands, firearms, phones, audio, games, food, drinks, medicine, tech — each showing what you have in it.
## The mouse or a stick points at a category, up and down (or the D-pad) pick within it, and letting go uses what is selected.

var idx: Dictionary = {}          # category id -> index of the entry last chosen in it

func count() -> int:
	return Equipment.cats().size()

func _cat() -> Dictionary:
	return Equipment.cats()[sel]

func open() -> void:
	is_open = true
	visible = true
	queue_redraw()

## Close the wheel and use what is selected. Returns a line to show.
func close() -> String:
	if not is_open:
		return ""
	is_open = false
	var c := _cat()
	var l := Equipment.list(c.id)
	var e: Dictionary = {}
	if not l.is_empty():
		e = l[clampi(int(idx.get(c.id, 0)), 0, l.size() - 1)]
	return Equipment.apply(c.id, e)

func step_item(d: int) -> void:
	var c := _cat()
	var l := Equipment.list(c.id)
	if l.is_empty():
		return
	idx[c.id] = (clampi(int(idx.get(c.id, 0)), 0, l.size() - 1) + d + l.size()) % l.size()
	queue_redraw()

func _process(dt: float) -> void:
	super._process(dt)
	if is_open:
		queue_redraw()

func _draw() -> void:
	if not visible:
		return
	var cats := Equipment.cats()
	var n := cats.size()
	var sc := minf(size.x, size.y)
	var cx := size.x * 0.5
	var cy := size.y * 0.45
	var c := Vector2(cx, cy)
	var outer := sc * 0.30
	var inner := outer * 0.43
	var f := ThemeDB.fallback_font
	draw_rect(Rect2(Vector2.ZERO, size), Color(0, 0, 0, 0.35))
	var stepa := TAU / n
	for i in n:
		var cat: Dictionary = cats[i]
		var col := Color(String(cat.colour))
		var mid := i * stepa - PI / 2.0
		var poly := seg(c, inner, outer, mid - stepa / 2.0 + 0.016, mid + stepa / 2.0 - 0.016)
		var on := i == sel
		var l := Equipment.list(cat.id)
		if not l.is_empty():
			draw_colored_polygon(poly, col.lerp(Color.WHITE, 0.18) if on else col.lerp(Color(0.07, 0.08, 0.1), 0.52))
			var pl := poly.duplicate()
			pl.append(poly[0])
			draw_polyline(pl, Color.WHITE if on else col.lerp(Color(0.07, 0.08, 0.1), 0.25), 4.0 if on else 2.0, true)
		else:
			draw_colored_polygon(poly, Color(1, 1, 1, 0.14) if on else Color(0.05, 0.06, 0.08, 0.3))
			var pl2 := poly.duplicate()
			pl2.append(poly[0])
			draw_polyline(pl2, Color(col, 0.9 if on else 0.5), 2.0, true)
		var gr := (inner + outer) * 0.5
		var g := c + Vector2(cos(mid), sin(mid)) * gr
		if not l.is_empty():
			var e: Dictionary = l[clampi(int(idx.get(cat.id, 0)), 0, l.size() - 1)]
			WheelIcon.draw_icon(self, e, cat.id, g, outer * 0.2)
			if int(e.get("count", 1)) > 1:
				var bp := g + Vector2(outer * 0.17, outer * 0.16)
				draw_circle(bp, 15.0, Color(0.05, 0.06, 0.08))
				draw_string(f, bp + Vector2(-15, 5), "×%d" % int(e.count), HORIZONTAL_ALIGNMENT_CENTER, 30, 14, Color.WHITE)
		else:
			draw_arc(g, outer * 0.08, 0, TAU, 20, Color(col, 0.55 if on else 0.28), 3.0, true)
	# the middle
	var cc: Dictionary = cats[sel]
	var ccol := Color(String(cc.colour))
	draw_circle(c, inner - 8.0, Color(0.04, 0.045, 0.055, 0.9))
	draw_arc(c, inner - 8.0, 0, TAU, 48, ccol, 4.0, true)
	var list := Equipment.list(cc.id)
	var cur: Dictionary = {}
	var ci := 0
	if not list.is_empty():
		ci = clampi(int(idx.get(cc.id, 0)), 0, list.size() - 1)
		cur = list[ci]
	var iw := (inner - 14.0) * 2.0
	draw_string(f, c + Vector2(-iw * 0.5, -outer * 0.13), String(cc.name).to_upper(), HORIZONTAL_ALIGNMENT_CENTER, iw, int(outer * 0.075), ccol)
	var nm: String = cur.name if not cur.is_empty() else String(cc.empty)
	draw_string(f, c + Vector2(-iw * 0.5, outer * 0.0), _fit_text(f, nm, int(outer * 0.098), iw), HORIZONTAL_ALIGNMENT_CENTER, iw, int(outer * 0.098), Color.WHITE if not cur.is_empty() else Color(0.48, 0.5, 0.55))
	if not cur.is_empty():
		var sub := ("×%d · " % int(cur.count) if int(cur.get("count", 1)) > 1 else "") + String(cur.get("note", ""))
		draw_string(f, c + Vector2(-iw * 0.5, outer * 0.1), _fit_text(f, sub, int(outer * 0.07), iw), HORIZONTAL_ALIGNMENT_CENTER, iw, int(outer * 0.07), Color(0.55, 0.58, 0.62))
		if list.size() > 1:
			draw_string(f, c + Vector2(-iw * 0.5, outer * 0.19), "%d / %d" % [ci + 1, list.size()], HORIZONTAL_ALIGNMENT_CENTER, iw, int(outer * 0.07), Color(0.42, 0.45, 0.49))
	# the strip under the ring: the rest of this category, the selected one lifted and framed
	if list.size() > 1:
		var sy := cy + outer + sc * 0.09
		var cell := sc * 0.095
		var vis := mini(list.size(), 7)
		var start := clampi(ci - vis / 2, 0, list.size() - vis)
		var x0 := cx - vis * cell * 0.5 + cell * 0.5
		for k in vis:
			var li := start + k
			var x := x0 + k * cell
			var on2 := li == ci
			var r := Rect2(Vector2(x - cell * 0.44, sy - cell * 0.44), Vector2(cell * 0.88, cell * 0.88))
			var sb := StyleBoxFlat.new()
			sb.bg_color = ccol.lerp(Color(0.07, 0.08, 0.1), 0.35) if on2 else Color(0.055, 0.063, 0.078, 0.62)
			sb.set_corner_radius_all(12)
			sb.border_color = Color.WHITE if on2 else Color(1, 1, 1, 0.12)
			sb.set_border_width_all(3 if on2 else 1)
			sb.anti_aliasing = true
			draw_style_box(sb, r)
			WheelIcon.draw_icon(self, list[li], cc.id, Vector2(x, sy), cell * (0.32 if on2 else 0.26))
		if start > 0:
			draw_string(f, Vector2(x0 - cell * 0.5 - 22, sy + 10), "‹", HORIZONTAL_ALIGNMENT_LEFT, -1, 30, Color(0.8, 0.82, 0.85))
		if start + vis < list.size():
			draw_string(f, Vector2(x0 + (vis - 1) * cell + cell * 0.5 + 8, sy + 10), "›", HORIZONTAL_ALIGNMENT_LEFT, -1, 30, Color(0.8, 0.82, 0.85))
