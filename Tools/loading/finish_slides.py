# The last touch on the drawn slides: a soft bloom, a little paper grain and a vignette, then a JPEG small enough to load fast.
#   python3 Tools/loading/finish_slides.py <png dir> <out dir>
import glob, os, random, sys
from PIL import Image, ImageChops, ImageFilter, ImageDraw
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, "*.png"))):
    im = Image.open(f).convert("RGB")
    bloom = im.filter(ImageFilter.GaussianBlur(18)).point(lambda v: max(0, v - 205) * 3)
    im = ImageChops.add(im, bloom.point(lambda v: v * 0.22))
    W, H = im.size
    r = random.Random(7)
    grain = Image.effect_noise((W // 2, H // 2), 22).resize((W, H)).convert("RGB")
    im = Image.blend(im, ImageChops.overlay(im, grain), 0.18)
    vig = Image.new("L", (W, H), 0); d = ImageDraw.Draw(vig)
    d.ellipse([-W * 0.25, -H * 0.3, W * 1.25, H * 1.3], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(140))
    im = Image.composite(im, ImageChops.multiply(im, Image.new("RGB", (W, H), (150, 140, 160))), vig)
    name = os.path.splitext(os.path.basename(f))[0] + ".jpg"
    im.save(os.path.join(out, name), "JPEG", quality=86, optimize=True, progressive=True)
    print(name, os.path.getsize(os.path.join(out, name)) // 1024, "KB")
