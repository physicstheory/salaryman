class_name PhoneUI
extends Control
## The phone, as in the web build: a home screen of apps over a wallpaper, a status bar, and the apps themselves.
## P opens and closes it, Esc goes back a screen, and the mouse or the arrow keys and Enter work throughout.

signal closed

const WALLPAPERS := [["Dusk", Color(0.16, 0.1, 0.32), Color(0.9, 0.35, 0.45)], ["Harbour", Color(0.03, 0.12, 0.2), Color(0.12, 0.45, 0.6)], ["Neon", Color(0.08, 0.02, 0.15), Color(0.9, 0.2, 0.7)], ["Forest", Color(0.04, 0.12, 0.08), Color(0.3, 0.6, 0.35)], ["Graphite", Color(0.1, 0.1, 0.12), Color(0.3, 0.32, 0.38)]]
const CONTACTS := [["Mom", "090-5550-0143"], ["Section Chief Hara", "03-5550-8821"], ["Ramen Ippai (reservations)", "03-5550-1177"], ["Ryde Support", "0120-555-0199"], ["Dr. Aoki, Dentist", "03-5550-4400"]]
const STATIONS := [["FM Tōkonto", "Pop", 118, 0], ["Lo-fi Night Desk", "Lo-fi", 78, 1], ["City Pop 1984", "City pop", 104, 2], ["Kissaten Jazz", "Jazz", 92, 3], ["Enka Hour", "Enka", 66, 4], ["Talk 1180", "Talk radio", 0, 5]]
const NEWS := ["Section chiefs announce 'a brief word' will last until Thursday", "Tōkonto Station to repaint the platform edge line, again", "Man discovers a vending machine that sells exactly the right drink", "Rain expected, followed by a forecast of rain", "Last train to leave on time, officials insist it has always done so", "Pachinko parlour awarded 'Most Honest Lights' by committee", "Capsule hotel adds a slightly larger capsule tier", "Convenience store sells out of the good onigiri; mourning observed"]
const FORUM := [["Is it normal to eat dinner at 11pm every night?", "Yes. Next question."], ["How do I tell my boss no", "You do not. You say 'that would be difficult'."], ["Best vending machine near the station?", "The one with the kind light."], ["Cheap suits that look expensive", "Dark colours and confident posture. And a very small budget."]]
const POSTS := ["{shop}!! I go there every week", "{brand} spotted 👀", "That shopfront on {street} has great light", "POV: you missed the last train and the capsule hotel is full #salaryman", "Rain on {street}, neon on the puddles. This city.", "Found a vending machine that sells soup. Soup. In a can.", "{station} at midnight is a different country", "my boss: 'a quick word'. 40 minutes later.", "whoever put the yellow light on {street}: thank you", "ramen at 1am, no regrets, many regrets", "the 11 on {street} knows my order now", "walked past a pachinko parlour. my ears are still ringing", "this park is the only quiet place in town", "umbrella count this year: 4 lost, 1 returned (not mine)"]


var game: Game
var screen: Control               # the part of the glass apps draw in (below the status bar, above the nav)
var app := ""
var _wall_i := 0
var _bright := 1.0
var _dim: ColorRect
var _pages: Array = []            # a stack of builders, for Back
var _music: PhoneMusic
var _viewfinder := false
var _flash: ColorRect
var body: Control
var _chrome_back: PhoneChrome
var _chrome_front: PhoneChrome
var _wallctl: PhoneWall
var _dev_id := ""
var _lay: Dictionary = {}
var _sel := 0

func _init() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

func _gui_input(e: InputEvent) -> void:
	if _viewfinder and e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		if (e.position - Vector2(size.x * 0.5, size.y - 60.0)).length() < 30.0:
			_take_photo()

func _fit() -> void:
	position = Vector2.ZERO
	size = get_viewport().get_visible_rect().size
	if body and not _lay.is_empty():
		body.position = Vector2(size.x - _lay.bw - 36.0, (size.y - _lay.bh) * 0.5)

func _sb(c: Color, r := 14.0, border := Color(0, 0, 0, 0), bw := 0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = c
	s.set_corner_radius_all(int(r))
	if bw > 0:
		s.border_color = border
		s.set_border_width_all(bw)
	s.content_margin_left = 10
	s.content_margin_right = 10
	s.content_margin_top = 6
	s.content_margin_bottom = 6
	return s

func _dev() -> Dictionary:
	return GameData.raw.devices.get(GameState.device, GameData.raw.devices.so24)

func _basic() -> bool:
	return PhoneChrome.is_basic(_dev())

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	visible = false
	body = Control.new()
	body.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(body)
	_chrome_back = PhoneChrome.new()
	_chrome_back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(_chrome_back)
	_wallctl = PhoneWall.new()
	body.add_child(_wallctl)
	screen = Control.new()
	screen.clip_contents = true
	screen.mouse_filter = Control.MOUSE_FILTER_PASS
	body.add_child(screen)
	_dim = ColorRect.new()
	_dim.color = Color(0, 0, 0, 0)
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(_dim)
	_chrome_front = PhoneChrome.new()
	_chrome_front.front = true
	_chrome_front.key.connect(_on_key)
	body.add_child(_chrome_front)
	_flash = ColorRect.new()
	_flash.color = Color(1, 1, 1, 0)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_flash)
	_music = PhoneMusic.new()
	add_child(_music)
	get_viewport().size_changed.connect(_fit)
	_rebuild_body()

