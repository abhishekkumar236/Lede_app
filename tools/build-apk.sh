#!/usr/bin/env bash
# Build a signed release APK.
#
#   ./tools/build-apk.sh              arm64 only (every phone since ~2016), ~45 MB
#   ./tools/build-apk.sh --all-arch   universal APK, ~108 MB
#   ./tools/build-apk.sh --install    build, then install on the connected device

set -euo pipefail
cd "$(dirname "$0")/.."

ARCHS="arm64-v8a"
INSTALL=false
BUNDLE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all-arch) ARCHS="armeabi-v7a,arm64-v8a,x86,x86_64"; shift ;;
    --install)  INSTALL=true; shift ;;
    --aab)      BUNDLE=true; shift ;;
    -h|--help)  sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

[[ -f credentials.json ]] || { echo "credentials.json missing - see README" >&2; exit 1; }
[[ -f credentials/release.keystore ]] || { echo "credentials/release.keystore missing" >&2; exit 1; }
[[ -d android ]] || { echo "android/ missing - run: npx expo prebuild --platform android" >&2; exit 1; }

KS_PASS=$(node -e "console.log(require('./credentials.json').android.keystore.keystorePassword)")
KS_ALIAS=$(node -e "console.log(require('./credentials.json').android.keystore.keyAlias)")
VERSION=$(node -e "const a=require('./app.json').expo;console.log(a.version+' ('+a.android.versionCode+')')")

if [[ $BUNDLE == true ]]; then
  echo "Building Lede $VERSION as an AAB for Google Play"
else
  echo "Building Lede $VERSION for $ARCHS"
fi
echo

GRADLE_TASK=assembleRelease
[[ $BUNDLE == true ]] && GRADLE_TASK=bundleRelease

cd android
./gradlew "$GRADLE_TASK" \
  -PreactNativeArchitectures="$ARCHS" \
  -Pandroid.injected.signing.store.file="$PWD/../credentials/release.keystore" \
  -Pandroid.injected.signing.store.password="$KS_PASS" \
  -Pandroid.injected.signing.key.alias="$KS_ALIAS" \
  -Pandroid.injected.signing.key.password="$KS_PASS"
cd ..

VER=$(node -e "console.log(require('./app.json').expo.version)")

if [[ $BUNDLE == true ]]; then
  APK=android/app/build/outputs/bundle/release/app-release.aab
  OUT="$HOME/Desktop/Lede-$VER.aab"
else
  APK=android/app/build/outputs/apk/release/app-release.apk
  OUT="$HOME/Desktop/Lede-$VER.apk"
fi

[[ -f "$APK" ]] || { echo "build finished but nothing at $APK" >&2; exit 1; }
cp "$APK" "$OUT"

echo
echo "build: $OUT"
echo "size: $(du -h "$OUT" | cut -f1)"

if [[ $INSTALL == true ]]; then
  echo
  echo "installing..."
  adb install -r "$APK"
fi
