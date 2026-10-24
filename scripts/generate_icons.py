"""Generate high-resolution application icons for XakuMedia desktop packaging."""

import math
from pathlib import Path
from PIL import Image, ImageDraw


def create_xakumedia_icon(size: int = 512) -> Image.Image:
    """Create a stylized XakuMedia brand icon with dark theme and crimson ruby glow."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = size * 0.06
    corner_radius = size * 0.22

    # Draw rounded background with subtle dark radial-like gradient
    bg_box = [margin, margin, size - margin, size - margin]
    draw.rounded_rectangle(bg_box, radius=corner_radius, fill=(11, 12, 16, 255), outline=(42, 14, 18, 255), width=int(size * 0.015))

    # Inner subtle glow rectangle
    inner_margin = margin + size * 0.025
    inner_box = [inner_margin, inner_margin, size - inner_margin, size - inner_margin]
    draw.rounded_rectangle(inner_box, radius=corner_radius * 0.85, outline=(80, 16, 24, 180), width=int(size * 0.008))

    cx, cy = size / 2, size / 2

    # Draw glowing accent circle in background
    glow_radius = size * 0.28
    for r in range(int(glow_radius), 0, -6):
        alpha = int(45 * (1 - r / glow_radius))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(229, 9, 20, alpha))

    # Draw stylized geometric "X" with download chevron / arrows
    # Upper left to lower right beam
    beam_width = size * 0.11
    half_span = size * 0.26

    # Draw main "X" beams in crimson gradient
    # Beam 1: Top-Left to Bottom-Right
    p1 = (cx - half_span, cy - half_span)
    p2 = (cx + half_span, cy + half_span)
    draw.line([p1, p2], fill=(229, 9, 20, 255), width=int(beam_width))

    # Beam 2: Top-Right to Bottom-Left
    p3 = (cx + half_span, cy - half_span)
    p4 = (cx - half_span, cy + half_span)
    draw.line([p3, p4], fill=(255, 42, 55, 255), width=int(beam_width))

    # Overlapping center highlight diamond
    diamond_size = size * 0.09
    diamond = [
        (cx, cy - diamond_size),
        (cx + diamond_size, cy),
        (cx, cy + diamond_size),
        (cx - diamond_size, cy),
    ]
    draw.polygon(diamond, fill=(255, 120, 130, 255))

    # Downward media download chevron accent
    arrow_y = cy + size * 0.16
    arrow_span = size * 0.10
    chevron = [
        (cx - arrow_span, arrow_y - arrow_span * 0.6),
        (cx, arrow_y),
        (cx + arrow_span, arrow_y - arrow_span * 0.6),
    ]
    draw.line(chevron, fill=(255, 255, 255, 240), width=int(size * 0.035), joint="curve")

    # Corner indicator dot (live system dot)
    dot_r = size * 0.03
    dot_x = size - margin - size * 0.10
    dot_y = margin + size * 0.10
    draw.ellipse([dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r], fill=(255, 59, 48, 255), outline=(255, 255, 255, 180), width=int(size * 0.005))

    return img


def main():
    root_dir = Path(__file__).resolve().parent.parent
    build_dir = root_dir / "build"
    build_dir.mkdir(parents=True, exist_ok=True)

    print("[generate-icons] Rendering 512x512 master icon...")
    master = create_xakumedia_icon(512)

    # Save PNG
    png_path = build_dir / "icon.png"
    master.save(png_path, format="PNG")
    print(f"[generate-icons] Saved master PNG to: {png_path}")

    # Also save 256x256
    png_256 = master.resize((256, 256), Image.Resampling.LANCZOS)
    png_256.save(build_dir / "icon-256.png", format="PNG")

    # Save multi-size ICO for Windows
    ico_path = build_dir / "icon.ico"
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"[generate-icons] Saved multi-resolution ICO to: {ico_path}")

    # Copy icon into frontend public if exists
    public_dir = root_dir / "frontend" / "public"
    if public_dir.exists():
        master.save(public_dir / "icon.png", format="PNG")
        print(f"[generate-icons] Copied icon.png to: {public_dir}")


if __name__ == "__main__":
    main()
