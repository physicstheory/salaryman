"""Stations: the NHRail platform and concourse kit.

The game lays out every station (two side platforms either side of a pair of tracks, a concourse at one end); this kit
is what stands there instead of the vertex-coloured boxes:

    station_bay         one 12 m bay of side platform: the concrete platform with its coping, the refuge recess under the
                        edge, the yellow tactile line, a terrazzo surface; a steel column and a cantilevered canopy with a
                        ribbed soffit, a fascia, a gutter and an LED strip; the fence along the outer edge
    station_bay_bench   the same with a row of seats
    station_bay_vend    the same with two vending machines and a recycling bin
    station_concourse   the 26 x 20 m ticket hall: tiled flanks, a glazed front with sliding doors under a canopy, the green
                        NHRail band, and inside ticket gates, ticket machines and lights you can see through the glass

Frames: a bay's origin is the platform's centre line at railhead height, the track on Blender -X (three.js -x), 12 m along
Blender Y. The concourse's origin is the middle of its floor, its glazed front facing Blender -Y (three.js +z).
"""
import math
import bpy

from core import box, cyl
import mats
import export
from roofs import finish_and_ship

M = mats.get
TARGETS = ["station_bay", "station_bay_bench", "station_bay_vend", "station_concourse"]
BAY = 12.0
TOP = 1.15            # platform surface over the railhead
HALF = 4.0            # platform half width


def bay(p, extra=None):
    L = BAY
    # the platform: a concrete body set back under the edge (the refuge), the coping slab that oversails it
    p.append(box("body", (2 * HALF - 0.9, L, 1.0), (0.45, 0, 0.5), M("concrete"), 0.02))
    p.append(box("refuge_wall", (0.12, L, 0.8), (-HALF + 0.9, 0, 0.45), M("concrete_dark")))
    p.append(box("coping", (0.55, L, 0.16), (-HALF + 0.27, 0, TOP - 0.1), M("concrete"), 0.01))
    p.append(box("surface", (2 * HALF - 0.55, L, 0.06), (0.27, 0, TOP - 0.03), M("platform")))
    p.append(box("tactile", (0.3, L, 0.012), (-HALF + 0.95, 0, TOP + 0.005), M("tactile")))
    p.append(box("whiteline", (0.08, L, 0.01), (-HALF + 0.3, 0, TOP + 0.004), M("paint_white")))
    # the outer edge: a kerb and a steel fence with mesh panels
    p.append(box("kerb", (0.25, L, 0.2), (HALF - 0.12, 0, TOP + 0.1), M("concrete"), 0.02))
    for k in range(3):
        y = -L / 2 + k * L / 3
        p.append(box("fpost", (0.06, 0.06, 1.2), (HALF - 0.12, y, TOP + 0.8), M("paint_grey")))
    p.append(box("frail", (0.06, L, 0.06), (HALF - 0.12, 0, TOP + 1.38), M("paint_grey")))
    p.append(box("frail2", (0.04, L, 0.04), (HALF - 0.12, 0, TOP + 0.3), M("paint_grey")))
    for k in range(48):
        y = -L / 2 + (k + 0.5) * L / 48
        p.append(box("bar", (0.018, 0.018, 1.0), (HALF - 0.12, y, TOP + 0.82), M("galvanised")))
    # the canopy: one H column per bay on the outer half, a tapered cantilever beam, a ribbed deck, fascia and gutter
    cx = 1.6
    col = M("paint_grey")
    p.append(box("col_web", (0.012 * 20, 0.02 * 1.0, 3.4), (cx, 0, TOP + 1.7), col))
    p.append(box("col_f1", (0.25, 0.022, 3.4), (cx, -0.12, TOP + 1.7), col))
    p.append(box("col_f2", (0.25, 0.022, 3.4), (cx, 0.12, TOP + 1.7), col))
    p.append(box("col_base", (0.45, 0.45, 0.05), (cx, 0, TOP + 0.025), M("steel_dark")))
    roof_z = TOP + 3.55
    # beam: thick at the column, thin at the tips
    from core import from_pydata
    for side, reach in ((-1, cx + HALF + 0.5), (1, HALF - cx + 0.3)):
        x0, x1 = cx, cx + side * reach
        h0, h1 = 0.45, 0.16
        vs = [(x0, -0.1, roof_z - h0), (x1, -0.1, roof_z - h1), (x1, -0.1, roof_z), (x0, -0.1, roof_z),
              (x0, 0.1, roof_z - h0), (x1, 0.1, roof_z - h1), (x1, 0.1, roof_z), (x0, 0.1, roof_z)]
        fs = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)]
        if side < 0:
            fs = [tuple(reversed(f)) for f in fs]
        p.append(from_pydata("beam", vs, fs, col))
    x_track, x_out = -HALF - 0.5, HALF + 0.3
    w = x_out - x_track
    p.append(box("deck", (w, L, 0.08), ((x_track + x_out) / 2, 0, roof_z + 0.04), M("galvanised")))
    for k in range(int(w / 0.3)):
        x = x_track + 0.15 + k * 0.3
        p.append(box("rib", (0.08, L, 0.05), (x, 0, roof_z - 0.02), M("powder_grey")))
    for k in range(3):
        y = -L / 2 + (k + 0.5) * L / 3
        p.append(box("purlin", (w, 0.1, 0.18), ((x_track + x_out) / 2, y, roof_z - 0.12), col))
    p.append(box("fascia", (0.06, L, 0.5), (x_track, 0, roof_z - 0.1), M("paint_white"), 0.01))
    p.append(box("fascia_band", (0.065, L, 0.1), (x_track, 0, roof_z - 0.25), M("paint_green")))
    p.append(box("fascia_out", (0.06, L, 0.35), (x_out, 0, roof_z - 0.05), M("paint_white")))
    p.append(cyl("gutter", 0.08, L, (x_out + 0.08, 0, roof_z - 0.1), M("galvanised"), 12, "Y"))
    p.append(cyl("downpipe", 0.05, 3.4, (cx + 0.2, 0.2, TOP + 1.7), M("galvanised"), 10))
    p.append(box("led", (0.12, L * 0.92, 0.03), (-1.2, 0, roof_z - 0.2), M("light_panel")))
    p.append(box("led_box", (0.2, L * 0.94, 0.06), (-1.2, 0, roof_z - 0.16), M("aluminium")))
    p.append(box("led2", (0.12, L * 0.92, 0.03), (2.6, 0, roof_z - 0.2), M("light_panel")))
    p.append(box("led_box2", (0.2, L * 0.94, 0.06), (2.6, 0, roof_z - 0.16), M("aluminium")))
    # a car-stop marker and a speaker on the column
    p.append(box("speaker", (0.2, 0.25, 0.3), (cx - 0.2, 0, TOP + 3.0), M("plastic_white")))
    p.append(box("carmark", (0.6, 0.02, 0.4), (cx - 0.16, -0.14, TOP + 2.3), M("paint_yellow")))
    if extra:
        extra(p)