## Lay the handset out for the phone in the player's hand: its size, glass, cut-out, colour and wallpaper.
func _rebuild_body() -> void:
	var d := _dev()
	_dev_id = String(d.get("id", GameState.device))
	_lay = PhoneChrome.layout(d)
	body.size = Vector2(_lay.bw, _lay.bh)
	for ch in [_chrome_back, _chrome_front]:
		ch.dev = d
		ch.paint = GameState.phone_paint
		ch.position = Vector2.ZERO
		ch.size = body.size
		ch.queue_redraw()
	var sr: Rect2 = _lay.screen
	_wallctl.kind = String(d.get("ui", "soti"))
	_wallctl.dev = d
	_wallctl.position = sr.position
	_wallctl.size = sr.size
	var st: float = _lay.status
	var nv: float = _lay.nav
	screen.position = sr.position + Vector2(8, st)
	screen.size = Vector2(sr.size.x - 16, sr.size.y - st - nv)
	if _basic():
		screen.position = sr.position + Vector2(6, st)
		screen.size = Vector2(sr.size.x - 12, sr.size.y - st - nv)
	_dim.position = sr.position
	_dim.size = sr.size
	_apply_wall()
	_fit()

func _on_key(k: String) -> void:
	match k:
		"home", "recents":
			go_home()
		"back":
			if app == "":
				close_phone()
			else:
				_back()
		"ok":
			var f := get_viewport().gui_get_focus_owner()
			if f is Button:
				(f as Button).pressed.emit()
		"end":
			close_phone()
		"call":
			open_app("Phone")
		"clear":
			_back()

func _apply_wall() -> void:
	var w: Array = WALLPAPERS[_wall_i]
	_wallctl.top = w[1]
	_wallctl.bottom = w[2]
	if _wallctl.kind == "soti":
		_wallctl.top = w[1].lightened(0.1)
		_wallctl.bottom = w[2]
	if _wallctl.kind == "pear" and _wall_i == 0:
		# Pear's own default wash: teal into violet
		_wallctl.top = Color("#5a3fa0")
		_wallctl.bottom = Color("#2a8a86")
	_wallctl.queue_redraw()

var _redraw_t := 0.0

func _process(_dt: float) -> void:
	if not visible:
		return
	_flash.color.a = move_toward(_flash.color.a, 0.0, _dt * 3.0)
	_redraw_t += _dt
	if _redraw_t > 0.15:
		_redraw_t = 0.0
		_chrome_front.music = _music != null and _music.playing >= 0
		_chrome_front.queue_redraw()
	if _viewfinder:
		queue_redraw()

func open_phone() -> void:
	visible = true
	if String(_dev().get("id", "")) != _dev_id or _chrome_front.paint != GameState.phone_paint:
		app = ""
		_rebuild_body()
	if app == "":
		go_home()
	else:
		_build_app(app)

func close_phone() -> void:
	if _viewfinder:
		_viewfinder = false
		body.visible = true
	visible = false
	closed.emit()

func _icon(a: Array, s: float) -> PhoneIcon:
	var ic := PhoneIcon.new(Color(a[1]), a[2])
	ic.custom_minimum_size = Vector2(s, s)
	ic.size = Vector2(s, s)
	if a[0] == "Mail":
		for m in GameState.mails:
			if not m.read:
				ic.badge += 1
	return ic

## An app on the home screen: its icon and its name, focusable so the D-pad, the keys and a controller all reach it.
func _app_cell(a: Array, s: float, fs: int, labels := true) -> Button:
	var b := Button.new()
	b.flat = true
	b.focus_mode = Control.FOCUS_ALL
	b.custom_minimum_size = Vector2(s + 10.0, s + (22.0 if labels else 8.0))
	var empty := StyleBoxEmpty.new()
	for st in ["normal", "hover", "pressed", "disabled"]:
		b.add_theme_stylebox_override(st, empty)
	b.add_theme_stylebox_override("focus", _sb(Color(1, 1, 1, 0.18), 16.0, Color(1, 1, 1, 0.9), 2))
	var ic := _icon(a, s)
	ic.position = Vector2(5, 4)
	b.add_child(ic)
	if labels:
		var l := Label.new()
		l.text = a[0]
		l.add_theme_font_size_override("font_size", fs)
		l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
		l.add_theme_constant_override("shadow_offset_x", 1)
		l.add_theme_constant_override("shadow_offset_y", 1)
		l.position = Vector2(0, s + 6.0)
		l.size = Vector2(s + 10.0, 16)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.clip_text = true
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(l)
	b.pressed.connect(open_app.bind(a[0]))
	return b

func _home_apps() -> Array:
	var list: Array = []
	var basic := _basic()
	for a in GameData.raw.phone_apps:
		if basic and not GameData.raw.basic_apps.has(a[0]):
			continue
		list.append(a)
	if GameState.owned.has("pearwatch") or GameState.owned.has("pearwatchu"):
		list.append(["Health", "#ff2d55", "heart"])
	return list

func _glass(parent: Control, r: Rect2, col := Color(1, 1, 1, 0.16), rad := 20.0) -> Panel:
	var p := Panel.new()
	p.position = r.position
	p.size = r.size
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_theme_stylebox_override("panel", _sb(col, rad, Color(1, 1, 1, 0.18), 1))
	parent.add_child(p)
	return p

