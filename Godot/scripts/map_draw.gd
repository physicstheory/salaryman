class_name MapDraw
extends RefCounted
## Draws the city as a map onto any Control: the minimap and the full-screen map share this.
## A transform is (origin on screen, pixels per metre, rotation, world centre), north is up when rotation is 0.

const NS := ["Sakura Street", "Kaigan Road", "Chūō Avenue", "Station Street", "Park Street", "Aoyama Road", "Minato Street", "Higashi Road", "Seaside Drive"]
const EW := ["Ginza Street", "Shibuya Road", "Marunouchi Avenue", "Akasaka Street", "Ueno Road", "Asakusa Street", "Roppongi Avenue", "Shinjuku Road", "Harbour Drive"]
const SEA := Color(0.04, 0.09, 0.17)
const LAND := Color(0.1, 0.11, 0.14)
const ROAD := Color(0.27, 0.29, 0.35)
const BLOCK := Color(0.16, 0.17, 0.21)
const PARK := Color(0.12, 0.28, 0.17)

var origin := Vector2.ZERO
var scale := 1.0
var rot := 0.0
var centre := Vector2.ZERO        # world x, z at the origin

func to_screen(wx: float, wz: float) -> Vector2:
	return origin + (Vector2(wx, wz) - centre).rotated(rot) * scale

func to_world(p: Vector2) -> Vector2:
	return (p - origin).rotated(-rot) / scale + centre

static func street_name(world: CityWorld, x: float, z: float) -> String:
	var P := CityWorld.P
	var i := clampi(int(roundf(x / P)), 0, CityWorld.N)
	var j := clampi(int(roundf(z / P)), 0, CityWorld.N)
	var dx := absf(x - i * P)
	var dz := absf(z - j * P)
	if dx < 8.0 and dz < 8.0:
		return "%s at %s" % [NS[i], EW[j]]
	if dx < dz:
		return NS[i] if dx < 14.0 else "off %s" % NS[i]
	return EW[j] if dz < 14.0 else "off %s" % EW[j]

func _poly(c: Control, pts: Array, col: Color) -> void:
	var arr := PackedVector2Array()
	for p in pts:
		arr.append(p)
	c.draw_colored_polygon(arr, col)

func _rect(c: Control, x0: float, z0: float, x1: float, z1: float, col: Color) -> void:
	_poly(c, [to_screen(x0, z0), to_screen(x1, z0), to_screen(x1, z1), to_screen(x0, z1)], col)

func draw(c: Control, world: CityWorld, full: bool) -> void:
	var P := CityWorld.P
	var N := CityWorld.N
	var W := P * N
	c.draw_rect(Rect2(Vector2.ZERO, c.size), SEA)
	_rect(c, -34, -34, W + 34, W + 34, LAND)
	# blocks and parks
	for i in N:
		for j in N:
			var park := (i == 4 and (j == 3 or j == 4))
			_rect(c, i * P + 6, j * P + 6, (i + 1) * P - 6, (j + 1) * P - 6, PARK if park else BLOCK)
	# roads
	var rw := maxf(12.0 * scale, 2.0)
	for k in N + 1:
		c.draw_line(to_screen(k * P, -6), to_screen(k * P, W + 6), ROAD, rw)
		c.draw_line(to_screen(-6, k * P), to_screen(W + 6, k * P), ROAD, rw)
	# the railway, with its station
	var rx := world.rail_x
	c.draw_line(to_screen(rx, 0), to_screen(rx, W), Color(0.62, 0.64, 0.7), maxf(3.0 * scale, 1.5))
	c.draw_line(to_screen(rx, 0), to_screen(rx, W), Color(0.1, 0.11, 0.14), maxf(1.2 * scale, 0.6))
	var st := to_screen(rx, 3.0 * P + 26.0)
	c.draw_circle(st, maxf(6.0 * scale, 5.0), Color(0.08, 0.5, 0.27))
	c.draw_circle(st, maxf(3.5 * scale, 3.0), Color.WHITE)
	if full and scale > 0.5:
		var f := ThemeDB.fallback_font
		c.draw_string(f, st + Vector2(10, 4), "東都駅 Tōkonto Station", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.7, 1.0, 0.8))
	# trains
	for t in world.trains:
		if t.waiting <= 0.0:
			c.draw_circle(to_screen(rx + t.track_off, t.z), maxf(3.0 * scale, 3.0), Color.WHITE)
	# shops, in their chain colours
	var rad := maxf(4.2 * scale, 3.5) if not full else maxf(4.5 * scale, 5.0)
	for s in world.shops:
		var b: Dictionary = GameData.brand(s.brand)
		var p := to_screen(s.door.x, s.door.z)
		c.draw_circle(p, rad + 1.5, Color(0, 0, 0, 0.7))
		c.draw_circle(p, rad, Color(b.band))
		c.draw_circle(p, rad * 0.45, Color(b.stripes[0]))
	for v in world.vendors:
		c.draw_circle(to_screen(v.door.x, v.door.z), maxf(2.2 * scale, 2.0), Color(0.85, 0.3, 0.25))
	# street names on the full map
	if full and scale > 0.9:
		var f2 := ThemeDB.fallback_font
		for k in N + 1:
			var a := to_screen(k * P, 10)
			c.draw_string(f2, a + Vector2(4, 0), NS[k], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.8, 0.85, 1.0, 0.8))
			var bpos := to_screen(10, k * P)
			c.draw_string(f2, bpos + Vector2(0, -rw * 0.6), EW[k], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.8, 0.85, 1.0, 0.8))

func draw_marker(c: Control, wx: float, wz: float, heading: float, col: Color, size := 9.0) -> void:
	var p := to_screen(wx, wz)
	# heading is a direction in world space (angle of the facing vector in the x,z plane)
	var d := Vector2(cos(heading), sin(heading)).rotated(rot)
	var n := Vector2(-d.y, d.x)
	c.draw_colored_polygon(PackedVector2Array([p + d * size * 1.4, p - d * size * 0.9 + n * size * 0.9, p - d * size * 0.45, p - d * size * 0.9 - n * size * 0.9]), col)

func draw_waypoint(c: Control, wp: Vector3) -> void:
	if wp == Vector3.INF:
		return
	var p := to_screen(wp.x, wp.z)
	var inside := Rect2(Vector2.ZERO, c.size).grow(-8).has_point(p)
	var col := Color(1.0, 0.25, 0.55)
	if inside:
		c.draw_circle(p, 9.0, Color(0, 0, 0, 0.6))
		c.draw_circle(p, 7.0, col)
		c.draw_circle(p, 3.0, Color.WHITE)
	else:
		# clamp to the edge and point at it
		var mid := c.size * 0.5
		var d := (p - mid).normalized()
		var edge := mid + d * minf(c.size.x, c.size.y) * 0.46
		c.draw_colored_polygon(PackedVector2Array([edge + d * 9.0, edge - d * 6.0 + Vector2(-d.y, d.x) * 7.0, edge - d * 6.0 - Vector2(-d.y, d.x) * 7.0]), col)
