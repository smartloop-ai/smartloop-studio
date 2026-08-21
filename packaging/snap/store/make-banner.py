#!/usr/bin/env python3
"""Generate Snap Store banner assets for smartloop-studio.

Store spec: banner.(png|jpg) must be exactly 3:1, between 720x240 and 4320x1440.
Optional banner-icon.(png|jpg) is overlaid on the left of the banner; its height
must stay under 240px.

The logo mark is redrawn vectorially (geometry measured from snap/icon.png)
rather than upscaled, so it stays crisp at any output size.
"""
from PIL import Image, ImageChops, ImageDraw, ImageFont

OUT_W, OUT_H = 3840, 1280          # 3:1, within the 4320x1440 ceiling
SS = 3                             # supersampling factor for shape antialiasing

INK = (14, 13, 16)                 # slightly deeper/cooler than the icon's #131313
WHITE = (255, 255, 255)
PINK = (255, 52, 120)              # #FF3478
VIOLET = (124, 77, 255)
CYAN = (0, 190, 255)
MUTED = (150, 145, 158)

FONT = "/usr/share/fonts/truetype/ubuntu/UbuntuSans[wdth,wght].ttf"

# Mark geometry in the icon's native 512px space.
CIRCLE_C, CIRCLE_R = (223.5, 267.0), 107.5   # blob: circle with squared BR quadrant
DOT_C, DOT_R = (332.0, 198.5), 63.5          # pink dot
MARK_X0, MARK_Y0 = 116.0, 135.0              # mark bounding box origin
MARK_W, MARK_H = 279.5, 239.5


def font_at(size, weight=400):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([100, weight])   # [Width, Weight]
    return f


def draw_mark(layer, scale, ox, oy, white=WHITE, pink=PINK):
    """Draw the logo mark onto `layer` (already supersampled by SS)."""
    d = ImageDraw.Draw(layer)

    def pt(x, y):
        return ((x - MARK_X0) * scale + ox) * SS, ((y - MARK_Y0) * scale + oy) * SS

    cx, cy = CIRCLE_C
    x0, y0 = pt(cx - CIRCLE_R, cy - CIRCLE_R)
    x1, y1 = pt(cx + CIRCLE_R, cy + CIRCLE_R)
    d.ellipse([x0, y0, x1, y1], fill=white)

    # square off the bottom-right quadrant
    qx0, qy0 = pt(cx, cy)
    qx1, qy1 = pt(cx + CIRCLE_R, cy + CIRCLE_R)
    d.rectangle([qx0, qy0, qx1, qy1], fill=white)

    dx, dy = DOT_C
    px0, py0 = pt(dx - DOT_R, dy - DOT_R)
    px1, py1 = pt(dx + DOT_R, dy + DOT_R)
    d.ellipse([px0, py0, px1, py1], fill=pink)


def radial_glow(size, center, radius, color, peak_alpha):
    """Soft radial glow, computed small then upscaled for a smooth falloff."""
    w, h = size
    sw, sh = 192, max(1, int(192 * h / w))
    mask = Image.new("L", (sw, sh), 0)
    mpx = mask.load()
    cx, cy = center[0] * sw / w, center[1] * sh / h
    rx, ry = radius * sw / w, radius * sh / h
    for y in range(sh):
        for x in range(sw):
            dx, dy = (x - cx) / rx, (y - cy) / ry
            d = (dx * dx + dy * dy) ** 0.5
            if d < 1.0:
                falloff = (1.0 - d) ** 2          # smooth, no hard edge
                mpx[x, y] = int(peak_alpha * falloff)
    mask = mask.resize((w, h), Image.LANCZOS)
    glow = Image.new("RGBA", (w, h), color + (0,))
    glow.putalpha(mask)
    return glow


def dot_grid(size, spacing=52, radius=2.4, base_alpha=20, fade_to=0.62):
    """Faint dot matrix, strongest at the left, gone by `fade_to` across."""
    w, h = size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cutoff = w * fade_to
    for gy in range(0, h + spacing, spacing):
        for gx in range(0, int(cutoff), spacing):
            a = int(base_alpha * max(0.0, 1.0 - gx / cutoff) ** 1.4)
            if a > 1:
                d.ellipse([gx - radius, gy - radius, gx + radius, gy + radius],
                          fill=(255, 255, 255, a))
    return layer


