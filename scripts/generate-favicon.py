from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "favicon-for-public" / "651f4c9cb3c5d07b36b68ad1d68f72a07a6548dd4a0136856c19c7c81b8812a6.png"
DEST = ROOT / "apps" / "web" / "public"


def main() -> None:
    img = Image.open(SRC).convert("RGBA")

    size = 512
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    scale = int(size * 0.94)
    resized = img.resize((scale, scale), Image.LANCZOS)
    offset = ((size - scale) // 2, (size - scale) // 2)
    canvas.paste(resized, offset, resized)

    DEST.mkdir(parents=True, exist_ok=True)
    canvas.save(DEST / "favicon-512.png")
    canvas.resize((192, 192), Image.LANCZOS).save(DEST / "web-app-manifest-192.png")
    canvas.resize((32, 32), Image.LANCZOS).save(DEST / "favicon-32x32.png")
    canvas.resize((16, 16), Image.LANCZOS).save(DEST / "favicon-16x16.png")
    canvas.resize((180, 180), Image.LANCZOS).save(DEST / "apple-touch-icon.png")
    canvas.save(DEST / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    print("FAVICON BW CIRCLE GENERATED")


if __name__ == "__main__":
    main()
