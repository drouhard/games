#!/usr/bin/env python3
"""One-off utility that regenerates the app icons in shared/icons/.

This is NOT a build step - the site is served exactly as it sits in the repo.
Run it only when you want to change the icon artwork:

    python3 tools/make-icons.py

Writes PNGs with the standard library alone (zlib + struct), so there is
nothing to install.
"""

import os
import struct
import zlib

BG = (30, 27, 75)  # deep indigo, matches the site background family
TILE_A = (165, 180, 252)  # light periwinkle
TILE_B = (99, 102, 241)  # indigo

SIZES = (180, 192, 512)  # 180 = apple-touch-icon, 192/512 = web manifest
SS = 4  # supersampling factor, for smooth rounded corners
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "shared", "icons")


def rounded_rect_coverage(px, py, x, y, w, h, r):
    """1 if the point is inside the rounded rect, else 0."""
    if not (x <= px < x + w and y <= py < y + h):
        return 0
    # Corner circles: only the four corner squares need a distance test.
    cx = x + r if px < x + r else (x + w - r if px > x + w - r else px)
    cy = y + r if py < y + r else (y + h - r if py > y + h - r else py)
    return 1 if (px - cx) ** 2 + (py - cy) ** 2 <= r * r else 0


def render(size):
    """Draw a 2x2 grid of rounded tiles, matching pairs on each diagonal."""
    hi = size * SS
    pad = hi * 0.16
    gap = hi * 0.07
    tile = (hi - 2 * pad - gap) / 2
    radius = tile * 0.26

    tiles = [
        (pad, pad, TILE_A),
        (pad + tile + gap, pad, TILE_B),
        (pad, pad + tile + gap, TILE_B),
        (pad + tile + gap, pad + tile + gap, TILE_A),
    ]

    # Accumulate coverage at supersampled resolution, then box-filter down.
    rows = []
    for y in range(size):
        row = bytearray([0])  # PNG filter byte: none
        for x in range(size):
            acc = [0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    px = x * SS + sx + 0.5
                    py = y * SS + sy + 0.5
                    color = BG
                    for tx, ty, tint in tiles:
                        if rounded_rect_coverage(px, py, tx, ty, tile, tile, radius):
                            color = tint
                            break
                    acc[0] += color[0]
                    acc[1] += color[1]
                    acc[2] += color[2]
            n = SS * SS
            row += bytes((acc[0] // n, acc[1] // n, acc[2] // n, 255))
        rows.append(bytes(row))
    return b"".join(rows)


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, size, raw):
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, "icon-%d.png" % size)
        write_png(path, size, render(size))
        print("wrote %s (%d bytes)" % (path, os.path.getsize(path)))


if __name__ == "__main__":
    main()
