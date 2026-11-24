#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

ARCHIVE_PATH="${1:-$HERE/build/GunsOnlyiOS.xcarchive}"
EXPORT_PLIST="$HERE/build/ExportOptions-AppStore.plist"

./stage-web-payload.sh
xcodegen generate

mkdir -p "$(dirname "$ARCHIVE_PATH")"

xcodebuild \
  -project "$HERE/GunsOnlyiOS.xcodeproj" \
  -scheme GunsOnlyiOS \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$HERE/build/ArchiveDerivedData" \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  clean archive

APP_PATH="$ARCHIVE_PATH/Products/Applications/GunsOnlyiOS.app"
codesign --verify --deep --strict "$APP_PATH"

cat > "$EXPORT_PLIST" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>destination</key>
	<string>export</string>
	<key>method</key>
	<string>app-store-connect</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>stripSwiftSymbols</key>
	<true/>
	<key>teamID</key>
	<string>U87MQBZKJ5</string>
	<key>uploadSymbols</key>
	<true/>
</dict>
</plist>
PLIST

echo "archive: $ARCHIVE_PATH"
echo "export options: $EXPORT_PLIST"
echo "To export IPA locally (does NOT upload):"
echo "  xcodebuild -exportArchive -archivePath \"$ARCHIVE_PATH\" -exportOptionsPlist \"$EXPORT_PLIST\" -exportPath \"$HERE/build/AppStoreExport\" -allowProvisioningUpdates"
echo "Or open in Xcode Organizer to validate/submit com.iantodd.gunsonly:"
echo "  open \"$ARCHIVE_PATH\""
