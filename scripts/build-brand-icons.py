"""Export local PNG/ICO assets from the reviewed coral PlayCast artwork.

Development-only tool: Python + Pillow. No runtime or network dependency.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

root = Path(__file__).resolve().parents[1]
source = Image.open(root / "artwork/playcast-icon-master.png").convert("RGB")
# The generator returned an opaque presentation background. Find the coral tile
# silhouette, then fill its enclosed ivory motif; do not key out ivory details.
mask = Image.new("L", source.size)
draw = ImageDraw.Draw(mask)
pixels = source.load()
for y in range(source.height):
    row = [x for x in range(source.width)
           if pixels[x, y][0] > 130
           and pixels[x, y][0] - max(pixels[x, y][1:]) > 35]
    if row:
        draw.line((row[0], y, row[-1], y), fill=255)
bounds = mask.getbbox()
if not bounds:
    raise ValueError("The input does not contain the expected coral icon")
tile = source.convert("RGBA")
tile.putalpha(mask.filter(ImageFilter.GaussianBlur(.35)))
tile = tile.crop((max(0, bounds[0]-2), max(0, bounds[1]-2),
                  min(source.width, bounds[2]+2), min(source.height, bounds[3]+2)))
canvas = Image.new("RGBA", (512, 512))
tile.thumbnail((464, 464), Image.Resampling.LANCZOS)
canvas.alpha_composite(tile, ((512-tile.width)//2, (512-tile.height)//2))
output = root / "public/assets/brand"
output.mkdir(parents=True, exist_ok=True)
canvas.save(output / "playcast.png", optimize=True)
canvas.save(output / "playcast.ico", sizes=[(n, n) for n in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
print("Exported", output / "playcast.png", "and", output / "playcast.ico")