func _lbl(parent: Control, t: String, pos: Vector2, fs: int, col := Color.WHITE, w := -1.0, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.text = t
	l.position = pos
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", col)
	l.horizontal_alignment = align
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if w > 0.0:
		l.size = Vector2(w, fs + 8)
	parent.add_child(l)
	return l

func _dock_apps(list: Array) -> Array:
	var dock: Array = []
	for n in ["Ryde", "Poodle", "Phone", "Camera"]:
		for a in list:
			if a[0] == n:
				dock.append(a)
	return dock

func go_home() -> void:
	app = ""
	_pages.clear()
	_viewfinder = false
	body.visible = true
	_clear()
	var d := _dev()
	var ui := String(d.get("ui", "soti"))
	var list := _home_apps()
	var sw := screen.size.x
	var sh := screen.size.y
	var first: Button
	var day := Time.get_datetime_dict_from_system()
	match ui:
		"pear":
			# widgets, a four-wide grid, a search pill and a dock, on a soft wash
			var wy := 4.0
			var ww := (sw - 12.0) * 0.5
			_glass(screen, Rect2(0, wy, ww, 100), Color(1, 1, 1, 0.18))
			_lbl(screen, "TŌKONTO", Vector2(10, wy + 6), 9, Color(1, 1, 1, 0.8))
			_lbl(screen, GameState.clock_text(), Vector2(8, wy + 16), 38, Color.WHITE, ww - 8)
			_lbl(screen, "Day %d" % GameState.day, Vector2(10, wy + 74), 10, Color(1, 1, 1, 0.8))
			_glass(screen, Rect2(ww + 12, wy, ww, 100), Color(1, 1, 1, 0.18))
			_lbl(screen, "WEATHER", Vector2(ww + 22, wy + 6), 9, Color(1, 1, 1, 0.8))
			_lbl(screen, "18°", Vector2(ww + 20, wy + 16), 38, Color.WHITE)
			_lbl(screen, "Clear · H 21° L 12°", Vector2(ww + 22, wy + 74), 10, Color(1, 1, 1, 0.8))
			var grid := GridContainer.new()
			grid.columns = 4
			grid.position = Vector2(-2, 116)
			grid.add_theme_constant_override("h_separation", 2)
			grid.add_theme_constant_override("v_separation", 4)
			screen.add_child(grid)
			for a in list:
				var b := _app_cell(a, 50.0, 10)
				grid.add_child(b)
				if first == null:
					first = b
			var pill := _glass(screen, Rect2(sw * 0.5 - 52, sh - 126, 104, 22), Color(1, 1, 1, 0.2), 11.0)
			_lbl(pill, "⌕ Search", Vector2(0, 2), 11, Color(1, 1, 1, 0.85), 104, HORIZONTAL_ALIGNMENT_CENTER)
			_glass(screen, Rect2(0, sh - 92, sw, 86), Color(1, 1, 1, 0.2), 26.0)
			var dx := 14.0
			for a in _dock_apps(list):
				var ic := _icon(a, 50.0)
				ic.position = Vector2(dx + 4, sh - 76)
				screen.add_child(ic)
				dx += (sw - 28.0) / 4.0
		"basic":
			var grid2 := GridContainer.new()
			grid2.columns = 3
			grid2.position = Vector2(6, 8)
			grid2.add_theme_constant_override("h_separation", 2)
			grid2.add_theme_constant_override("v_separation", 0)
			screen.add_child(grid2)
			for a in list:
				var b := _app_cell(a, 38.0, 9)
				grid2.add_child(b)
				if first == null:
					first = b
			var tk := ColorRect.new()
			tk.color = Color(0, 0, 0, 0.45)
			tk.position = Vector2(0, sh - 18)
			tk.size = Vector2(sw, 18)
			tk.mouse_filter = Control.MOUSE_FILTER_IGNORE
			screen.add_child(tk)
			_lbl(tk, "●  OPEN 24 HOURS  ●  ONIGIRI 2 FOR ¥200" if d.id == "eleven" else "●  PET MART  ●  YOUR NEIGHBOURHOOD STORE", Vector2(6, 1), 10, Color.WHITE)
		_:
			# SOTI: a big clock and date, a four-wide grid and a dock over the skyline
			_lbl(screen, GameState.clock_text(), Vector2(0, -2), 66, Color.WHITE, sw, HORIZONTAL_ALIGNMENT_CENTER)
			_lbl(screen, "Day %d · Tōkonto" % GameState.day, Vector2(0, 76), 13, Color(1, 1, 1, 0.85), sw, HORIZONTAL_ALIGNMENT_CENTER)
			var grid3 := GridContainer.new()
			grid3.columns = 4
			grid3.position = Vector2(-2, 112)
			grid3.add_theme_constant_override("h_separation", 2)
			grid3.add_theme_constant_override("v_separation", 6)
			screen.add_child(grid3)
			for a in list:
				var b := _app_cell(a, 46.0, 11)
				grid3.add_child(b)
				if first == null:
					first = b
			_glass(screen, Rect2(2, sh - 70, sw - 4, 66), Color(1, 1, 1, 0.14), 24.0)
			var dx2 := 12.0
			for a in _dock_apps(list):
				var ic2 := _icon(a, 46.0)
				ic2.position = Vector2(dx2 + 2, sh - 60)
				screen.add_child(ic2)
				dx2 += (sw - 24.0) / 4.0
	if first:
		first.grab_focus.call_deferred()

func open_app(name: String) -> void:
	app = name
	_pages.clear()
	_build_app(name)

func _clear() -> void:
	for c in screen.get_children():
		c.queue_free()

func _push(builder: Callable) -> void:
	_pages.append(builder)
	_clear()
	builder.call()

func _back() -> void:
	if _viewfinder:
		_viewfinder = false
		body.visible = true
	if _pages.size() > 1:
		_pages.pop_back()
		_clear()
		_pages.back().call()
	else:
		go_home()

func _unhandled_key_input(e: InputEvent) -> void:
	if not visible or not (e is InputEventKey) or not e.pressed or e.echo:
		return
	if e.keycode == KEY_P:
		close_phone()
		get_viewport().set_input_as_handled()
	elif e.keycode == KEY_ESCAPE:
		if app == "":
			close_phone()
		else:
			_back()
		get_viewport().set_input_as_handled()
	elif _viewfinder and (e.keycode == KEY_SPACE or e.keycode == KEY_ENTER):
		_take_photo()
		get_viewport().set_input_as_handled()

# ---- small builders
func _page(title: String) -> VBoxContainer:
	var vb := VBoxContainer.new()
	vb.position = Vector2(0, 0)
	vb.size = screen.size
	vb.add_theme_constant_override("separation", 6)
	screen.add_child(vb)
	var h := HBoxContainer.new()
	vb.add_child(h)
	var bk := Button.new()
	bk.text = "‹ Back"
	bk.focus_mode = Control.FOCUS_ALL
	bk.add_theme_stylebox_override("normal", _sb(Color(1, 1, 1, 0.12), 10.0))
	bk.pressed.connect(_back)
	h.add_child(bk)
	var t := Label.new()
	t.text = "  " + title
	t.add_theme_font_size_override("font_size", 20)
	t.clip_text = true
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(t)
	return vb

func _scroll(parent: Control) -> VBoxContainer:
	var sc := ScrollContainer.new()
	sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	parent.add_child(sc)
	var vb := VBoxContainer.new()
	vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vb.add_theme_constant_override("separation", 6)
	sc.add_child(vb)
	return vb

func _btn(parent: Control, text: String, cb: Callable, col := Color(1, 1, 1, 0.1)) -> Button:
	var b := Button.new()
	b.text = text
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.clip_text = true
	b.add_theme_font_size_override("font_size", 15)
	b.add_theme_stylebox_override("normal", _sb(col, 12.0))
	b.add_theme_stylebox_override("hover", _sb(col.lightened(0.15), 12.0))
	b.add_theme_stylebox_override("focus", _sb(col.lightened(0.15), 12.0, Color.WHITE, 2))
	b.pressed.connect(cb)
	parent.add_child(b)
	return b

func _text(parent: Control, text: String, size := 15, col := Color(1, 1, 1, 0.9)) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	l.modulate = col
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(l)
	return l

func _build_app(name: String) -> void:
	match name:
		"Ryde": _push(_ryde)
		"Poodle": _push(_poodle)
		"Wallet": _push(_wallet)
		"Camera": _push(_camera)
		"Photos": _push(_photos)
		"MyGram": _push(_mygram)
		"Nihon": _push(_nihon)
		"Phone": _push(_dialer)
		"Mail": _push(_mail)
		"Contacts": _push(_contacts)
		"Music": _push(_music_app)
		"Settings": _push(_settings)
		"Numbers": _push(_numbers)
		"Health": _push(_health)
		_: go_home()

# ---- Ryde: a car to anywhere you can name
func _destinations() -> Array:
	var w := game.world
	var P := CityWorld.P
	var out: Array = [["Tōkonto Station", Vector3(w.rail_x - 14.0, 0.3, 3.0 * P + 26.0)], ["The park", Vector3(4.5 * P, 0.3, 3.0 * P + 12.0)], ["The harbour", Vector3(8.0 * P - 8.0, 0.3, 4.0 * P)], ["Where you started", Vector3(2.0 * P + 7.0, 0.3, 5.0 * P + 11.0)]]
	var seen := {}
	for s in w.shops:
		var key: String = s.shop_name
		if seen.has(key) and seen[key] >= 1:
			continue
		seen[key] = seen.get(key, 0) + 1
		out.append([s.shop_name + " (" + MapDraw.street_name(w, s.door.x, s.door.z) + ")", s.door])
	return out

func _ryde() -> void:
	var vb := _page("Ryde")
	_text(vb, "Where to? A car is three minutes away, and it is always an Audi.", 14, Color(1, 1, 1, 0.7))
	var list := _scroll(vb)
	var here := game.player.global_position
	for d in _destinations():
		var dist := Vector2(d[1].x - here.x, d[1].z - here.z).length()
		var fare := 380 + int(dist * 1.4)
		_btn(list, "%s\n%s · %d m" % [d[0], GameState.yen(fare), int(dist)], _ryde_go.bind(d[0], d[1], fare), Color(0.07, 0.45, 0.28, 0.9))

func _ryde_go(place: String, pos: Vector3, fare: int) -> void:
	if game.current:
		GameState.say("Ryde", "Get out of your car first", "Ryde only picks up pedestrians.", 3.0)
		return
	if not GameState.spend(fare, "Ryde to " + place):
		GameState.say("Ryde", "Not enough money", "The fare is %s." % GameState.yen(fare), 3.0)
		return
	close_phone()
	game.ryde_to(pos, place)

# ---- Poodle: the internet
func _poodle() -> void:
	var vb := _page("Poodle")
	var search := LineEdit.new()
	search.placeholder_text = "Search the web"
	vb.add_child(search)
	var list := _scroll(vb)
	var fill := func(filter: String):
		for c in list.get_children():
			c.queue_free()
		var f := filter.to_lower()
		for s in GameData.raw.web:
			if f == "" or (s.title + " " + s.host + " " + s.get("kw", "")).to_lower().contains(f):
				_btn(list, "%s\n%s" % [s.title, s.host], _site.bind(s), Color(0.2, 0.35, 0.6, 0.7))
		for s in GameData.raw.filler_sites:
			if f == "" or (s.title + " " + s.host + " " + s.get("kw", "")).to_lower().contains(f):
				_btn(list, "%s\n%s" % [s.title, s.host], _site.bind(s), Color(0.25, 0.25, 0.3, 0.8))
	search.text_changed.connect(fill)
	fill.call("")

func _site(s: Dictionary) -> void:
	_push(func(): _site_page(s))

func _site_page(s: Dictionary) -> void:
	var vb := _page(s.title)
	_text(vb, s.host, 12, Color(0.6, 0.8, 1.0))
	var list := _scroll(vb)
	var kind: String = s.get("kind", "page")
	if kind == "shop" or kind == "tech":
		var shelves: Array = GameData.shelves_for(s.brand) if kind == "shop" else GameData.dokoto_shelves()
		_text(list, "Order online. It arrives with Hayabin, in the bag.", 13, Color(1, 1, 1, 0.65))
		for sh in shelves:
			_text(list, sh.name, 16, Color(1, 0.85, 0.5))
			for it in sh.items:
				var hours := float(it.get("days", 0)) * 24.0 + 2.0
				_btn(list, "%s   %s" % [it.name, GameState.yen(int(it.get("price", 0)))], _web_buy.bind(it, hours))
	elif kind == "cars":
		_text(list, "Showroom prices. Test drives happen at the lot; the lot opens in a later build.", 13, Color(1, 1, 1, 0.65))
		var cars := {"luxury": [["Audi RS Q8", 18900000], ["Audi A7 Sportback", 11800000], ["BYD Song", 4980000]], "budget": [["Kei car", 980000], ["Kei van", 1180000], ["Family sedan", 2180000]], "cruiser": [["Hadson Roadking", 2890000], ["Hadson Sportster", 1980000]]}
		for c in cars.get(s.get("tier", "budget"), []):
			_text(list, "%s   %s" % [c[0], GameState.yen(c[1])], 17)
	elif kind == "news":
		for n in NEWS:
			_text(list, "• " + n, 15)
	elif kind == "forum":
		for f in FORUM:
			_text(list, f[0], 16, Color(1, 0.85, 0.5))
			_text(list, "↳ " + f[1], 14, Color(1, 1, 1, 0.7))
	elif kind == "scam":
		_text(list, "★ CONGRATULATIONS! ★\nYou are our 1,000,000th visitor and have WON a free vacation.", 18, Color(1, 0.9, 0.3))
		_btn(list, "CLAIM NOW (processing fee ¥3,000)", func():
			if GameState.spend(3000, "win-now.biz processing fee"):
				GameState.say("Poodle", "Fee paid", "No vacation has been, or will be, received.", 4.0)
				GameState.mails.push_front({"from": "win-now.biz", "subject": "Your vacation (pending)", "body": "Thank you for your fee. Your vacation is in the post. The post is also in the post.", "read": false}), Color(0.7, 0.2, 0.15, 0.9))
	elif kind == "gov":
		for l in ["Tōkonto City Hall — Services", "Parking fines: pay at the counter (counters open Tuesdays)", "Residence certificate: Form 7-B, in triplicate", "Lost property: umbrellas, 4,112; umbrellas collected, 3"]:
			_text(list, l, 15)
	else:
		_text(list, s.get("tag", ""), 17, Color(1, 0.85, 0.5))
		for l in s.get("lines", []):
			_text(list, l, 15)

func _web_buy(it: Dictionary, hours: float) -> void:
	var id: String = it.id
	if it.has("device"):
		if GameState.owned.has(it.device):
			GameState.say("Poodle", "You already own that", "", 2.5)
			return
		if GameState.spend(int(it.price), it.name):
			GameState.owned[it.device] = true
			GameState.device = it.device
			GameState.phone_paint = 0
			GameState.say("Phone", "New phone", "%s is yours." % it.name, 4.0)
		else:
			GameState.say("Poodle", "Not enough money", "", 2.5)
		return
	if it.has("tv") or it.has("game") or it.has("gear"):
		if GameState.owned.has(id):
			GameState.say("Poodle", "You already own that", "", 2.5)
		elif GameState.spend(int(it.price), it.name):
			GameState.owned[id] = true
			GameState.say("Hayabin", "Order placed", "%s ships to the safehouse." % it.name, 4.0)
		else:
			GameState.say("Poodle", "Not enough money", "", 2.5)
		return
	if not GameState.order(id, it.name, int(it.get("price", 0)), hours):
		GameState.say("Poodle", "Not enough money", "", 2.5)

# ---- Wallet
func _wallet() -> void:
	var vb := _page("Wallet")
	var big := _text(vb, GameState.yen(GameState.money), 36, Color(0.95, 0.9, 0.7))
	big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if not GameState.deliveries.is_empty():
		_text(vb, "On its way", 14, Color(1, 0.85, 0.5))
		for d in GameState.deliveries:
			_text(vb, "📦 %s · about %d min" % [d.name, maxi(0, int(d.due - GameState.abs_minute()))], 13)
	_text(vb, "Recent", 14, Color(1, 0.85, 0.5))
	var list := _scroll(vb)
	if GameState.ledger.is_empty():
		_text(list, "Nothing spent yet.", 14, Color(1, 1, 1, 0.6))
	for l in GameState.ledger:
		_text(list, "Day %d %s   %s   %s" % [l.day, l.clock, l.what, GameState.yen(int(l.yen))], 13)

# ---- Camera and Photos
func _camera() -> void:
	_viewfinder = true
	body.visible = false              # the whole screen is the viewfinder
	var vb := _page("Camera")
	var dev: Dictionary = GameData.raw.devices.get(GameState.device, {"cam": 3, "camera": "12 MP"})
	_text(vb, "%s · camera %d/10" % [dev.get("camera", "12 MP"), int(dev.get("cam", 3))], 13, Color(1, 1, 1, 0.65))
	var frame := ColorRect.new()
	frame.color = Color(0, 0, 0, 0)
	frame.custom_minimum_size = Vector2(0, 380)
	vb.add_child(frame)
	_text(vb, "Frame the city, then press Space or the button.", 13, Color(1, 1, 1, 0.65))
	_btn(vb, "●  Take photo", _take_photo, Color(0.8, 0.2, 0.2, 0.9))
	# the viewfinder: hide the phone body so the city fills the screen behind it
	body.modulate = Color(1, 1, 1, 0.0 if false else 1.0)

func _take_photo() -> void:
	var img: Image = game.stage.get_texture().get_image()
	if img == null:
		return
	img.resize(960, 540, Image.INTERPOLATE_BILINEAR)
	DirAccess.make_dir_recursive_absolute("user://photos")
	var path := "user://photos/p_%d.png" % Time.get_ticks_msec()
	img.save_png(path)
	GameState.photos.append(path)
	_flash.color.a = 0.8
	GameState.say("Camera", "Photo saved", "%d in the gallery" % GameState.photos.size(), 2.5)

func _photos() -> void:
	var vb := _page("Photos")
	if GameState.photos.is_empty():
		_text(vb, "No photos yet. The Camera app has a shutter.", 14, Color(1, 1, 1, 0.65))
		return
	var list := _scroll(vb)
	for p in GameState.photos.slice(maxi(0, GameState.photos.size() - 12)):
		if not FileAccess.file_exists(p):
			continue
		var img := Image.load_from_file(p)
		if img == null:
			continue
		var tr := TextureRect.new()
		tr.texture = ImageTexture.create_from_image(img)
		tr.custom_minimum_size = Vector2(0, 150)
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		list.add_child(tr)

# ---- MyGram
func _mygram() -> void:
	var vb := _page("MyGram")
	var list := _scroll(vb)
	var rng := RandomNumberGenerator.new()
	rng.seed = GameState.day * 977 + int(GameState.clock_min / 120.0)
	var handles := ["aiko_in_tokonto", "salaryman_no_1", "noodle.hunter", "last.train.kei", "umbrella_thief_hq", "konbini_poet", "night.shift.mika", "pachinko_ghost"]
	var shops: Array = game.world.shops
	for k in 10:
		var tmpl: String = POSTS[rng.randi() % POSTS.size()]
		var shop = shops[rng.randi() % shops.size()] if shops.size() > 0 else null
		var street := MapDraw.street_name(game.world, shop.door.x, shop.door.z) if shop else "the main street"
		var text := tmpl.replace("{shop}", shop.shop_name if shop else "that shop").replace("{brand}", shop.shop_name if shop else "that place").replace("{street}", street).replace("{station}", "Tōkonto Station")
		var key := "p%d_%d_%d" % [GameState.day, k, hash(tmpl)]
		var likes := rng.randi_range(8, 4200)
		var card := VBoxContainer.new()
		card.add_theme_constant_override("separation", 2)
		list.add_child(card)
		_text(card, "@" + handles[rng.randi() % handles.size()], 13, Color(1, 0.6, 0.85))
		_text(card, text, 15)
		var liked: bool = GameState.liked.has(key)
		var lb := _btn(card, ("♥ %d" % (likes + (1 if liked else 0))), func(): pass, Color(1, 1, 1, 0.06))
		lb.pressed.connect(func():
			if not GameState.liked.has(key):
				GameState.liked[key] = true
				GameState.add_stress(-0.004)
				lb.text = "♥ %d" % (likes + 1))

# ---- Nihon: the trains, as they actually are
func _nihon() -> void:
	var vb := _page("Nihon Rail")
	_text(vb, "Tōkonto Station · Kanjō Loop", 18, Color(0.6, 1.0, 0.75))
	var list := _scroll(vb)
	var sz := 3.0 * CityWorld.P + 26.0
	for t in game.world.trains:
		var dirname := "Northbound (to the harbour road)" if t.dir > 0.0 else "Southbound (to the old town)"
		if t.waiting > 0.0:
			_text(list, "%s\nDeparting the depot in %d s" % [dirname, int(t.waiting)], 15)
		else:
			var d := (sz - t.z) * t.dir
			if d >= 0.0:
				_text(list, "%s\nArriving in %d s" % [dirname, int(d / t.speed)], 15)
			else:
				_text(list, "%s\nHas just left the station" % dirname, 15, Color(1, 1, 1, 0.6))
	_text(list, "Please stand behind the yellow line. The yellow line is also a suggestion.", 13, Color(1, 1, 1, 0.55))

# ---- Phone, Contacts, Numbers
func _dialer() -> void:
	var vb := _page("Phone")
	var num := _text(vb, "", 30)
	num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	num.custom_minimum_size = Vector2(0, 46)
	var g := GridContainer.new()
	g.columns = 3
	vb.add_child(g)
	for k in ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]:
		var b := Button.new()
		b.text = k
		b.custom_minimum_size = Vector2(96, 50)
		b.add_theme_font_size_override("font_size", 22)
		b.add_theme_stylebox_override("normal", _sb(Color(1, 1, 1, 0.1), 12.0))
		b.pressed.connect(func(): num.text += k)
		g.add_child(b)
	var row := HBoxContainer.new()
	vb.add_child(row)
	_btn(row, "⌫", func(): num.text = num.text.substr(0, maxi(0, num.text.length() - 1)), Color(1, 1, 1, 0.1))
	var call := _btn(row, "Call", func(): _call(num.text), Color(0.15, 0.6, 0.3, 0.95))
	call.size_flags_horizontal = Control.SIZE_EXPAND_FILL

