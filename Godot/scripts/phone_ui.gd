class_name PhoneUI
extends Control
## The phone, as in the web build: a home screen of apps over a wallpaper, a status bar, and the apps themselves.
## P opens and closes it, Esc goes back a screen, and the mouse or the arrow keys and Enter work throughout.

signal closed

const W := 340.0
const H := 660.0
const WALLPAPERS := [["Dusk", Color(0.16, 0.1, 0.32), Color(0.9, 0.35, 0.45)], ["Harbour", Color(0.03, 0.12, 0.2), Color(0.12, 0.45, 0.6)], ["Neon", Color(0.08, 0.02, 0.15), Color(0.9, 0.2, 0.7)], ["Forest", Color(0.04, 0.12, 0.08), Color(0.3, 0.6, 0.35)], ["Graphite", Color(0.1, 0.1, 0.12), Color(0.3, 0.32, 0.38)]]
const CONTACTS := [["Mom", "090-5550-0143"], ["Section Chief Hara", "03-5550-8821"], ["Ramen Ippai (reservations)", "03-5550-1177"], ["Ryde Support", "0120-555-0199"], ["Dr. Aoki, Dentist", "03-5550-4400"]]
const STATIONS := [["FM Tōkonto", "Pop", 118, 0], ["Lo-fi Night Desk", "Lo-fi", 78, 1], ["City Pop 1984", "City pop", 104, 2], ["Kissaten Jazz", "Jazz", 92, 3], ["Enka Hour", "Enka", 66, 4], ["Talk 1180", "Talk radio", 0, 5]]
const NEWS := ["Section chiefs announce 'a brief word' will last until Thursday", "Tōkonto Station to repaint the platform edge line, again", "Man discovers a vending machine that sells exactly the right drink", "Rain expected, followed by a forecast of rain", "Last train to leave on time, officials insist it has always done so", "Pachinko parlour awarded 'Most Honest Lights' by committee", "Capsule hotel adds a slightly larger capsule tier", "Convenience store sells out of the good onigiri; mourning observed"]
const FORUM := [["Is it normal to eat dinner at 11pm every night?", "Yes. Next question."], ["How do I tell my boss no", "You do not. You say 'that would be difficult'."], ["Best vending machine near the station?", "The one with the kind light."], ["Cheap suits that look expensive", "Dark colours and confident posture. And a very small budget."]]
const POSTS := ["{shop}!! I go there every week", "{brand} spotted 👀", "That shopfront on {street} has great light", "POV: you missed the last train and the capsule hotel is full #salaryman", "Rain on {street}, neon on the puddles. This city.", "Found a vending machine that sells soup. Soup. In a can.", "{station} at midnight is a different country", "my boss: 'a quick word'. 40 minutes later.", "whoever put the yellow light on {street}: thank you", "ramen at 1am, no regrets, many regrets", "the 11 on {street} knows my order now", "walked past a pachinko parlour. my ears are still ringing", "this park is the only quiet place in town", "umbrella count this year: 4 lost, 1 returned (not mine)"]

var game: Game
var screen: Control
var app := ""
var _time_lbl: Label
var _wall: ColorRect
var _wall_i := 0
var _bright := 1.0
var _dim: ColorRect
var _pages: Array = []            # a stack of builders, for Back
var _music: PhoneMusic
var _viewfinder := false
var _flash: ColorRect

func _init() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

func _gui_input(e: InputEvent) -> void:
	if _viewfinder and e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		if (e.position - Vector2(size.x * 0.5, size.y - 60.0)).length() < 30.0:
			_take_photo()

func _fit() -> void:
	position = Vector2.ZERO
	size = get_viewport().get_visible_rect().size
	if body:
		body.position = Vector2(size.x - W - 36.0, (size.y - H) * 0.5)

