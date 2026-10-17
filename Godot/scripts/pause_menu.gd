class_name PauseMenu
extends Control
## The pause menu: Bag, Stats, Settings, Controls and the system buttons. Q and E change tab.

signal resume
signal open_map
signal quit_to_title

var game: Game
var _tabs: TabContainer
var _bag_list: ItemList
var _bag_note: Label
var _stats: RichTextLabel
var _scale_opt: OptionButton
var _sharp: HSlider
var _vol: HSlider
var _sens: HSlider
var _full: CheckButton

func _init() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS

func _fit() -> void:
	position = Vector2.ZERO
	size = get_viewport().get_visible_rect().size

func _ready() -> void:
	_fit()
	get_viewport().size_changed.connect(_fit)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.06, 0.88)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for s in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + s, 120)
	for s in ["top", "bottom"]:
		margin.add_theme_constant_override("margin_" + s, 60)
	add_child(margin)
	var vb := VBoxContainer.new()
	margin.add_child(vb)
	var title := Label.new()
	title.text = "SALARY MAN   ·   paused"
	title.add_theme_font_size_override("font_size", 30)
	vb.add_child(title)
	_tabs = TabContainer.new()
	_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vb.add_child(_tabs)
	_build_bag()
	_build_stats()
	_build_settings()
	_build_controls()
	_build_system()
	var hint := Label.new()
	hint.text = "Q / E: change tab      Esc: resume      M: map"
	hint.add_theme_color_override("font_color", Color(1, 1, 1, 0.6))
	vb.add_child(hint)

func _build_bag() -> void:
	var h := HBoxContainer.new()
	h.name = "Bag"
	_tabs.add_child(h)
	_bag_list = ItemList.new()
	_bag_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_bag_list.add_theme_font_size_override("font_size", 20)
	_bag_list.item_activated.connect(_use_selected)
	_bag_list.item_selected.connect(_bag_selected)
	h.add_child(_bag_list)
	var side := VBoxContainer.new()
	side.custom_minimum_size = Vector2(320, 0)
	h.add_child(side)
	_bag_note = Label.new()
	_bag_note.autowrap_mode = TextServer.AUTOWRAP_WORD
	_bag_note.add_theme_font_size_override("font_size", 18)
	_bag_note.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side.add_child(_bag_note)
	var b := Button.new()
	b.text = "Use  (Enter)"
	b.pressed.connect(_use_selected)
	side.add_child(b)

func _build_stats() -> void:
	_stats = RichTextLabel.new()
	_stats.name = "Stats"
	_stats.bbcode_enabled = true
	_stats.add_theme_font_size_override("normal_font_size", 22)
	_tabs.add_child(_stats)

func _build_settings() -> void:
	var g := GridContainer.new()
	g.name = "Settings"
	g.columns = 2
	g.add_theme_constant_override("h_separation", 30)
	g.add_theme_constant_override("v_separation", 18)
	_tabs.add_child(g)
	g.add_child(_lbl("3D render scale (upscaled to the window)"))
	_scale_opt = OptionButton.new()
	for s in Game.SCALES:
		_scale_opt.add_item("%d%%" % int(s * 100.0))
	_scale_opt.item_selected.connect(func(i: int): game.set_scale_index(i))
	g.add_child(_scale_opt)
	g.add_child(_lbl("Upscaler sharpening"))
	_sharp = HSlider.new()
	_sharp.min_value = 0.0
	_sharp.max_value = 1.0
	_sharp.step = 0.05
	_sharp.custom_minimum_size = Vector2(300, 0)
	_sharp.value_changed.connect(func(v: float): game.set_sharpness(v))
	g.add_child(_sharp)
	g.add_child(_lbl("Master volume"))
	_vol = HSlider.new()
	_vol.min_value = 0.0
	_vol.max_value = 1.0
	_vol.step = 0.05
	_vol.value = 0.8
	_vol.custom_minimum_size = Vector2(300, 0)
	_vol.value_changed.connect(func(v: float): AudioServer.set_bus_volume_db(0, linear_to_db(maxf(v, 0.0001))))
	g.add_child(_vol)
	g.add_child(_lbl("Mouse sensitivity"))
	_sens = HSlider.new()
	_sens.min_value = 0.3
	_sens.max_value = 2.5
	_sens.step = 0.05
	_sens.value = 1.0
	_sens.custom_minimum_size = Vector2(300, 0)
	_sens.value_changed.connect(func(v: float): game.rig.sens = v)
	g.add_child(_sens)
	g.add_child(_lbl("Fullscreen"))
	_full = CheckButton.new()
	_full.toggled.connect(func(on: bool): DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if on else DisplayServer.WINDOW_MODE_MAXIMIZED))
	g.add_child(_full)

