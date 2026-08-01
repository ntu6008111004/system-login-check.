from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
CANVAS = 512


def build_icon(size=CANVAS):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    scale = size / 64

    def points(values):
        return [(round(x * scale), round(y * scale)) for x, y in values]

    draw.rounded_rectangle(
        [2 * scale, 2 * scale, 62 * scale, 62 * scale],
        radius=16 * scale,
        fill="#173A85",
    )
    draw.polygon(
        points([(32, 10), (49, 17), (49, 29), (47, 38), (41, 47), (32, 54), (23, 49), (17, 41), (15, 29), (15, 17)]),
        fill="#F56A70",
    )
    draw.line(
        points([(23.5, 31.7), (29.2, 37.4), (41, 25.4)]),
        fill="white",
        width=max(2, round(5 * scale)),
        joint="curve",
    )
    return image


source = build_icon()
source.resize((32, 32), Image.Resampling.LANCZOS).save(ROOT / "favicon-32x32.png", optimize=True)
source.resize((180, 180), Image.Resampling.LANCZOS).save(ROOT / "apple-touch-icon.png", optimize=True)
source.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