var body: Panel

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

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	visible = false
	body = Panel.new()
	body.custom_minimum_size = Vector2(W, H)
	body.size = Vector2(W, H)
	body.add_theme_stylebox_override("panel", _sb(Color(0.05, 0.05, 0.07), 38.0, Color(0.3, 0.32, 0.38), 3))
	body.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(body)
	_wall = ColorRect.new()
	_wall.position = Vector2(10, 10)
	_wall.size = Vector2(W - 20, H - 20)
	body.add_child(_wall)
	_dim = ColorRect.new()
	_dim.position = _wall.position
	_dim.size = _wall.size
	_dim.color = Color(0, 0, 0, 0)
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dim.z_index = 20
	body.add_child(_dim)
	var bar := HBoxContainer.new()
	bar.position = Vector2(26, 16)
	bar.size = Vector2(W - 52, 22)
	body.add_child(bar)
	_time_lbl = Label.new()
	_time_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_time_lbl.add_theme_font_size_override("font_size", 14)
	bar.add_child(_time_lbl)
	var sig := Label.new()
	sig.text = "▂▄▆█  5G  🔋 87%"
	sig.add_theme_font_size_override("font_size", 12)
	bar.add_child(sig)
	screen = Control.new()
	screen.position = Vector2(14, 48)
	screen.size = Vector2(W - 28, H - 48 - 54)
	screen.clip_contents = true
	body.add_child(screen)
	# the home button, always there
	var home := Button.new()
	home.text = "●"
	home.position = Vector2(W * 0.5 - 22, H - 46)
	home.size = Vector2(44, 34)
	home.add_theme_stylebox_override("normal", _sb(Color(1, 1, 1, 0.12), 17.0))
	home.pressed.connect(go_home)
	home.focus_mode = Control.FOCUS_NONE
	body.add_child(home)
	_flash = ColorRect.new()
	_flash.color = Color(1, 1, 1, 0)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_flash)
	_music = PhoneMusic.new()
	add_child(_music)
	_fit()
	get_viewport().size_changed.connect(_fit)
	_apply_wall()

func _apply_wall() -> void:
	var w: Array = WALLPAPERS[_wall_i]
	var g := Gradient.new()
	g.set_color(0, w[1])
	g.set_color(1, w[2] if false else w[1])
	# a vertical gradient from the second colour at the top to the first at the bottom
	var gt := GradientTexture2D.new()
	var gr := Gradient.new()
	gr.set_color(0, w[2])
	gr.set_color(1, w[1])
	gt.gradient = gr
	gt.fill_from = Vector2(0.5, 1.0)
	gt.fill_to = Vector2(0.5, 0.0)
	gt.width = 64
	gt.height = 256
	var tr: TextureRect = _wall.get_node_or_null("tex")
	if tr == null:
		tr = TextureRect.new()
		tr.name = "tex"
		tr.stretch_mode = TextureRect.STRETCH_SCALE
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tr.set_anchors_preset(Control.PRESET_FULL_RECT)
		_wall.add_child(tr)
	tr.texture = gt
	_wall.color = w[1]

func _process(_dt: float) -> void:
	if not visible:
		return
	_time_lbl.text = GameState.clock_text()
	_flash.color.a = move_toward(_flash.color.a, 0.0, _dt * 3.0)
	if _viewfinder:
		queue_redraw()

func open_phone() -> void:
	visible = true
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

func go_home() -> void:
	app = ""
	_pages.clear()
	_viewfinder = false
	body.visible = true
	_clear()
	var apps: Array = GameData.raw.phone_apps
	var basic: bool = GameState.device == "eleven" or GameState.device == "petmart"
	var list: Array = []
	for a in apps:
		if basic and not GameData.raw.basic_apps.has(a[0]):
			continue
		list.append(a)
	if GameState.owned.has("pearwatch") or GameState.owned.has("pearwatchu"):
		list.append(["Health", "#ff2d55", "heart"])
	var date := Label.new()
	date.text = "Day %d" % GameState.day
	date.position = Vector2(14, 6)
	date.add_theme_font_size_override("font_size", 30)
	screen.add_child(date)
	var dev: Dictionary = GameData.raw.devices.get(GameState.device, {"name": "Phone"})
	var nm := Label.new()
	nm.text = dev.name
	nm.position = Vector2(16, 46)
	nm.add_theme_font_size_override("font_size", 13)
	nm.modulate = Color(1, 1, 1, 0.7)
	screen.add_child(nm)
	var grid := GridContainer.new()
	grid.columns = 3
	grid.position = Vector2(8, 90)
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 16)
	screen.add_child(grid)
	var first: Button
	for a in list:
		var b := Button.new()
		b.custom_minimum_size = Vector2(88, 88)
		b.text = a[0]
		b.add_theme_font_size_override("font_size", 14)
		b.add_theme_stylebox_override("normal", _sb(Color(a[1]), 20.0))
		b.add_theme_stylebox_override("hover", _sb(Color(a[1]).lightened(0.15), 20.0))
		b.add_theme_stylebox_override("focus", _sb(Color(a[1]).lightened(0.2), 20.0, Color.WHITE, 3))
		b.add_theme_stylebox_override("pressed", _sb(Color(a[1]).darkened(0.2), 20.0))
		b.pressed.connect(open_app.bind(a[0]))
		grid.add_child(b)
		if first == null:
			first = b
		if a[0] == "Mail":
			var unread := 0
			for m in GameState.mails:
				if not m.read:
					unread += 1
			if unread > 0:
				b.text = "Mail  (%d)" % unread
	if first:
		first.grab_focus()

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
