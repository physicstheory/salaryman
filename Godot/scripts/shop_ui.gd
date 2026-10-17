class_name ShopUI
extends Control
## The counter. Shelves on the left, goods on the right, your money at the top.
## Up/Down pick, Left/Right change shelf, Enter buys, Esc leaves. The mouse works too.

signal closed

var brand := "eleven"
var shelves: Array = []
var shelf_i := 0
var floors_mode := false
var _title: Label
var _tag: Label
var _money: Label
var _shelf_list: ItemList
var _item_list: ItemList
var _note: Label
var _msg: Label
var _band: ColorRect
var _plaza_floor := -1
var _capsule := false

func _fit() -> void:
	# sit exactly over the window; a Control under a CanvasLayer does not size itself from anchors
	position = Vector2.ZERO
	size = get_viewport().get_visible_rect().size

func _ready() -> void:
	_fit()
	get_viewport().size_changed.connect(_fit)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.06, 0.82)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	var root := VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 80
	root.offset_right = -80
	root.offset_top = 50
	root.offset_bottom = -50
	root.add_theme_constant_override("separation", 10)
	add_child(root)
	_band = ColorRect.new()
	_band.custom_minimum_size = Vector2(0, 86)
	root.add_child(_band)
	var hb := HBoxContainer.new()
	hb.set_anchors_preset(Control.PRESET_FULL_RECT)
	hb.offset_left = 20
	hb.offset_right = -20
	_band.add_child(hb)
	var tv := VBoxContainer.new()
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hb.add_child(tv)
	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 34)
	tv.add_child(_title)
	_tag = Label.new()
	_tag.add_theme_font_size_override("font_size", 16)
	tv.add_child(_tag)
	_money = Label.new()
	_money.add_theme_font_size_override("font_size", 28)
	_money.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hb.add_child(_money)
	var cols := HBoxContainer.new()
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	cols.add_theme_constant_override("separation", 14)
	root.add_child(cols)
	_shelf_list = ItemList.new()
	_shelf_list.custom_minimum_size = Vector2(280, 0)
	_shelf_list.add_theme_font_size_override("font_size", 20)
	_shelf_list.item_selected.connect(_on_shelf)
	cols.add_child(_shelf_list)
	_item_list = ItemList.new()
	_item_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_item_list.add_theme_font_size_override("font_size", 20)
	_item_list.item_selected.connect(_on_item_selected)
	_item_list.item_activated.connect(_on_item_activated)
	cols.add_child(_item_list)
	_note = Label.new()
	_note.add_theme_font_size_override("font_size", 18)
	_note.autowrap_mode = TextServer.AUTOWRAP_WORD
	_note.custom_minimum_size = Vector2(0, 50)
	root.add_child(_note)
	_msg = Label.new()
	_msg.add_theme_font_size_override("font_size", 20)
	_msg.add_theme_color_override("font_color", Color(1, 0.85, 0.4))
	root.add_child(_msg)
	var help := Label.new()
	help.text = "↑ ↓ choose      ← → shelf      Enter: buy      Esc: leave"
	help.add_theme_color_override("font_color", Color(1, 1, 1, 0.6))
	root.add_child(help)
	GameState.changed.connect(_refresh_money)

func open(brand_id: String) -> void:
	brand = brand_id
	_capsule = brand_id == "capsule"
	floors_mode = brand_id == "plaza"
	var b: Dictionary = GameData.brand(brand_id)
	_band.color = Color(b.band)
	_title.text = b.name + ("   " + b.jp if b.has("jp") else "")
	_title.add_theme_color_override("font_color", Color(b.ink))
	_tag.text = b.get("tag", "")
	_tag.add_theme_color_override("font_color", Color(b.ink))
	_money.add_theme_color_override("font_color", Color(b.ink))
	_msg.text = ""
	if floors_mode:
		_show_floors()
	elif _capsule:
		shelves = [{"name": "The desk", "items": [{"id": "capsule_sleep", "name": "A capsule until morning", "price": 3500, "note": "Eight hours. Stress gone, health back. Parcels wait for you."}]}]
		_fill_shelves()
	else:
		shelves = GameData.shelves_for(brand_id)
		_fill_shelves()
	_refresh_money()
	visible = true
	_item_list.grab_focus()

func _show_floors() -> void:
	shelves = []
	_shelf_list.clear()
	_item_list.clear()
	for f in GameData.raw.plaza:
		_shelf_list.add_item("%s  %s" % [f.label, f.name])
	_shelf_list.select(0)
	_fill_floor_stores(0)

func _fill_floor_stores(fi: int) -> void:
	_item_list.clear()
	var f: Dictionary = GameData.raw.plaza[fi]
	for st in f.stores:
		var b: Dictionary = GameData.brand(st)
		_item_list.add_item("%s   (%s)" % [b.name, b.get("tag", "")])
		_item_list.set_item_metadata(_item_list.item_count - 1, st)
	_item_list.select(0)
	_note.text = "Take the lift to a floor, then pick a shop."

func _fill_shelves() -> void:
	_shelf_list.clear()
	for s in shelves:
		_shelf_list.add_item(s.name)
	shelf_i = 0
	if shelves.size() > 0:
		_shelf_list.select(0)
		_fill_items()

func _on_shelf(i: int) -> void:
	if floors_mode and _plaza_floor == -1:
		_fill_floor_stores(i)
		return
	shelf_i = i
	_fill_items()

func _fill_items() -> void:
	_item_list.clear()
	if shelf_i >= shelves.size():
		return
	for it in shelves[shelf_i].items:
		var price := int(it.get("price", 0))
		var tag := "" if not GameState.owned.has(_owned_key(it)) else "  ✓ owned"
		_item_list.add_item("%s      %s%s" % [it.name, GameState.yen(price), tag])
		_item_list.set_item_metadata(_item_list.item_count - 1, it)
	if _item_list.item_count > 0:
		_item_list.select(0)
		_on_item_selected(0)

