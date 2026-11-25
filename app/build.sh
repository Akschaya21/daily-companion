#!/bin/bash
# Builds "Daily Companion.app" and installs it to ~/Applications.
# Needs only Apple's Command Line Tools (no Xcode).
set -euo pipefail
cd "$(dirname "$0")"

APP="build/Daily Companion.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O Sources/main.swift -o "$APP/Contents/MacOS/DailyCompanion" \
  -framework AppKit -framework WebKit -framework ServiceManagement -framework UserNotifications

cp Info.plist "$APP/Contents/Info.plist"
cp -R web "$APP/Contents/Resources/web"
codesign --force --deep --sign - "$APP"

if [[ "${1:-}" == "--install" ]]; then
  mkdir -p "$HOME/Applications"
  pkill -x DailyCompanion 2>/dev/null || true
  rm -rf "$HOME/Applications/Daily Companion.app"
  cp -R "$APP" "$HOME/Applications/"
  sleep 1
  open "$HOME/Applications/Daily Companion.app"
  echo "Installed to ~/Applications/Daily Companion.app"
else
  echo "Built $APP"
fi
