// tools/build-app.mjs
// Builds the web game for the store apps (served from "/") and syncs it into the
// native projects.
//
//   node tools/build-app.mjs             build + sync only
//   node tools/build-app.mjs android     ...then build a debug APK
//
// Needs the Android SDK and a JDK (Android Studio's bundled one works). Paths are
// found automatically on Windows, macOS and Linux; set JAVA_HOME / ANDROID_HOME to override.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const env = { ...process.env, VITE_BASE_PATH: '/' };
const isWin = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, env, ...opts });
  if (result.status !== 0) process.exit(result.status || 1);
}

const first = (list) => list.find((p) => p && existsSync(p));

run('npx', ['vite', 'build']);
run('npx', ['cap', 'sync']);

if (process.argv[2] === 'android') {
  const java = isWin ? 'java.exe' : 'java';
  env.JAVA_HOME = env.JAVA_HOME || [
    'C:/Program Files/Android/Android Studio/jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr'
  ].find((p) => existsSync(join(p, 'bin', java)));
  env.ANDROID_HOME = env.ANDROID_HOME || first([
    join(homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    join(homedir(), 'Android', 'Sdk')
  ]);
  if (!env.JAVA_HOME || !env.ANDROID_HOME) {
    console.error('Could not find a JDK or the Android SDK. Install Android Studio, or set JAVA_HOME and ANDROID_HOME.');
    process.exit(1);
  }
  env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
  env.PATH = join(env.JAVA_HOME, 'bin') + (isWin ? ';' : ':') + env.PATH;
  const gradle = isWin ? '.'+String.fromCharCode(92)+'gradlew.bat' : './gradlew';
  run(gradle, ['assembleDebug'], { cwd: 'android' });
  console.log('\nDebug APK: android/app/build/outputs/apk/debug/app-debug.apk');
}
