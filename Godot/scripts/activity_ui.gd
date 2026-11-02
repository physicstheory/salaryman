class_name ActivityUI
extends Control
## The things to do in the city that are not shopping: the bathhouse, pachinko, karaoke, the arcade (snake and
## breakout), fishing off the pier, and sitting on a bench. Each one is a menu and, for most, a short game, and each
## one ends by moving your stress. Arrow keys and Enter drive the menus; Esc leaves.

signal closed

var kind := ""
var title := ""
var _mode := "menu"            # menu, play, result
var _opts: Array = []          # [{label, note, cost}]
var _sel := 0
var _rects: Array = []
var _result := ""
var _game := ""
var _t := 0.0
var _score := 0.0
var _rng := RandomNumberGenerator.new()
var _keys := {}
# karaoke
var _notes: Array = []
var _hit := 0
var _miss := 0
var _combo := 0
# snake / breakout
var _snake: Array = []
var _dir := Vector2i(1, 0)
var _food := Vector2i(5, 5)
var _acc := 0.0
var _ball := Vector2(160, 150)
var _bv := Vector2(130, -150)
var _pad := 140.0
var _bricks: Array = []
# fishing
var _bar := 0.0
var _bar_dir := 1.0
var _zone := Vector2(0.4, 0.6)
var _bite := false
var _wait := 0.0
var _pach_reels := ["-", "-", "-"]
var _pach_spin := 0.0
var _pach_win := 0

const BRANDS := {
	"sento": {"name": "Yu no Sato Sento", "jp": "湯の里", "band": "#2a6f8f", "ink": "#ffffff", "stripes": ["#ffffff", "#1c4a63"], "tag": "Public bath · towels ¥100"},
	"pachinko": {"name": "Golden Lotus Pachinko", "jp": "パチンコ 黄金", "band": "#b8860b", "ink": "#2a0505", "stripes": ["#ffd23a", "#4a0a0a"], "tag": "Open 10 to midnight"},
	"karaoke": {"name": "Karaoke Night", "jp": "カラオケ 夜", "band": "#7a1a8f", "ink": "#ffe680", "stripes": ["#ff6ad9", "#2a0a38"], "tag": "Private rooms · drinks included"},
	"arcade": {"name": "Game Centre Rocket", "jp": "ゲームセンター", "band": "#1a1f6f", "ink": "#7ae8ff", "stripes": ["#ff3a8a", "#0a0f3a"], "tag": "¥100 a go"}
}

func _fit() -> void:
	position = Vector2.ZERO
	size = get_viewport().get_visible_rect().size

func _ready() -> void:
	_fit()
	get_viewport().size_changed.connect(_fit)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	_rng.randomize()

static func register_brands() -> void:
	for k in BRANDS:
		GameData.brands[k] = BRANDS[k]
	# fish for the bag
	var fish := {"fish_aji": ["Horse mackerel", 0.07, 0.10], "fish_saba": ["Mackerel", 0.08, 0.12], "fish_tai": ["Sea bream", 0.14, 0.2], "fish_boot": ["An old boot", 0.0, -0.03]}
	for k in fish:
		GameData.items[k] = {"id": k, "name": fish[k][0], "cat": "food", "stress": -fish[k][1], "health": fish[k][2], "note": "Caught today", "min": 8}

func open(kind_id: String) -> void:
	kind = kind_id
	_mode = "menu"
	_sel = 0
	_result = ""
	_opts = []
	match kind:
		"sento":
			title = "Yu no Sato Sento  湯の里"
			_opts = [{"label": "A quick rinse", "note": "15 minutes", "cost": 520, "mins": 15, "stress": 0.2, "health": 0.04},
				{"label": "A proper soak", "note": "30 minutes", "cost": 900, "mins": 30, "stress": 0.45, "health": 0.08},
				{"label": "The full course", "note": "an hour: bath, sauna, bath, milk", "cost": 1800, "mins": 60, "stress": 0.85, "health": 0.15}]
		"pachinko":
			title = "Golden Lotus Pachinko  パチンコ 黄金"
			_opts = [{"label": "Play a round", "note": "¥1,000 · the lights are the point", "cost": 1000}]
		"karaoke":
			title = "Karaoke Night  カラオケ 夜"
			_opts = [{"label": "Last Train Blues", "note": "slow · ¥1,200", "cost": 1200, "bpm": 84.0},
				{"label": "Overtime Princess", "note": "medium · ¥1,200", "cost": 1200, "bpm": 112.0},
				{"label": "Ramen Is Life", "note": "fast · ¥1,200", "cost": 1200, "bpm": 138.0}]
		"arcade":
			title = "Game Centre Rocket  ゲームセンター"
			_opts = [{"label": "Snake Run", "note": "arrows · ¥100", "cost": 100, "game": "snake"}, {"label": "Brick Breaker", "note": "left and right · ¥100", "cost": 100, "game": "breakout"}]
		"bench":
			title = "A bench in the park"
			_opts = [{"label": "Sit for a while", "note": "20 minutes · free", "cost": 0, "mins": 20, "stress": 0.06, "health": 0.0}]
		"fishing":
			title = "The pier"
			_opts = [{"label": "Cast a line", "note": "press Space when the marker is in the green", "cost": 0}]
	visible = true
	queue_redraw()