func _contacts() -> void:
	var vb := _page("Contacts")
	var list := _scroll(vb)
	for c in CONTACTS:
		_btn(list, "%s\n%s" % [c[0], c[1]], func(): _call(c[0]), Color(0.5, 0.4, 0.2, 0.7))

func _numbers() -> void:
	var vb := _page("Emergency numbers")
	_text(vb, "Free from any phone. Please use for emergencies.", 13, Color(1, 1, 1, 0.6))
	for c in [["110  Police", "110"], ["119  Ambulance and fire", "119"], ["118  Coast guard", "118"]]:
		_btn(vb, c[0], func(): _call(c[1]), Color(0.75, 0.15, 0.12, 0.9))

func _call(who: String) -> void:
	_push(func(): _call_page(who))
	var line := ""
	match who:
		"110":
			line = "Police: 'Is anyone hurt? ...No? Then please see the nearest koban.'"
		"118":
			line = "Coast guard: 'You are calling from inland. We admire the optimism.'"
		"119":
			if GameState.health >= 0.95:
				line = "Ambulance: 'Are you ill? You sound well. Please eat something and call back.'"
			elif GameState.spend(12000, "Ambulance"):
				GameState.health = clampf(GameState.health + 0.6, 0.0, 1.0)
				GameState.add_stress(-0.1)
				GameState.advance_minutes(180.0)
				line = "The ambulance came. Three hours at the hospital, ¥12,000, and you feel much better."
				GameState.say("Health", "Treated at hospital", "+60% health", 4.0)
			else:
				line = "Ambulance: 'Sir, there is a fee.' You cannot afford the fee."
		"Mom":
			GameState.add_stress(-0.05)
			line = "Mom talks for twenty minutes. She asks if you are eating properly. You are, technically."
		"Section Chief Hara":
			GameState.add_stress(0.08)
			line = "Hara: 'A brief word. It will take four hours.' It takes four hours."
			GameState.advance_minutes(60.0)
		"Ramen Ippai (reservations)":
			line = "'We do not take reservations. We do not have a reservations book. Please just come.'"
		"Ryde Support":
			line = "'Your driver has been located. Your driver has located you. We are both very pleased.'"
		_:
			line = "No answer. The phone rings in an empty room, somewhere."
	call_deferred("_set_call_line", line)

