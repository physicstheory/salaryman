class_name PhoneWall
extends Control
## The wallpaper behind the home screen, per brand: SOTI's Tōkonto-at-dusk skyline, Pear's soft colour wash, and the convenience-store phones' own stripes and paw prints.

var kind := "soti"
var top := Color(0.1, 0.12, 0.3)
var bottom := Color(0.9, 0.4, 0.4)
var dev: Dictionary = {}

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _rnd(i: int, k: int) -> float:
	return fposmod(sin(float(i) * 12.9898 + float(k) * 78.233) * 43758.5453, 1.0)

func _grad(c0: Color, c1: Color, r: Rect2, vertical := true) -> void:
	# per-vertex colour: no texture to wait for, so it is there on the first frame
	var p := PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])
	var c := PackedColorArray([c0, c0, c1, c1]) if vertical else PackedColorArray([c0, c1, c1, c0])
	draw_polygon(p, c)

func _draw() -> void:
	var w := size.x
	var h := size.y
	match kind:
		"soti":
			# dusk: indigo overhead, warm at the horizon, the bay below it
			var hz := h * 0.66
			_grad(top, bottom, Rect2(0, 0, w, hz))
			_grad(Color(0.06, 0.07, 0.16), Color(0.1, 0.1, 0.2), Rect2(0, hz, w, h - hz))
			# a mountain behind the city
			draw_colored_polygon(PackedVector2Array([Vector2(0, hz), Vector2(w * 0.28, hz - h * 0.12), Vector2(w * 0.5, hz - h * 0.05), Vector2(w * 0.74, hz - h * 0.17), Vector2(w, hz)]), Color(0.18, 0.14, 0.24, 0.9))
			var x := 0.0
			var i := 0
			while x < w:
				var bw := 16.0 + _rnd(i, 1) * 26.0
				var bh := h * (0.06 + _rnd(i, 2) * 0.2)
				var col := Color(0.05, 0.05, 0.11)
				draw_rect(Rect2(x, hz - bh, bw, bh), col)
				for wy in int(bh / 9.0):
					for wx in int(bw / 7.0):
						if _rnd(i * 31 + wy, wx + 3) > 0.62:
							draw_rect(Rect2(x + 3 + wx * 7.0, hz - bh + 4 + wy * 9.0, 3, 4), Color(1.0, 0.82, 0.5, 0.85))
				x += bw + 1.0
				i += 1
			# the lights on the water
			for k in 60:
				var sx := _rnd(k, 5) * w
				var sy := hz + 4.0 + _rnd(k, 6) * (h - hz) * 0.5
				draw_rect(Rect2(sx, sy, 3.0 + _rnd(k, 7) * 9.0, 1.4), Color(1.0, 0.77, 0.5, 0.06 + _rnd(k, 8) * 0.16))
		"pear":
			_grad(bottom.darkened(0.35), top.lightened(0.05), Rect2(0, 0, w, h))
			draw_circle(Vector2(w * 0.2, h * 0.28), w * 0.62, Color(top.r, top.g + 0.25, top.b + 0.2, 0.28))
			draw_circle(Vector2(w * 0.85, h * 0.62), w * 0.7, Color(bottom.r + 0.1, bottom.g, bottom.b + 0.4, 0.3))
			draw_circle(Vector2(w * 0.3, h * 0.95), w * 0.55, Color(0.1, 0.5, 0.55, 0.22))
		"basic":
			var b0 := Color(String(dev.get("body", ["#0d7a4c", "#08492d"])[0]))
			var b1 := Color(String(dev.get("body", ["#0d7a4c", "#08492d"])[1]))
			_grad(b0.lightened(0.1), b1, Rect2(0, 0, w, h))
			var st: Array = dev.get("stripes", ["#e8711a", "#cf2027"])
			for j in 2:
				var y0 := h * (0.2 + j * 0.06)
				draw_colored_polygon(PackedVector2Array([Vector2(w * 0.35, y0), Vector2(w * 0.8, y0 - 14), Vector2(w * 0.8, y0 - 4), Vector2(w * 0.35, y0 + 10)]), Color(Color(String(st[j])), 0.8))
			if dev.get("id", "") == "petmart":
				for k in 7:
					var p := Vector2(_rnd(k, 11) * w, _rnd(k, 12) * h)
					draw_circle(p, 7.0, Color(1, 1, 1, 0.12))
					for t in 4:
						draw_circle(p + Vector2((t - 1.5) * 7.0, -9.0 - (1.0 if t == 1 or t == 2 else 0.0) * 3.0), 2.6, Color(1, 1, 1, 0.12))
