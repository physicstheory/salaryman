class_name WheelBase
extends Control
## What the two wheels share: a ring of segments, a pointer that is a stick or a mouse nudged around, and a centre that says what is chosen.

var is_open := false
var sel := 0
var _fade := 0.0

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false

func fit() -> void:
	position = Vector2.ZERO
	size = get_viewport().get_visible_rect().size

func _ready() -> void:
	fit()
	get_viewport().size_changed.connect(fit)

func count() -> int:
	return 1

## Point with a vector (a stick, or the mouse nudged away from the middle): the segment in that direction is selected.
func point(v: Vector2) -> void:
	if v.length() < 0.45:
		return
	var n := count()
	var a := atan2(v.x, -v.y)
	var i := int(roundf(a / (TAU / n) + n)) % n
	if i != sel:
		sel = i
		queue_redraw()

func step(d: int) -> void:
	sel = (sel + d + count()) % count()
	queue_redraw()

func _process(dt: float) -> void:
	var want := 1.0 if is_open else 0.0
	_fade = move_toward(_fade, want, dt * 8.0)
	modulate.a = _fade
	if _fade <= 0.0 and visible:
		visible = false

static func seg(c: Vector2, inner: float, outer: float, a0: float, a1: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var steps := maxi(4, int((a1 - a0) / 0.06))
	for i in steps + 1:
		var a := a0 + (a1 - a0) * float(i) / steps
		pts.append(c + Vector2(cos(a), sin(a)) * outer)
	for i in steps + 1:
		var a := a1 - (a1 - a0) * float(i) / steps
		pts.append(c + Vector2(cos(a), sin(a)) * inner)
	return pts

func _fit_text(f: Font, t: String, fs: int, w: float) -> String:
	if f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x <= w:
		return t
	while t.length() > 3 and f.get_string_size(t + "…", HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w:
		t = t.substr(0, t.length() - 1)
	return t + "…"