func close() -> void:
	visible = false
	_mode = "menu"
	closed.emit()

func _choose(i: int) -> void:
	if i < 0 or i >= _opts.size():
		return
	var o: Dictionary = _opts[i]
	var cost: int = int(o.get("cost", 0))
	if cost > 0 and not GameState.spend(cost, title.split("  ")[0]):
		_result = "Not enough money. That is %s." % GameState.yen(cost)
		_mode = "result"
		return
	match kind:
		"sento", "bench":
			GameState.add_stress(-float(o.stress))
			GameState.health = clampf(GameState.health + float(o.health), 0.0, 1.0)
			GameState.advance_minutes(float(o.mins))
			_result = ("You soak until the world goes soft. The stress runs out of you." if kind == "sento" else "You sit. The city does its thing without you. It is lovely.")
			_mode = "result"
		"pachinko":
			_pach_spin = 2.2
			_mode = "play"
			_game = "pachinko"
			var r := _rng.randf()
			_pach_win = 0
			if r < 0.70:
				_pach_win = 0
			elif r < 0.92:
				_pach_win = _rng.randi_range(1200, 2000)
			elif r < 0.99:
				_pach_win = _rng.randi_range(3000, 6000)
			else:
				_pach_win = 20000
		"karaoke":
			_start_karaoke(float(o.bpm))
		"arcade":
			_game = o.game
			_start_arcade()
		"fishing":
			_start_fishing()

func _unhandled_key_input(e: InputEvent) -> void:
	if not visible or not (e is InputEventKey) or not e.pressed or e.echo:
		return
	var k: int = e.keycode
	if k == KEY_ESCAPE:
		if _mode == "play":
			_finish("You walk away from it.")
		else:
			close()
		get_viewport().set_input_as_handled()
		return
	if _mode == "menu":
		if k == KEY_UP: _sel = maxi(_sel - 1, 0)
		elif k == KEY_DOWN: _sel = mini(_sel + 1, _opts.size() - 1)
		elif k == KEY_ENTER or k == KEY_KP_ENTER or k == KEY_SPACE: _choose(_sel)
	elif _mode == "result":
		if k == KEY_ENTER or k == KEY_SPACE or k == KEY_KP_ENTER:
			_mode = "menu"
	elif _mode == "play":
		_play_key(k)
	queue_redraw()
	get_viewport().set_input_as_handled()

func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT and _mode == "menu":
		for i in _rects.size():
			if (_rects[i] as Rect2).has_point(e.position):
				_sel = i
				_choose(i)

func _play_key(k: int) -> void:
	match _game:
		"karaoke":
			var lane: int = {KEY_LEFT: 0, KEY_DOWN: 1, KEY_UP: 2, KEY_RIGHT: 3, KEY_A: 0, KEY_S: 1, KEY_W: 2, KEY_D: 3}.get(k, -1)
			if lane >= 0:
				_karaoke_press(lane)
		"snake":
			var d: Vector2i = {KEY_LEFT: Vector2i(-1, 0), KEY_RIGHT: Vector2i(1, 0), KEY_UP: Vector2i(0, -1), KEY_DOWN: Vector2i(0, 1), KEY_A: Vector2i(-1, 0), KEY_D: Vector2i(1, 0), KEY_W: Vector2i(0, -1), KEY_S: Vector2i(0, 1)}.get(k, Vector2i.ZERO)
			if d != Vector2i.ZERO and d != -_dir:
				_dir = d
		"fishing":
			if k == KEY_SPACE or k == KEY_ENTER:
				_fish_press()