def bench(p):
    y0 = -2.0
    for k in range(4):
        y = y0 + k * 0.55
        p.append(box("seat", (0.45, 0.48, 0.05), (2.9, y, TOP + 0.44), M("plastic_white" if k % 2 else "paint_blue"), 0.02))
        p.append(box("back", (0.05, 0.48, 0.42), (3.13, y, TOP + 0.7), M("plastic_white" if k % 2 else "paint_blue"), 0.02))
    p.append(box("rail", (0.08, 2.4, 0.06), (2.95, y0 + 0.82, TOP + 0.38), M("stainless")))
    for y in (y0 - 0.2, y0 + 1.85):
        p.append(box("leg", (0.06, 0.06, 0.38), (2.95, y, TOP + 0.19), M("stainless")))
        p.append(box("foot", (0.45, 0.08, 0.02), (2.95, y, TOP + 0.01), M("stainless")))


def board(p):
    """An LED departure board and a clock hung from the canopy over the seats."""
    z = TOP + 2.75
    for dy in (-0.7, 0.7):
        p.append(cyl("hanger", 0.012, 0.9, (-0.6, dy, z + 0.8), M("stainless"), 8))
    p.append(box("board", (0.22, 1.9, 0.62), (-0.6, 0, z), M("plastic_black"), 0.02))
    p.append(box("board_led_a", (0.01, 1.7, 0.18), (-0.715, 0, z + 0.13), M("screen_dest")))
    p.append(box("board_led_b", (0.01, 1.7, 0.18), (-0.715, 0, z - 0.12), M("light_head")))
    p.append(box("board_led_c", (0.01, 1.7, 0.18), (-0.485, 0, z + 0.13), M("screen_dest")))
    p.append(box("board_led_d", (0.01, 1.7, 0.18), (-0.485, 0, z - 0.12), M("light_head")))
    # the clock, two faces back to back
    p.append(cyl("clock", 0.24, 0.12, (-0.6, 2.4, z + 0.1), M("paint_white"), 32, "X"))
    p.append(cyl("clock_rim", 0.26, 0.1, (-0.6, 2.4, z + 0.1), M("paint_black"), 32, "X"))
    for sx in (-1, 1):
        p.append(box("hand_h", (0.01, 0.025, 0.13), (-0.6 + sx * 0.065, 2.4, z + 0.16), M("paint_black")))
        p.append(box("hand_m", (0.01, 0.15, 0.02), (-0.6 + sx * 0.065, 2.47, z + 0.1), M("paint_black")))
    p.append(cyl("clock_hanger", 0.015, 0.75, (-0.6, 2.4, z + 0.72), M("stainless"), 8))


