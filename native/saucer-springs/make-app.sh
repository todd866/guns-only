#!/bin/zsh
# Build "Saucer Springs.app" (icon, shaders, exported world) and install it in ~/Applications.
# Usage: native/saucer-springs/make-app.sh [world.rcworld]   (default ~/.local/state/rc-native/neighbourhood.rcworld)
set -e
here=${0:A:h}; world=${1:-$HOME/.local/state/rc-native/neighbourhood.rcworld}
cd $here && swift build -c release
app="$HOME/Applications/Saucer Springs.app"; stage=$(mktemp -d)/Saucer\ Springs.app
mkdir -p "$stage/Contents/MacOS" "$stage/Contents/Resources"
cp .build/release/SaucerSprings "$stage/Contents/MacOS/"
cp Sources/SaucerSprings/Shaders.metal "$stage/Contents/Resources/"
cp "$world" "$stage/Contents/Resources/world.rcworld"
iconset=$(mktemp -d)/AppIcon.iconset; mkdir -p $iconset
python3 icon/make-icon.py $iconset/icon_512x512@2x.png
for s in 16 32 128 256 512; do sips -z $s $s $iconset/icon_512x512@2x.png --out $iconset/icon_${s}x${s}.png >/dev/null; sips -z $((s*2)) $((s*2)) $iconset/icon_512x512@2x.png --out $iconset/icon_${s}x${s}@2x.png >/dev/null; done
iconutil -c icns $iconset -o "$stage/Contents/Resources/AppIcon.icns"
cat > "$stage/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Saucer Springs</string><key>CFBundleDisplayName</key><string>Saucer Springs</string>
<key>CFBundleIdentifier</key><string>com.gunsonly.saucer-springs</string><key>CFBundleExecutable</key><string>SaucerSprings</string>
<key>CFBundleIconFile</key><string>AppIcon</string><key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1</string><key>CFBundleVersion</key><string>$(git -C $here rev-parse --short HEAD)</string>
<key>LSMinimumSystemVersion</key><string>15.0</string><key>NSHighResolutionCapable</key><true/>
<key>LSApplicationCategoryType</key><string>public.app-category.racing-games</string>
</dict></plist>
PLIST
codesign --force --deep --sign - "$stage" >/dev/null 2>&1 || true
mkdir -p "$HOME/Applications"; [ -d "$app" ] && trash "$app"; mv "$stage" "$app"
touch "$app"; echo "installed $app"