func _finish(text: String) -> void:
	_result = text
	_mode = "result"
	queue_redraw()

# ---- the games
func _start_karaoke(bpm: float) -> void:
	_mode = "play"
	_game = "karaoke"
	_t = 0.0
	_hit = 0
	_miss = 0
	_combo = 0
	_notes = []
	var beat := 60.0 / bpm
	var n := int(26.0 / beat)
	for i in n:
		if _rng.randf() < 0.75:
			_notes.append({"t": 2.0 + i * beat, "lane": _rng.randi() % 4, "done": false})

func _karaoke_press(lane: int) -> void:
	for nt in _notes:
		if not nt.done and nt.lane == lane and absf(nt.t - _t) < 0.16:
			nt.done = true
			_hit += 1
			_combo += 1
			return
	_combo = 0

func _start_arcade() -> void:
	_mode = "play"
	_t = 0.0
	_score = 0.0
	if _game == "snake":
		_snake = [Vector2i(8, 8), Vector2i(7, 8), Vector2i(6, 8)]
		_dir = Vector2i(1, 0)
		_food = Vector2i(14, 9)
		_acc = 0.0
	else:
		_ball = Vector2(160, 170)
		_bv = Vector2(120, -150)
		_pad = 140.0
		_bricks = []
		for r in 4:
			for c in 8:
				_bricks.append(Rect2(12 + c * 37, 24 + r * 14, 34, 11))

func _start_fishing() -> void:
	_mode = "play"
	_game = "fishing"
	_bite = false
	_wait = _rng.randf_range(1.2, 3.2)
	_bar = 0.0
	_bar_dir = 1.0
	_zone = Vector2(0.45, 0.62)
	_t = 0.0

func _fish_press() -> void:
	if not _bite:
		_finish("You pulled too early. Nothing was ever going to bite that fast.")
		return
	var inside := _bar >= _zone.x and _bar <= _zone.y
	if not inside:
		_finish("It got away. They always do, in stories you tell later.")
		return
	var r := _rng.randf()
	var id := "fish_aji"
	if r > 0.93: id = "fish_tai"
	elif r > 0.55: id = "fish_saba"
	elif r < 0.07: id = "fish_boot"
	GameState.give(id, 1)
	GameState.add_stress(-0.03)
	GameState.advance_minutes(15.0)
	_finish("Caught: %s. It is in the bag." % GameData.item(id).name)

func _process(dt: float) -> void:
	if not visible or _mode != "play":
		return
	step(dt)
	queue_redraw()