var _call_line := ""
func _set_call_line(l: String) -> void:
	_call_line = l
	_clear()
	_pages.back().call()

func _call_page(who: String) -> void:
	var vb := _page("Calling " + who)
	var t := _text(vb, "📞", 64)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_text(vb, _call_line, 17)

# ---- Mail
func _mail() -> void:
	var vb := _page("Mail")
	var list := _scroll(vb)
	for m in GameState.mails:
		var b := _btn(list, ("● " if not m.read else "") + m.from + "\n" + m.subject, func():
			m.read = true
			_push(func(): _mail_page(m)), Color(0.2, 0.4, 0.7, 0.7) if not m.read else Color(1, 1, 1, 0.08))

func _mail_page(m: Dictionary) -> void:
	var vb := _page(m.subject)
	_text(vb, "From: " + m.from, 14, Color(0.6, 0.8, 1.0))
	_text(vb, m.body, 16)

# ---- Music
func _music_app() -> void:
	var vb := _page("Music")
	var worn: bool = GameState.wearing != ""
	if not worn:
		_text(vb, "Put on earphones to listen. The bag has them, if you have bought a pair.", 14, Color(1, 0.7, 0.4))
	else:
		_text(vb, "Wearing %s." % GameData.item(GameState.wearing).get("name", GameState.wearing), 13, Color(0.6, 1, 0.7))
	var list := _scroll(vb)
	for s in STATIONS:
		var on: bool = _music.playing == s[3]
		_btn(list, ("▶  " if on else "") + "%s\n%s%s" % [s[0], s[1], "" if s[2] > 0 else " · a man reads out the weather"], func():
			if GameState.wearing == "":
				GameState.say("Music", "Nothing in your ears", "Wear earphones first.", 3.0)
				return
			_music.play(s[3], s[2])
			GameState.add_stress(-0.01)
			_clear()
			_pages.back().call(), Color(0.7, 0.2, 0.4, 0.8) if on else Color(1, 1, 1, 0.1))
	_btn(vb, "■  Stop", func(): _music.stop(); _clear(); _pages.back().call(), Color(1, 1, 1, 0.12))