def vend(p):
    for k, (col, y) in enumerate((("paint_red", 1.2), ("paint_white", 2.15))):
        p.append(box("vm", (0.75, 0.9, 1.83), (3.2, y, TOP + 0.915), M(col), 0.01))
        p.append(box("vm_win", (0.02, 0.76, 0.85), (2.71, y, TOP + 1.3), M("glass_clear")))
        p.append(box("vm_lit", (0.01, 0.74, 0.83), (2.818, y, TOP + 1.3), M("light_panel")))
        for dz in (-0.44, 0.44):
            p.append(box("vm_fr", (0.12, 0.84, 0.04), (2.77, y, TOP + 1.3 + dz), M(col)))
        for dy in (-0.4, 0.4):
            p.append(box("vm_fr", (0.12, 0.04, 0.92), (2.77, y + dy, TOP + 1.3), M(col)))
        for r in range(3):
            for c in range(5):
                p.append(cyl("can", 0.032, 0.12, (2.78, y - 0.3 + c * 0.15, TOP + 1.0 + r * 0.27), M(["paint_red", "paint_blue", "paint_yellow", "paint_green", "paint_white"][(r + c + k) % 5]), 10))
        p.append(box("vm_panel", (0.02, 0.4, 0.3), (2.815, y, TOP + 0.7), M("plastic_black")))
        p.append(box("vm_slot", (0.03, 0.5, 0.18), (2.815, y, TOP + 0.25), M("plastic_black")))
    for k, c in enumerate(("paint_blue", "paint_yellow", "paint_green")):
        p.append(box("bin", (0.42, 0.42, 0.95), (3.3, -1.0 + k * 0.46, TOP + 0.475), M("stainless_dull"), 0.01))
        p.append(box("binlid", (0.43, 0.43, 0.04), (3.3, -1.0 + k * 0.46, TOP + 0.96), M(c)))