def grain(img, sigma=9):
    """Signed film grain. Also dithers the mesh, which killed the old banding."""
    n = Image.effect_noise((img.width, img.height), sigma).convert("L")
    return ImageChops.add(img, Image.merge("RGB", (n, n, n)), scale=1, offset=-128)


def tracked_text(d, xy, text, font, fill, tracking):
    """Draw with manual letter-spacing (Pillow has no tracking control)."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + tracking
    return x - tracking - xy[0]


def tracked_width(d, text, font, tracking):
    return sum(d.textlength(c, font=font) for c in text) + tracking * (len(text) - 1)


def build_banner():
    img = Image.new("RGB", (OUT_W, OUT_H), INK)

    # Mesh gradient: several wide, offset colour fields. Individually they would
    # contour-band at these alphas; the grain pass below dithers them smooth.
    for cx, cy, rad, col, a in (
        (0.78, 0.34, 0.50, PINK, 40),
        (0.96, 0.86, 0.42, VIOLET, 34),
        (0.58, 0.94, 0.38, VIOLET, 18),
        (0.30, 0.10, 0.34, CYAN, 12),
    ):
        img.paste(
            gl := radial_glow((OUT_W, OUT_H), (OUT_W * cx, OUT_H * cy),
                              OUT_W * rad, col, a),
            (0, 0), gl,
        )

    img.paste(gd := dot_grid((OUT_W, OUT_H)), (0, 0), gd)

    d = ImageDraw.Draw(img)
    title_f = font_at(204, 700)
    tag_f = font_at(52, 500)
    title = "Smartloop Studio"
    tag = "YOUR AI MISSION CONTROL"          # tracked-out label, not sentence case
    tag_track = 7.5

    # Asymmetric left-aligned lockup rather than centred.
    mark_h = 316
    ms = mark_h / MARK_H
    mark_w = MARK_W * ms
    left = 300
    text_x = left + mark_w + 104

    tb = d.textbbox((0, 0), title, font=title_f)
    gh = d.textbbox((0, 0), tag, font=tag_f)[3] - d.textbbox((0, 0), tag, font=tag_f)[1]
    gap_text = 40
    block_h = (tb[3] - tb[1]) + gap_text + gh
    top = (OUT_H - block_h) / 2

    shapes = Image.new("RGBA", (OUT_W * SS, OUT_H * SS), (0, 0, 0, 0))
    draw_mark(shapes, ms, left, (OUT_H - mark_h) / 2)
    shapes = shapes.resize((OUT_W, OUT_H), Image.LANCZOS)
    img.paste(shapes, (0, 0), shapes)

    d.text((text_x - tb[0], top - tb[1]), title, font=title_f, fill=WHITE)
    tag_y = top + (tb[3] - tb[1]) + gap_text
    tracked_text(d, (text_x, tag_y), tag, tag_f, MUTED, tag_track)

    # Short accent rule tying the label back to the brand colour.
    rule_y = tag_y + gh / 2
    rule_x = text_x + tracked_width(d, tag, tag_f, tag_track) + 44
    d.rounded_rectangle([rule_x, rule_y - 3, rule_x + 150, rule_y + 3], radius=3,
                        fill=PINK)

    img = grain(img)

    # JPEG, not PNG: film grain is incompressible noise, so PNG lands ~5.9 MB,
    # far over the store's 2 MB ceiling. q90 at 4:4:4 keeps it ~1.5 MB with no
    # visible artefacts on the gradient.
    img.save("store/banner.jpg", "JPEG", quality=90, subsampling=0,
             optimize=True, progressive=True)
    return img.size


def build_banner_icon(px=224):
    """Transparent square mark, height kept safely under the 240px limit."""
    ss = Image.new("RGBA", (px * SS, px * SS), (0, 0, 0, 0))
    pad = px * 0.06
    scale = (px - 2 * pad) / max(MARK_W, MARK_H)
    ox = (px - MARK_W * scale) / 2
    oy = (px - MARK_H * scale) / 2
    draw_mark(ss, scale, ox, oy)
    ss.resize((px, px), Image.LANCZOS).save("store/banner-icon.png", optimize=True)
    return px, px


if __name__ == "__main__":
    print("banner.png     ", build_banner())
    print("banner-icon.png", build_banner_icon())
