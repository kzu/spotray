"""Draw the Spotray app icon: Spotify-green tile, music note, tray bar."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
GREEN = (29, 185, 84, 255)
WHITE = (255, 255, 255, 255)
SHADOW = (0, 0, 0, 48)


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    pad = 36
    rounded_rect(d, [pad, pad, SIZE - pad, SIZE - pad], radius=228, fill=GREEN)

    # Beamed eighth notes — reads as "music" even at 16px.
    head_w, head_h = 196, 142
    left_cx, right_cx = 360, 668
    head_cy = 628
    stem_w = 48
    stem_top = 248
    stem_bottom = 620

    for cx in (left_cx, right_cx):
        hx0 = cx - head_w // 2
        hy0 = head_cy - head_h // 2
        d.ellipse([hx0, hy0, hx0 + head_w, hy0 + head_h], fill=WHITE)
        sx = cx + head_w // 2 - stem_w - 6
        d.rectangle([sx, stem_top, sx + stem_w, stem_bottom], fill=WHITE)

    beam_top = 236
    beam_h = 72
    d.polygon(
        [
            (left_cx + head_w // 2 - stem_w - 6, beam_top),
            (right_cx + head_w // 2 - 6, beam_top + 18),
            (right_cx + head_w // 2 - 6, beam_top + 18 + beam_h),
            (left_cx + head_w // 2 - stem_w - 6, beam_top + beam_h),
        ],
        fill=WHITE,
    )

    # System-tray bar under the notes — a dock / notification strip.
    bar_y = 812
    bar_h = 52
    rounded_rect(d, [248, bar_y, 776, bar_y + bar_h], radius=26, fill=WHITE)
    # Three tray slots as green cuts, so the bar reads as a tray not a minus.
    slot_w, slot_h = 86, 22
    gap = 36
    total = 3 * slot_w + 2 * gap
    start = (SIZE - total) // 2
    for i in range(3):
        x = start + i * (slot_w + gap)
        y = bar_y + (bar_h - slot_h) // 2
        rounded_rect(d, [x, y, x + slot_w, y + slot_h], radius=8, fill=GREEN)

    # Subtle inner shadow so the tile sits like an OS icon.
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    rounded_rect(sd, [pad + 10, pad + 18, SIZE - pad + 6, SIZE - pad + 14], radius=228, fill=SHADOW)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    img = Image.alpha_composite(img, shadow)
    img = Image.alpha_composite(img, layer)

    out = Path(__file__).resolve().parents[1] / "src-tauri" / "app-icon.png"
    img.save(out, "PNG")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
