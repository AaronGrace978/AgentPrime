# Application Icons

This directory contains the application icons used by Tauri for building the desktop application.

## Required Icon Files

The following icon files are referenced in `src-tauri/tauri.conf.json` and should be placed in this directory:

### Windows Icons
- `32x32.png` - 32x32 pixel PNG for Windows
- `128x128.png` - 128x128 pixel PNG for Windows
- `128x128@2x.png` - 256x256 pixel PNG for high-DPI Windows
- `icon.ico` - Windows ICO format (multi-resolution)

### macOS Icons
- `icon.icns` - macOS ICNS format

## Icon Generation

You can generate these icons from a single high-resolution source image using online tools or scripts:

### Online Tools
- [Favicon.io](https://favicon.io/favicon-converter/)
- [RealFaviconGenerator](https://realfavicongenerator.net/)
- [IconGenerator](https://www.icongenerator.ai/)

### Example Commands (using ImageMagick)
```bash
# Convert single PNG to required formats
convert source-icon.png -resize 32x32 32x32.png
convert source-icon.png -resize 128x128 128x128.png
convert source-icon.png -resize 256x256 128x128@2x.png

# For Windows ICO (requires multiple sizes)
convert source-icon.png -resize 16x16 -resize 32x32 -resize 48x48 icon.ico
```

## Icon Specifications

- **Format**: PNG for cross-platform compatibility
- **Background**: Prefer transparent or appropriate background color
- **Aspect Ratio**: Square (1:1) recommended
- **Source Resolution**: Start with 512x512 or higher for best quality

## Default Icons

If you don't have custom icons, you can:
1. Use the default Tauri icons
2. Generate simple placeholder icons
3. Download free icon sets from sites like [Flaticon](https://www.flaticon.com/)

## Updating Icons

After adding or changing icons:
1. Update this directory with new files
2. Rebuild the application: `npm run tauri:build`
3. Test on target platforms to ensure icons display correctly
