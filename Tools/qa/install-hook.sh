#!/bin/sh
# Turns on the AAA gate's pre-push hook for this clone and installs what it needs.
cd "$(git rev-parse --show-toplevel)" || exit 1
git config core.hooksPath .githooks
chmod +x .githooks/pre-push 2>/dev/null
for py in python3 python; do
  if command -v $py >/dev/null 2>&1; then
    $py -c "import PIL, numpy" 2>/dev/null || $py -m pip install --quiet pillow numpy || $py -m pip install --quiet --user pillow numpy
    break
  fi
done
echo "AAA gate pre-push hook is on. Run it any time: python3 Tools/qa/aaa_gate.py"
