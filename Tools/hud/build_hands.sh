#!/bin/sh
# Renders Seiko's HUD hand for every outfit (Web/art/hud/hand_<outfit>.png + hands.json). Needs Playwright.
cd "$(dirname "$0")/../.."
for m in seiko_player seiko_suit_black seiko_suit_charcoal seiko_waistcoat seiko_suit_check seiko_polo seiko_blue_shirt seiko_tshirt seiko_track; do
  node Tools/hud/render_hand.mjs Tools/hud/hand_pose.json /tmp/hudhand_$m.png $m || exit 1
done
python3 Tools/hud/pack_hands.py