func _lbl(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", 20)
	return l

func _build_controls() -> void:
	var r := RichTextLabel.new()
	r.name = "Controls"
	r.bbcode_enabled = true
	r.add_theme_font_size_override("normal_font_size", 20)
	r.text = "[b]On foot[/b]\nW A S D move · Shift run · Space jump · E enter a shop, use a vending machine, or get in a car · Mouse look\n\n[b]In a car[/b]\nW throttle · S brake and reverse · A D steer · Space handbrake · R flip upright · L headlights · E get out (when nearly stopped)\n\n[b]Anywhere[/b]\nM map · P phone · Esc pause · [ and ] render scale · \\ sharpen · H hide help\n\n[b]Gamepad[/b]\nRight trigger throttle · Left trigger brake · Left stick steer or move · X interact · A jump or handbrake"
	_tabs.add_child(r)

func _build_system() -> void:
	var v := VBoxContainer.new()
	v.name = "System"
	v.add_theme_constant_override("separation", 14)
	_tabs.add_child(v)
	for def in [["Resume", func(): resume.emit()], ["Open the map", func(): open_map.emit()], ["Save", func(): GameState.save_game(); GameState.say("System", "Saved", "Your game is saved.", 2.5)], ["Return to the title", func(): quit_to_title.emit()], ["Quit", func(): get_tree().quit()]]:
		var b := Button.new()
		b.text = def[0]
		b.custom_minimum_size = Vector2(320, 44)
		b.pressed.connect(def[1])
		v.add_child(b)

func open_menu() -> void:
	visible = true
	_scale_opt.select(game.scale_index)
	_sharp.set_value_no_signal(game.sharpness)
	refresh()

func refresh() -> void:
	_bag_list.clear()
	var keys := GameState.bag.keys()
	keys.sort()
	for id in keys:
		var it := GameData.item(id)
		var worn: String = "   (worn)" if GameState.wearing == id else ""
		_bag_list.add_item("%s  ×%d%s" % [it.get("name", id), GameState.bag[id], worn])
		_bag_list.set_item_metadata(_bag_list.item_count - 1, id)
	if _bag_list.item_count == 0:
		_bag_list.add_item("The bag is empty. Try a shop.")
		_bag_list.set_item_disabled(0, true)
		_bag_note.text = ""
	else:
		_bag_list.select(0)
		_bag_selected(0)
	var s := GameState
	var rows := PackedStringArray()
	rows.append("[b]Money[/b]   %s" % s.yen(s.money))
	rows.append("[b]Health[/b]   %d%%     [b]Stress[/b]   %d%%%s" % [int(s.health * 100.0), int(s.stress * 100.0), "   (it is showing in how he walks and drives)" if s.strain() > 0.2 else ""])
	rows.append("[b]Time[/b]   Day %d, %s     awake for %d h" % [s.day, s.clock_text(), int(s.awake_min / 60.0)])
	rows.append("[b]Phone[/b]   %s" % GameData.raw.devices.get(s.device, {"name": s.device}).name)
	rows.append("[b]Wearing[/b]   %s" % (GameData.item(s.wearing).get("name", s.wearing) if s.wearing != "" else "nothing on the ears"))
	var owned: Array = []
	for k in s.owned:
		if k != "so24":
			owned.append(k)
	rows.append("[b]Owned[/b]   %s" % (", ".join(owned) if not owned.is_empty() else "nothing yet"))
	_stats.text = "\n\n".join(rows)

func _bag_selected(i: int) -> void:
	var id = _bag_list.get_item_metadata(i)
	if id == null:
		return
	var it := GameData.item(id)
	var parts: Array = [it.get("note", "")]
	if it.has("stress"): parts.append("Stress %+d%%" % int(float(it.stress) * 100.0))
	if it.has("health"): parts.append("Health %+d%%" % int(float(it.health) * 100.0))
	_bag_note.text = "\n".join(parts)

func _use_selected() -> void:
	var sel := _bag_list.get_selected_items()
	if sel.is_empty():
		return
	var id = _bag_list.get_item_metadata(sel[0])
	if id == null:
		return
	var line := GameState.use(id)
	if line != "":
		GameState.say("Bag", line, "", 3.0)
	refresh()

func _unhandled_key_input(e: InputEvent) -> void:
	if not visible or not (e is InputEventKey) or not e.pressed or e.echo:
		return
	match e.keycode:
		KEY_ESCAPE:
			resume.emit()
			get_viewport().set_input_as_handled()
		KEY_M:
			open_map.emit()
			get_viewport().set_input_as_handled()
		KEY_Q:
			_tabs.current_tab = maxi(_tabs.current_tab - 1, 0)
		KEY_E:
			_tabs.current_tab = mini(_tabs.current_tab + 1, _tabs.get_tab_count() - 1)
