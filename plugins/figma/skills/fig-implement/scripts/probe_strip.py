#!/usr/bin/env python3
"""
probe_strip — sample pixel colors from a rendered screenshot to verify a build
against the design, and to catch compositing seams the eye (and a static spec) miss.

A static spec can't reveal that two regions which should share a color (e.g. a
photo faded to the panel color, and the panel itself) actually diverge once
translucent/effect layers composite. Measuring the pixels does.

Usage (needs Pillow — run via uv so no global install):
  uv run --with pillow python3 probe_strip.py <image.png> [--x 0.25,0.5,0.75] [--rows 5] [--from 0] [--to 100]
  uv run --with pillow python3 probe_strip.py shot.png --row 0.62     # one horizontal line, many x
  uv run --with pillow python3 probe_strip.py shot.png --at 0.5,0.58 0.5,0.64   # compare specific points

Prints hex per sample. Look for: a color that should be continuous across a
boundary but jumps (a seam), or a region whose hex doesn't match the design's spec value.
"""
import sys

from PIL import Image


def hexof(px):
    return '#%02x%02x%02x' % (px[0], px[1], px[2])


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    path = argv[0]
    opts = argv[1:]
    im = Image.open(path).convert('RGB')
    w, h = im.size
    print(f'image {w}x{h}')

    def fopt(name, default):
        if name in opts:
            return opts[opts.index(name) + 1]
        return default

    # explicit points: --at x,y x,y ...
    if '--at' in opts:
        pts = [p for p in opts[opts.index('--at') + 1:] if ',' in p]
        for p in pts:
            fx, fy = (float(v) for v in p.split(','))
            x, y = int(w * fx), int(h * fy)
            print(f'({fx},{fy}) -> ({x},{y})  {hexof(im.getpixel((x, y)))}')
        return 0

    xs = [float(v) for v in fopt('--x', '0.25,0.5,0.75').split(',')]
    # single horizontal row across many x
    if '--row' in opts:
        fy = float(fopt('--row', '0.5'))
        y = int(h * fy)
        for fx in [i / 20 for i in range(1, 20)]:
            x = int(w * fx)
            print(f'x={fx:.2f}  {hexof(im.getpixel((x, y)))}')
        return 0

    # default: vertical strip(s), rows from --from% to --to% every --rows%
    y0 = float(fopt('--from', '0'))
    y1 = float(fopt('--to', '100'))
    step = float(fopt('--rows', '4'))
    cols = [int(w * fx) for fx in xs]
    print('y%   ' + '  '.join(f'x={fx}' for fx in xs))
    p = y0
    while p <= y1 + 1e-9:
        y = min(int(h * p / 100), h - 1)
        row = '  '.join(hexof(im.getpixel((x, y))) for x in cols)
        print(f'{p:>5.1f}  {row}')
        p += step
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