func _owned_key(it: Dictionary) -> String:
	if it.has("device"): return it.device
	return it.get("id", "")

func _on_item_selected(i: int) -> void:
	var m = _item_list.get_item_metadata(i)
	if typeof(m) == TYPE_DICTIONARY:
		var parts: Array = []
		if m.has("note"): parts.append(m.note)
		var it := GameData.item(m.id)
		if it.has("stress") and float(it.stress) != 0.0: parts.append("Stress %+d%%" % int(float(it.stress) * 100.0))
		if it.has("health") and float(it.health) != 0.0: parts.append("Health %+d%%" % int(float(it.health) * 100.0))
		if m.has("stress") and not it.has("stress"): parts.append("Stress %+d%%" % int(float(m.stress) * 100.0))
		if m.has("health") and not it.has("health"): parts.append("Health %+d%%" % int(float(m.health) * 100.0))
		if m.has("screen"): parts.append(m.screen)
		_note.text = "  ·  ".join(parts)
	elif typeof(m) == TYPE_STRING:
		_note.text = GameData.brand(m).get("tag", "")

func _on_item_activated(i: int) -> void:
	_buy(i)

func _refresh_money() -> void:
	if _money:
		_money.text = GameState.yen(GameState.money)

func _unhandled_key_input(e: InputEvent) -> void:
	if not visible or not (e is InputEventKey) or not e.pressed or e.echo:
		return
	match e.keycode:
		KEY_ESCAPE:
			if floors_mode and _plaza_floor != -1:
				_plaza_floor = -1
				_title.text = "Konto Plaza   コント・プラザ"
				_show_floors()
			else:
				close()
			get_viewport().set_input_as_handled()
		KEY_LEFT:
			_step_shelf(-1)
			get_viewport().set_input_as_handled()
		KEY_RIGHT:
			_step_shelf(1)
			get_viewport().set_input_as_handled()
		KEY_ENTER, KEY_KP_ENTER:
			var sel := _item_list.get_selected_items()
			if sel.size() > 0:
				_buy(sel[0])
			get_viewport().set_input_as_handled()

func _step_shelf(d: int) -> void:
	var n := _shelf_list.item_count
	if n == 0:
		return
	var cur := _shelf_list.get_selected_items()
	var i := (cur[0] if cur.size() > 0 else 0) + d
	i = clampi(i, 0, n - 1)
	_shelf_list.select(i)
	_on_shelf(i)

func close() -> void:
	visible = false
	closed.emit()

func _buy(i: int) -> void:
	var m = _item_list.get_item_metadata(i)
	if typeof(m) == TYPE_STRING:
		# a floor of the plaza: open that shop's shelves
		_plaza_floor = 1
		var b: Dictionary = GameData.brand(m)
		_title.text = b.name
		shelves = GameData.shelves_for(m)
		_fill_shelves()
		return
	if typeof(m) != TYPE_DICTIONARY:
		return
	var price := int(m.get("price", 0))
	var id: String = m.id
	if id == "capsule_sleep":
		if not GameState.spend(price):
			_say("Not enough for a capsule. %s at the desk." % GameState.yen(price))
			return
		GameState.stress = 0.0
		GameState.health = 1.0
		GameState.awake_min = 0.0
		GameState.advance_minutes(480.0)
		GameState.say("Capsule", "Slept until morning", "You feel human.", 5.0)
		_say("Slept until morning. You feel human.")
		return
	if m.has("device") and GameState.owned.has(m.device):
		_say("You already own that.")
		return
	if (m.has("tv") or m.has("game") or m.has("gear")) and GameState.owned.has(id):
		_say("You already own that.")
		return
	if not GameState.spend(price, m.name):
		_say("Not enough money. That is %s." % GameState.yen(price))
		return
	var done := _deliver(m)
	GameState.purchased.emit(id)
	_say(done)
	_fill_items_keep()

func _fill_items_keep() -> void:
	var keep := _item_list.get_selected_items()
	_fill_items()
	if keep.size() > 0 and keep[0] < _item_list.item_count:
		_item_list.select(keep[0])

func _say(t: String) -> void:
	_msg.text = t

## What happens to the thing you bought.
func _deliver(m: Dictionary) -> String:
	var id: String = m.id
	if m.has("device"):
		GameState.owned[m.device] = true
		GameState.device = m.device
		GameState.phone_paint = 0
		GameState.say("Phone", "New phone", "%s is in your pocket." % m.name, 5.0)
		return "Bought %s. It is already in your pocket." % m.name
	if m.has("tv") or m.has("gear") or m.has("game"):
		GameState.owned[id] = true
		return "%s ordered. Delivered to the safehouse tomorrow." % m.name
	if m.has("shirt"):
		GameState.shirt = m.shirt
		return "Put on the %s." % m.name.to_lower()
	if m.has("eat") or m.has("read"):
		var it := {"stress": m.get("stress", 0.0), "health": m.get("health", 0.0), "min": m.get("min", 10)}
		GameState.apply_consumable(id, it)
		return ("Ate the %s." if m.has("eat") else "Read %s.") % m.name
	# everything else goes in the bag
	var rec := GameData.item(id)
	if m.get("phone", false):
		GameState.owned[id] = true
		GameState.device = id
		GameState.phone_paint = 0
		return "Bought %s. It is your phone now." % m.name
	GameState.give(id, 1)
	if rec.get("cat", "") == "audio":
		return "Bought %s. It is in the bag: put it on." % m.name
	return "Bought %s." % m.name