## One tick of whichever game is running; split out so the tests can drive it.
func step(dt: float) -> void:
	_t += dt
	match _game:
		"pachinko":
			_pach_spin -= dt
			for i in 3:
				_pach_reels[i] = str(_rng.randi() % 8) if _pach_spin > 0.4 * (3 - i) * 0.0 + 0.0 and _pach_spin > 0.0 else _pach_reels[i]
			if _pach_spin <= 0.0:
				if _pach_win > 0:
					GameState.money += _pach_win
					GameState.add_stress(-0.06)
					_finish("The balls pour out. You win %s." % GameState.yen(_pach_win))
				else:
					GameState.add_stress(-0.02)
					_finish("The lights flash for a long time. You win nothing, pleasantly.")
				GameState.advance_minutes(20.0)
		"karaoke":
			for nt in _notes:
				if not nt.done and _t - nt.t > 0.18:
					nt.done = true
					_miss += 1
					_combo = 0
			if _t > 2.0 + 27.0:
				var total := maxi(_hit + _miss, 1)
				var acc := float(_hit) / float(total)
				var relief := clampf(0.08 + 0.4 * acc, 0.0, 0.5)
				GameState.add_stress(-relief)
				GameState.advance_minutes(30.0)
				_finish("%d of %d notes. %s Stress -%d%%." % [_hit, total, ("A standing ovation, from one man." if acc > 0.8 else "Passion over pitch."), int(relief * 100.0)])
		"snake":
			_acc += dt
			if _acc >= 0.11:
				_acc = 0.0
				var head: Vector2i = _snake[0] + _dir
				if head.x < 0 or head.y < 0 or head.x >= 20 or head.y >= 15 or _snake.has(head):
					_arcade_end()
					return
				_snake.push_front(head)
				if head == _food:
					_score += 10.0
					_food = Vector2i(_rng.randi() % 20, _rng.randi() % 15)
				else:
					_snake.pop_back()
		"breakout":
			if Input.is_key_pressed(KEY_LEFT) or Input.is_key_pressed(KEY_A):
				_pad = maxf(_pad - 260.0 * dt, 24.0)
			if Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D):
				_pad = minf(_pad + 260.0 * dt, 296.0)
			_ball += _bv * dt
			if _ball.x < 4.0 or _ball.x > 316.0:
				_bv.x = -_bv.x
			if _ball.y < 4.0:
				_bv.y = absf(_bv.y)
			if _ball.y > 214.0 and _ball.y < 222.0 and absf(_ball.x - _pad) < 28.0 and _bv.y > 0.0:
				_bv.y = -absf(_bv.y)
				_bv.x += (_ball.x - _pad) * 3.0
			if _ball.y > 240.0:
				_arcade_end()
				return
			for b in _bricks:
				if (b as Rect2).has_point(_ball):
					_bricks.erase(b)
					_bv.y = -_bv.y
					_score += 5.0
					break
			if _bricks.is_empty():
				_arcade_end()
		"fishing":
			if not _bite:
				_wait -= dt
				if _wait <= 0.0:
					_bite = true
					_zone = Vector2(_rng.randf_range(0.2, 0.65), 0.0)
					_zone.y = _zone.x + 0.17
			else:
				_bar += _bar_dir * dt * 1.3
				if _bar > 1.0:
					_bar = 1.0
					_bar_dir = -1.0
				elif _bar < 0.0:
					_bar = 0.0
					_bar_dir = 1.0
				if _t > 12.0:
					_finish("The fish lost interest. So did you, a little.")

func _arcade_end() -> void:
	var relief := clampf(_score * 0.0035, 0.01, 0.12)
	GameState.add_stress(-relief)
	GameState.advance_minutes(10.0)
	_finish("Score %d. Stress -%d%%." % [int(_score), int(relief * 100.0)])

# ---- drawing
func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.02, 0.03, 0.06, 0.88))
	var f := ThemeDB.fallback_font
	var cx := size.x * 0.5
	draw_string(f, Vector2(cx, 80), title, HORIZONTAL_ALIGNMENT_CENTER, -1, 34, Color(1, 0.92, 0.7))
	draw_string(f, Vector2(size.x - 24, 40), GameState.yen(GameState.money), HORIZONTAL_ALIGNMENT_RIGHT, -1, 24, Color(0.95, 0.9, 0.7))
	_rects.clear()
	if _mode == "menu":
		var y := 170.0
		for i in _opts.size():
			var o: Dictionary = _opts[i]
			var r := Rect2(cx - 300, y, 600, 70)
			_rects.append(r)
			draw_rect(r, Color(1, 1, 1, 0.16 if i == _sel else 0.07))
			draw_string(f, Vector2(r.position.x + 20, y + 30), o.label, HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color.WHITE)
			draw_string(f, Vector2(r.position.x + 20, y + 56), o.note, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(1, 1, 1, 0.65))
			if int(o.get("cost", 0)) > 0:
				draw_string(f, Vector2(r.end.x - 20, y + 40), GameState.yen(int(o.cost)), HORIZONTAL_ALIGNMENT_RIGHT, -1, 22, Color(1, 0.9, 0.6))
			y += 84.0
		draw_string(f, Vector2(cx, size.y - 50), "↑ ↓ choose      Enter: go      Esc: leave", HORIZONTAL_ALIGNMENT_CENTER, -1, 16, Color(1, 1, 1, 0.55))
	elif _mode == "result":
		draw_string(f, Vector2(cx, size.y * 0.45), _result, HORIZONTAL_ALIGNMENT_CENTER, 900, 26, Color.WHITE)
		draw_string(f, Vector2(cx, size.y * 0.45 + 60), "Enter: back      Esc: leave", HORIZONTAL_ALIGNMENT_CENTER, -1, 16, Color(1, 1, 1, 0.55))
	else:
		_draw_game(f)

