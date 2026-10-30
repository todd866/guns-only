#!/bin/zsh
# Build "Saucer Springs.app" (icon, shaders, exported world) and install it in ~/Applications.
# Usage: native/saucer-springs/make-app.sh [world.rcworld]   (default ~/.local/state/rc-native/neighbourhood.rcworld)
set -e
here=${0:A:h}; world=${1:-$HOME/.local/state/rc-native/neighbourhood.rcworld}
cd $here && swift build -c release
app="/Applications/Saucer Springs.app"; stage=$(mktemp -d)/Saucer\ Springs.app
mkdir -p "$stage/Contents/MacOS" "$stage/Contents/Resources"
cp .build/release/SaucerSprings "$stage/Contents/MacOS/"
cp Sources/SaucerSprings/Shaders.metal Sources/SaucerSprings/rcsim.js "$stage/Contents/Resources/"
# The game: the same packaged web build the website ships (tools/rc/package-rc.mjs), so the app and
# guns-only.com/rc never drift apart.
web=$(mktemp -d)/web; (cd $here/../.. && node tools/rc/package-rc.mjs --out "$web" >/dev/null) && cp -R "$web" "$stage/Contents/Resources/web"
cp "$world" "$stage/Contents/Resources/world.rcworld"
[ -d "${world%.rcworld}.tex" ] && cp -R "${world%.rcworld}.tex" "$stage/Contents/Resources/world.tex"
for ext in car col; do [ -f "${world%.rcworld}.$ext" ] && cp "${world%.rcworld}.$ext" "$stage/Contents/Resources/world.$ext"; done
# Icon: an Icon Composer icon (icon/AppIcon.icon, layers from icon/make-glyphs.py). actool compiles
# it to Assets.car plus a fallback .icns; a plain .icns alone gets a grey frame on current macOS.
icons=$(mktemp -d); xcrun actool "$here/icon/AppIcon.icon" --compile $icons --app-icon AppIcon --platform macosx --minimum-deployment-target 15.0 --output-partial-info-plist $icons/partial.plist >/dev/null
cp $icons/Assets.car $icons/AppIcon.icns "$stage/Contents/Resources/"
cat > "$stage/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Saucer Springs</string><key>CFBundleDisplayName</key><string>Saucer Springs</string>
<key>CFBundleIdentifier</key><string>com.gunsonly.saucer-springs</string><key>CFBundleExecutable</key><string>SaucerSprings</string>
<key>CFBundleIconFile</key><string>AppIcon</string><key>CFBundleIconName</key><string>AppIcon</string><key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1</string><key>CFBundleVersion</key><string>$(git -C $here rev-parse --short HEAD)</string>
<key>LSMinimumSystemVersion</key><string>15.0</string><key>NSHighResolutionCapable</key><true/>
<key>LSApplicationCategoryType</key><string>public.app-category.racing-games</string>
</dict></plist>
PLIST
codesign --force --deep --sign - "$stage" >/dev/null 2>&1 || true
[ -d "$app" ] && trash "$app"; mv "$stage" "$app"
touch "$app"; echo "installed $app"