# ---- Settings and Health
func _settings() -> void:
	var vb := _page("Settings")
	var dev: Dictionary = GameData.raw.devices.get(GameState.device, {"name": "Phone"})
	_text(vb, "%s\n%s" % [dev.name, dev.get("note", "")], 14, Color(1, 1, 1, 0.7))
	_text(vb, "Wallpaper", 16, Color(1, 0.85, 0.5))
	var row := HBoxContainer.new()
	vb.add_child(row)
	for i in WALLPAPERS.size():
		var b := Button.new()
		b.text = WALLPAPERS[i][0]
		b.add_theme_font_size_override("font_size", 11)
		b.add_theme_stylebox_override("normal", _sb(WALLPAPERS[i][2], 10.0))
		b.pressed.connect(func():
			_wall_i = i
			_apply_wall())
		row.add_child(b)
	var cols: Array = dev.get("colours", [])
	if cols.size() > 1:
		_text(vb, "Colour: " + String(cols[clampi(GameState.phone_paint, 0, cols.size() - 1)][0]), 16, Color(1, 0.85, 0.5))
		var crow := HBoxContainer.new()
		vb.add_child(crow)
		for i in cols.size():
			var cb := Button.new()
			cb.custom_minimum_size = Vector2(34, 34)
			cb.add_theme_stylebox_override("normal", _sb(Color(String(cols[i][1])), 17.0, Color(1, 1, 1, 0.5), 2))
			cb.add_theme_stylebox_override("focus", _sb(Color(String(cols[i][1])), 17.0, Color.WHITE, 4))
			cb.pressed.connect(func():
				GameState.phone_paint = i
				_rebuild_body()
				_build_app("Settings"))
			crow.add_child(cb)
	_text(vb, "Brightness", 16, Color(1, 0.85, 0.5))
	var s := HSlider.new()
	s.min_value = 0.3
	s.max_value = 1.0
	s.step = 0.05
	s.value = _bright
	s.value_changed.connect(func(v: float):
		_bright = v
		_dim.color = Color(0, 0, 0, 1.0 - v))
	vb.add_child(s)