def concourse(p):
    W, D, H = 26.0, 20.0, 6.6
    fy = -D / 2          # the front
    # floor slab and the flanks: tiled walls, the back wall
    p.append(box("slab", (W, D, 0.25), (0, 0, -0.125), M("concrete")))
    p.append(box("floor", (W - 0.6, D - 0.6, 0.02), (0, 0, 0.01), M("platform")))
    for sx in (-1, 1):
        p.append(box("flank", (0.4, D, H), (sx * (W / 2 - 0.2), 0, H / 2), M("tiles_wall")))
        p.append(box("plinth", (0.45, D, 0.6), (sx * (W / 2 - 0.2), 0, 0.3), M("concrete_dark")))
        p.append(box("pier", (2.6, 0.5, H), (sx * (W / 2 - 1.5), fy + 0.25, H / 2), M("tiles_wall")))
    p.append(box("back", (W, 0.4, H), (0, D / 2 - 0.2, H / 2), M("tiles_wall")))
    p.append(box("roof", (W + 0.4, D + 0.4, 0.45), (0, 0, H + 0.2), M("concrete")))
    p.append(box("band", (W + 0.5, D + 0.5, 0.5), (0, 0, H + 0.35 + 0.1), M("paint_green")))
    p.append(box("ceiling", (W - 0.8, D - 0.8, 0.05), (0, 0, H - 0.6), M("paint_white")))
    for i in range(4):
        for j in range(3):
            p.append(box("light", (2.4, 0.3, 0.03), (-8 + i * 5.3, -5 + j * 5, H - 0.64), M("light_panel")))
    # the glazed front: mullions, transom, two pairs of sliding doors, a canopy over them
    gw = W - 5.2
    p.append(box("glass", (gw, 0.04, H - 1.2), (0, fy + 0.4, (H - 1.2) / 2 + 0.1), M("glass")))
    for k in range(9):
        x = -gw / 2 + k * gw / 8
        p.append(box("mull", (0.1, 0.18, H - 1.2), (x, fy + 0.4, (H - 1.2) / 2 + 0.1), M("aluminium")))
    p.append(box("transom", (gw, 0.18, 0.12), (0, fy + 0.4, 2.6), M("aluminium")))
    p.append(box("head", (gw, 0.3, 0.6), (0, fy + 0.35, H - 0.8), M("aluminium")))
    for x in (-4.0, 4.0):
        p.append(box("doorframe", (3.2, 0.2, 0.12), (x, fy + 0.3, 2.45), M("stainless")))
        for sx in (-1, 1):
            p.append(box("door", (1.5, 0.05, 2.35), (x + sx * 0.76, fy + 0.28, 1.2), M("glass_clear")))
            p.append(box("doorrail", (0.05, 0.06, 2.35), (x + sx * 0.04, fy + 0.27, 1.2), M("stainless")))
        p.append(box("mat", (3.2, 1.6, 0.02), (x, fy + 1.2, 0.02), M("rubber")))
    p.append(box("canopy", (gw + 1.0, 3.0, 0.22), (0, fy - 1.2, 3.4), M("aluminium")))
    p.append(box("canopy_soffit", (gw + 0.8, 2.8, 0.02), (0, fy - 1.2, 3.28), M("paint_white")))
    for x in (-6.0, 0.0, 6.0):
        p.append(box("canopy_light", (1.2, 0.2, 0.02), (x, fy - 1.4, 3.26), M("light_panel")))
    for sx in (-1, 1):
        p.append(box("tie", (0.06, 3.2, 0.06), (sx * gw / 2.4, fy - 1.1, 4.3), M("stainless"), rot=(0.55, 0, 0)))
    # inside: a row of ticket gates, the ticket machines on the back wall, a fare map over them, the office window
    for k in range(7):
        x = -6.0 + k * 2.0
        p.append(box("gate", (0.35, 1.6, 1.0), (x, 1.5, 0.5), M("plastic_grey"), 0.03))
        p.append(box("gatetop", (0.38, 1.62, 0.04), (x, 1.5, 1.02), M("plastic_black")))
        p.append(box("gatescreen", (0.2, 0.25, 0.02), (x, 0.9, 1.05), M("light_panel")))
        p.append(box("flap", (0.6, 0.04, 0.35), (x + 0.45, 1.5, 0.75), M("paint_red")))
    p.append(box("gatelast", (0.35, 1.6, 1.0), (8.0, 1.5, 0.5), M("plastic_grey"), 0.03))
    for k in range(6):
        x = -7.5 + k * 1.3
        p.append(box("tvm", (1.0, 0.6, 1.7), (x, D / 2 - 0.7, 0.85), M("paint_white"), 0.02))
        p.append(box("tvm_screen", (0.6, 0.02, 0.45), (x, D / 2 - 1.01, 1.25), M("light_panel")))
    p.append(box("faremap", (8.5, 0.04, 1.6), (-4.5, D / 2 - 0.42, 3.3), M("light_panel")))
    p.append(box("faremap_frame", (8.7, 0.06, 1.8), (-4.5, D / 2 - 0.39, 3.3), M("aluminium")))
    p.append(box("office", (6.0, 3.0, 2.7), (7.5, D / 2 - 1.7, 1.35), M("paint_cream")))
    p.append(box("office_win", (4.0, 0.04, 1.2), (7.5, D / 2 - 3.22, 1.6), M("glass")))
    p.append(box("office_lit", (3.9, 0.02, 1.15), (7.5, D / 2 - 3.18, 1.6), M("light_panel")))
    for x in (-10.5, 10.5):
        p.append(box("column", (0.6, 0.6, H - 0.6), (x, 3.0, (H - 0.6) / 2), M("tiles_white")))


def build(which):
    mats.PX_CAP[0] = 1024
    p = []
    if which == "station_concourse":
        concourse(p)
        return finish_and_ship(which, p, "station", dists=(0, 70, 220))
    bay(p, {"station_bay": None, "station_bay_bench": lambda q: (bench(q), board(q)), "station_bay_vend": vend}[which])
    return finish_and_ship(which, p, "station", dists=(0, 50, 160))
