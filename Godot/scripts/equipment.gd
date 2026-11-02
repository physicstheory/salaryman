class_name Equipment
extends RefCounted
## What the equipment wheel offers and what letting go of it does. The categories, the items and their notes are the web build's;
## what is owned lives in GameState (the bag for things, `owned` for handsets, games and gear).

static func cats() -> Array:
	return GameData.raw.wheel_cats

## Every owned thing in one category, in the order the strip shows them: [{id, name, note, count, kind, current}]
static func list(cat: String) -> Array:
	var out: Array = []
	var gs = GameState
	if cat == "phone":
		var dev: Dictionary = GameData.raw.devices.get(gs.device, {})
		out.append({"id": gs.device, "name": dev.get("name", "Phone"), "note": "In use", "kind": "phone", "current": true})
		for id in GameData.raw.devices:
			if id != gs.device and gs.owned.has(id):
				out.append({"id": id, "name": GameData.raw.devices[id].name, "note": "In the bag", "kind": "phone"})
		return out
	if cat == "game":
		for g in GameData.raw.games:
			if gs.owned.has(g.id):
				out.append({"id": g.id, "name": g.name, "note": ("In hand · " if gs.held_game == g.id else "") + String(g.genre), "kind": "game"})
		return out
	for it in GameData.raw.items:
		if it.cat != cat:
			continue
		var n := 1 if it.get("always", false) else int(gs.bag.get(it.id, 0))
		if n > 0:
			out.append({"id": it.id, "name": it.name, "note": it.get("note", ""), "count": n, "kind": "item", "item": it})
	if cat == "tech":
		for id in GameData.raw.gear:
			if gs.owned.has(id):
				out.append({"id": id, "name": GameData.raw.gear[id].name, "note": GameData.raw.gear[id].note, "kind": "gear"})
	return out

## The thing the wheel shows in each segment: the one you last had selected in it, else the first.
static func shown(cat: String, idx: Dictionary) -> Dictionary:
	var l := list(cat)
	if l.is_empty():
		return {}
	return l[clampi(int(idx.get(cat, 0)), 0, l.size() - 1)]

## Letting go of the wheel uses what is under the pointer. Returns a line for the toast.
static func apply(cat: String, e: Dictionary) -> String:
	var gs = GameState
	var cdef: Dictionary = {}
	for c in cats():
		if c.id == cat:
			cdef = c
	if e.is_empty():
		return String(cdef.get("empty", "Nothing")) + " yet."
	match cat:
		"hand", "gun":
			gs.held = e.id
			gs.changed.emit()
			return "Put away." if e.id == "none" else "%s out." % e.name
		"audio":
			gs.wearing = "" if gs.wearing == e.id else e.id
			gs.changed.emit()
			return "%s on." % e.name if gs.wearing == e.id else "%s off." % e.name
		"phone":
			if e.get("current", false):
				return "%s is already in your pocket." % e.name
			gs.device = e.id
			gs.phone_paint = 0
			gs.changed.emit()
			return "%s in your pocket." % e.name
		"game":
			gs.held_game = e.id
			return "%s in hand." % e.name
		"food", "drink", "med":
			var line: String = gs.use(e.id)
			return line if line != "" else "Nothing happened."
		"tech":
			return "%s. %s" % [e.name, e.get("note", "")]
	return ""