func _draw_game(f: Font) -> void:
	var cx := size.x * 0.5
	var ox := cx - 320.0
	var oy := 130.0
	match _game:
		"pachinko":
			for i in 3:
				var r := Rect2(cx - 190 + i * 130, 260, 110, 140)
				draw_rect(r, Color(0.15, 0.04, 0.04))
				draw_rect(r, Color(1, 0.8, 0.2), false, 4.0)
				draw_string(f, Vector2(r.position.x + 55, 350), _pach_reels[i], HORIZONTAL_ALIGNMENT_CENTER, -1, 72, Color(1, 0.9, 0.3))
			draw_string(f, Vector2(cx, 470), "...", HORIZONTAL_ALIGNMENT_CENTER, -1, 30, Color(1, 1, 1, 0.5))
		"karaoke":
			draw_rect(Rect2(cx - 220, oy, 440, 440), Color(0.05, 0.02, 0.1))
			for l in 4:
				draw_rect(Rect2(cx - 220 + l * 110, oy, 108, 440), Color(1, 1, 1, 0.04))
				draw_circle(Vector2(cx - 165 + l * 110, oy + 400), 26, Color(1, 1, 1, 0.18))
				draw_string(f, Vector2(cx - 165 + l * 110, oy + 408), ["←", "↓", "↑", "→"][l], HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color(1, 1, 1, 0.8))
			for nt in _notes:
				if nt.done:
					continue
				var y: float = oy + 400.0 - (nt.t - _t) * 220.0
				if y > oy - 20 and y < oy + 460:
					draw_circle(Vector2(cx - 165 + nt.lane * 110, y), 24, [Color(1, 0.4, 0.5), Color(0.4, 0.9, 1), Color(0.6, 1, 0.5), Color(1, 0.85, 0.3)][nt.lane])
			draw_string(f, Vector2(cx, oy + 480), "hits %d   misses %d   combo %d" % [_hit, _miss, _combo], HORIZONTAL_ALIGNMENT_CENTER, -1, 20, Color.WHITE)
		"snake":
			var cs := 24.0
			var o := Vector2(cx - 240, 140)
			draw_rect(Rect2(o, Vector2(20 * cs, 15 * cs)), Color(0.04, 0.12, 0.06))
			for s in _snake:
				draw_rect(Rect2(o + Vector2(s.x, s.y) * cs, Vector2(cs - 2, cs - 2)), Color(0.5, 0.95, 0.4))
			draw_rect(Rect2(o + Vector2(_food.x, _food.y) * cs, Vector2(cs - 2, cs - 2)), Color(1, 0.4, 0.4))
			draw_string(f, Vector2(cx, 140 + 15 * cs + 40), "score %d" % int(_score), HORIZONTAL_ALIGNMENT_CENTER, -1, 22, Color.WHITE)
		"breakout":
			var k := 2.0
			var o2 := Vector2(cx - 320, 120)
			draw_rect(Rect2(o2, Vector2(320, 240) * k), Color(0.04, 0.04, 0.12))
			for b in _bricks:
				draw_rect(Rect2(o2 + (b as Rect2).position * k, (b as Rect2).size * k), Color(0.9, 0.5, 0.2))
			draw_rect(Rect2(o2 + Vector2(_pad - 28, 222) * k, Vector2(56, 6) * k), Color(0.8, 0.9, 1))
			draw_circle(o2 + _ball * k, 6.0, Color.WHITE)
			draw_string(f, Vector2(cx, 120 + 240 * k + 34), "score %d" % int(_score), HORIZONTAL_ALIGNMENT_CENTER, -1, 22, Color.WHITE)
		"fishing":
			draw_rect(Rect2(cx - 260, 300, 520, 40), Color(0.1, 0.18, 0.28))
			if _bite:
				draw_rect(Rect2(cx - 260 + _zone.x * 520.0, 300, (_zone.y - _zone.x) * 520.0, 40), Color(0.3, 0.8, 0.4))
				draw_rect(Rect2(cx - 260 + _bar * 520.0 - 3, 292, 6, 56), Color.WHITE)
				draw_string(f, Vector2(cx, 280), "A BITE! Space!", HORIZONTAL_ALIGNMENT_CENTER, -1, 30, Color(1, 0.9, 0.3))
			else:
				draw_string(f, Vector2(cx, 280), "Waiting. The sea thinks about it.", HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color(1, 1, 1, 0.7))
