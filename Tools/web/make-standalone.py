#!/usr/bin/env python3
"""Turn Web/konto.html into one self-contained page, for hosts that serve a single file.

The browser build normally fetches the character from seiko.glb next to it. That works on a
web server and nowhere else: an artifact host serves no .glb, and a file opened straight from
a phone's Files app cannot fetch its neighbours at all. So this carries the model into the
page as base64, which the page already knows how to use, and drops the document wrapper that
such hosts supply themselves.

    python3 Tools/web/make-standalone.py                 # -> Web/konto-standalone.html
    python3 Tools/web/make-standalone.py --out /tmp/x.html --keep-wrapper

--keep-wrapper leaves <!doctype html> and friends in place, which is what you want for
anything you open yourself or serve normally. Without it the output is a fragment, which is
what an artifact host wants, because it wraps the page in its own skeleton.
"""

import argparse
import base64
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ANCHOR = '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>'


def build(source, model, keep_wrapper, title):
    page = open(source, encoding="utf-8").read()

    if "SEIKO_GLB_B64" not in page:
        sys.exit("%s has no SEIKO_GLB_B64 hook, so the model cannot be carried in it." % source)
    if ANCHOR not in page:
        sys.exit("Could not find the three.js tag to put the model before. Has the page moved on?")

    if not keep_wrapper:
        head = page[page.index("<head>") + len("<head>"):page.index("</head>")]
        body = page[page.index("<body>") + len("<body>"):page.rindex("</body>")]
        # The host supplies charset and a viewport-fit=cover viewport of its own.
        head = re.sub(r'\s*<meta charset="[^"]*">', "", head)
        head = re.sub(r'\s*<meta name="viewport"[^>]*>', "", head)
        page = head.strip() + "\n" + body.strip() + "\n"

    if title:
        page = re.sub(r"<title>.*?</title>", "<title>%s</title>" % title, page, count=1, flags=re.S)

    glb = base64.b64encode(open(model, "rb").read()).decode("ascii")
    carried = (
        '<script id="seiko-model">\n'
        "// Seiko Shigu, rigged with idle / walk / run, carried in the page because there is\n"
        "// nowhere alongside it to fetch him from.\n"
        'window.SEIKO_GLB_B64 = "%s";\n'
        "</script>\n" % glb
    )
    return page.replace(ANCHOR, carried + ANCHOR, 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default=os.path.join(ROOT, "Web", "konto.html"))
    ap.add_argument("--model", default=os.path.join(ROOT, "Web", "seiko.glb"))
    ap.add_argument("--out", default=os.path.join(ROOT, "Web", "konto-standalone.html"))
    ap.add_argument("--title", default=None, help="replace the page title")
    ap.add_argument("--keep-wrapper", action="store_true",
                    help="keep <!doctype html>, for a page you serve or open yourself")
    args = ap.parse_args()

    out = build(args.source, args.model, args.keep_wrapper, args.title)

    # Whatever the host does with it, a page that still declares a document it does not own
    # is the one mistake worth refusing to ship.
    if not args.keep_wrapper:
        low = out.lower()
        for tag in ("<!doctype", "<html", "<body"):
            if tag in low:
                sys.exit("The wrapper was meant to be stripped but %s survived." % tag)

    open(args.out, "w", encoding="utf-8").write(out)
    print("wrote %s  (%.1f MB, model carried in)" % (args.out, len(out) / 1024 / 1024))


if __name__ == "__main__":
    main()