func _health() -> void:
	var vb := _page("Health")
	_text(vb, "Health  %d%%" % int(GameState.health * 100.0), 26, Color(1, 0.35, 0.4))
	_text(vb, "Stress  %d%%" % int(GameState.stress * 100.0), 26, Color(0.4, 0.65, 1.0))
	_text(vb, "Awake for %d hours." % int(GameState.awake_min / 60.0), 16)
	var tip := "You are fine." if GameState.strain() < 0.2 else "Your watch suggests ramen, a purchase, or fresh air."
	_text(vb, tip, 15, Color(1, 1, 1, 0.7))

## The camera's viewfinder: thirds, corner brackets, the lens line, and what the shutter does.
func _draw() -> void:
	if not _viewfinder or not visible:
		return
	var s := size
	var m := 40.0
	var c := Color(1, 1, 1, 0.8)
	for k in [1.0 / 3.0, 2.0 / 3.0]:
		draw_line(Vector2(m + (s.x - 2 * m) * k, m), Vector2(m + (s.x - 2 * m) * k, s.y - m), Color(1, 1, 1, 0.22), 1.0)
		draw_line(Vector2(m, m + (s.y - 2 * m) * k), Vector2(s.x - m, m + (s.y - 2 * m) * k), Color(1, 1, 1, 0.22), 1.0)
	for cx in [m, s.x - m]:
		for cy in [m, s.y - m]:
			var dx := 34.0 if cx == m else -34.0
			var dy := 34.0 if cy == m else -34.0
			draw_line(Vector2(cx, cy), Vector2(cx + dx, cy), c, 3.0)
			draw_line(Vector2(cx, cy), Vector2(cx, cy + dy), c, 3.0)
	var f := ThemeDB.fallback_font
	var dev: Dictionary = GameData.raw.devices.get(GameState.device, {"name": "Phone", "cam": 3})
	draw_string(f, Vector2(m + 4, m - 12), "%s · camera %d/10" % [dev.name, int(dev.get("cam", 3))], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, c)
	draw_string(f, Vector2(s.x * 0.5, s.y - m + 28), "Space: take photo      Esc: back      %d in the gallery" % GameState.photos.size(), HORIZONTAL_ALIGNMENT_CENTER, -1, 18, c)
	draw_circle(Vector2(s.x * 0.5, s.y - m - 20), 26.0, Color(1, 1, 1, 0.9))
	draw_circle(Vector2(s.x * 0.5, s.y - m - 20), 21.0, Color(0.9, 0.2, 0.2, 0.95))
