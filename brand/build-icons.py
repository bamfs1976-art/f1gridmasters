#!/usr/bin/env python3
"""Render the F1 Grid Masters app icon PNGs from brand/icon.svg.

Renderer: cairosvg (pip install cairosvg). Do NOT use ImageMagick `convert`
for the SVG — its SVG support distorts the -12deg skew. The icon is pure
geometry, so it renders identically everywhere.

Run from the repo root:  python3 brand/build-icons.py
"""
import os
import cairosvg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "brand", "icon.svg")

for out, size in [("icon-16.png", 16), ("icon-32.png", 32),
                  ("icon-180.png", 180), ("icon-512.png", 512)]:
    cairosvg.svg2png(url=SRC, write_to=os.path.join(ROOT, out),
                     output_width=size, output_height=size)
    print(f"  icon.svg -> {out:14s} {size}x{size}")
