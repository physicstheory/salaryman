"""Pull top-level declarations out of the game's single script, by name.

The game is one big <script> in a consistent style: a declaration starts at
column 0, and a multi-line one ends on a line that is only closing brackets at
column 0. That is enough to lift a function or a constant out by name without
a JavaScript parser, which is what the phone lab needs.
"""
import re, io

START = re.compile(r'^(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\b)')
CLOSER = re.compile(r'^[\}\]\)]+[;,]?\s*$')

def code_of(line):
    """A line without its trailing // comment, so that `const A = 1; // note` reads as complete."""
    q = None
    for k, ch in enumerate(line):
        if q:
            if ch == q and line[k - 1] != "\\":
                q = None
        elif ch in "\"'`":
            q = ch
        elif ch == "/" and line[k:k + 2] == "//":
            return line[:k]
    return line

def script_of(html_path):
    s = io.open(html_path, encoding="utf-8").read()
    parts = re.findall(r'<script(?![^>]*src=)[^>]*>(.*?)</script>', s, re.S)
    return max(parts, key=len)

def declarations(script):
    lines = script.split("\n")
    decls = {}
    i = 0
    while i < len(lines):
        m = START.match(lines[i])
        if not m:
            i += 1
            continue
        name = m.group(1) or m.group(2)
        start = i
        first = code_of(lines[i])
        # a one-line declaration: it ends on its own line and its brackets balance
        def balanced(t):
            return t.count("{") == t.count("}") and t.count("[") == t.count("]") and t.count("(") == t.count(")")
        if first.rstrip().endswith((";", "}")) and balanced(first):
            end = i
        else:
            j = i + 1
            while j < len(lines) and not CLOSER.match(lines[j]):
                j += 1
            end = j
        if name not in decls:                      # keep the first of any duplicate
            decls[name] = (start, end, "\n".join(lines[start:end + 1]))
        i = end + 1
    return decls

IDENT = re.compile(r'[A-Za-z_$][\w$]*')

def uses(text):
    """Identifiers mentioned in a declaration, minus the ones inside strings and comments."""
    t = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    t = re.sub(r'(?m)(?<![:"\'\w])//.*$', ' ', t)
    t = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', t)
    t = re.sub(r"'(?:\\.|[^'\\\n])*'", "''", t)
    t = re.sub(r'`(?:\\.|[^`\\])*`', '``', t, flags=re.S)
    return set(IDENT.findall(t))

def closure(decls, roots, cut):
    """Everything the roots need, stopping at names in `cut`."""
    got, order, stack = set(), [], list(roots)
    unresolved = {}
    while stack:
        n = stack.pop()
        if n in got or n in cut:
            continue
        if n not in decls:
            continue
        got.add(n)
        order.append(n)
        for u in uses(decls[n][2]):
            if u in decls and u not in got and u not in cut:
                stack.append(u)
    return got
