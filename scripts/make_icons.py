"""Draw the web app's icons as PNG files (standard library only).

The icon is a plain glyph — three ruled lines with bullets, like a ledger page — on the dark ink
color of the design tokens. It contains no text, so a rename of the project does not touch it
(CLAUDE.md §4). Everything sits inside the central 80% circle, so the same drawing also works as
a maskable icon (the launcher may crop to a circle or a rounded square).

Usage (from the repository root): python3 scripts/make_icons.py
Writes web/public/icon-192.png, icon-512.png and apple-touch-icon.png (180 px).
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web" / "public"

INK = (0x1C, 0x1C, 0x1E)  # --color-text (light mode)
PAPER = (0xFB, 0xFA, 0xF7)  # --color-bg (light mode)
ACCENT = (0x9D, 0xB4, 0xD3)  # --color-accent (dark mode)

# Shapes on a 64 x 64 grid: (x0, y0, x1, y1, color), drawn in order over the INK background.
GRID = 64
SHAPES = [
    *[(14, y, 19, y + 5, ACCENT) for y in (19.5, 29.5, 39.5)],  # bullets
    *[(23, y + 1, 50, y + 4, PAPER) for y in (19.5, 29.5, 39.5)],  # ruled lines
]


def draw(size: int) -> list[bytearray]:
    """Rasterize the shapes at ``size`` pixels, with coverage-based anti-aliasing."""
    scale = size / GRID
    rows = [bytearray(bytes(INK) * size) for _ in range(size)]
    for x0, y0, x1, y1, color in SHAPES:
        left, top, right, bottom = x0 * scale, y0 * scale, x1 * scale, y1 * scale
        for y in range(int(top), min(size, int(bottom) + 1)):
            cover_y = max(0.0, min(bottom, y + 1) - max(top, y))
            for x in range(int(left), min(size, int(right) + 1)):
                cover = cover_y * max(0.0, min(right, x + 1) - max(left, x))
                if cover <= 0:
                    continue
                row = rows[y]
                for c in range(3):
                    old = row[3 * x + c]
                    row[3 * x + c] = round(old + (color[c] - old) * cover)
    return rows


def png(rows: list[bytearray]) -> bytes:
    """Encode 8-bit RGB rows as a PNG (filter type 0 on every row)."""
    height, width = len(rows), len(rows[0]) // 3

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    """Write the three icon files."""
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in (
        ("icon-192.png", 192),
        ("icon-512.png", 512),
        ("apple-touch-icon.png", 180),
    ):
        path = OUT / name
        path.write_bytes(png(draw(size)))
        print(f"wrote {path} ({size} x {size})")


if __name__ == "__main__":
    main()
