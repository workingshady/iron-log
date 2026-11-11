// `node scripts/build-apk.mjs <versionCode> <versionName>` — builds a signed Android APK (Trusted Web Activity)
// that opens the live app full-screen. Uses Google's Bubblewrap core + the local JDK and Android SDK.
//
// Secrets stay in private/ (git-ignored): private/android/iron-log.keystore + password in private/SETUP.md.
// The site serves /.well-known/assetlinks.json with this key's SHA-256 so Android drops the URL bar.
// Output: private/android/out/iron-log-<versionName>.apk
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { AndroidSdkTools, Config, ConsoleLog, JdkHelper, TwaGenerator, TwaManifest } from "@bubblewrap/core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const URL_ = "https://iron-log.workingshady.workers.dev/manifest.webmanifest";
const versionCode = Number(process.argv[2] ?? 1);
const versionName = process.argv[3] ?? `1.0.${versionCode}`;
const priv = path.join(ROOT, "private", "android");
const project = path.join(priv, "project");
const out = path.join(priv, "out");
const keystore = path.join(priv, "iron-log.keystore");
const pw = fs.readFileSync(path.join(ROOT, "private", "SETUP.md"), "utf8").match(/Password \(store \+ key\): (\S+)/)?.[1];
if (!pw || !fs.existsSync(keystore)) throw new Error("Missing keystore or password in private/ — see private/SETUP.md");

const jdk = process.env.JAVA_HOME || "C:/Program Files/Java/jdk-17";
const sdk = process.env.ANDROID_HOME || "D:/dev/Android/Sdk";
const log = new ConsoleLog("apk");

const twa = await TwaManifest.fromWebManifest(URL_);
Object.assign(twa, {
  packageId: "com.workingshady.ironlog",
  name: "Iron Log",
  launcherName: "Iron Log",
  themeColor: twa.themeColor, navigationColor: twa.backgroundColor, backgroundColor: twa.backgroundColor,
  appVersionCode: versionCode,
  appVersionName: versionName,
  signingKey: { path: keystore, alias: "ironlog" },
  fallbackType: "customtabs",
  enableNotifications: false,
  orientation: "portrait",
  monochromeIconUrl: "https://iron-log.workingshady.workers.dev/icon-monochrome-512.png", // Android 13+ themed icon
  display: "standalone",
});
fs.rmSync(project, { recursive: true, force: true });
fs.mkdirSync(project, { recursive: true });
fs.mkdirSync(out, { recursive: true });
await new TwaGenerator().createTwaProject(project, twa, log);
fs.writeFileSync(path.join(project, "twa-manifest.json"), JSON.stringify(twa.toJson(), null, 2));
// androidbrowserhelper 2.7+ needs Android 7.0+ (API 24); the A24 runs Android 13+
const bg = path.join(project, "app", "build.gradle");
fs.writeFileSync(bg, fs.readFileSync(bg, "utf8").replace(/minSdkVersion \d+/, "minSdkVersion 24"));

const config = new Config(jdk, sdk);
const jdkHelper = new JdkHelper(process, config);
const sdkTools = new AndroidSdkTools(process, config, jdkHelper, log);
if (!(await sdkTools.checkBuildTools())) await sdkTools.installBuildTools();
// Gradle: call the wrapper by full path (Bubblewrap's relative "gradlew.bat" isn't found on Windows)
const gradlew = path.join(project, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
const r = spawnSync(gradlew, ["assembleRelease", "--no-daemon", "-q"], { cwd: project, env, stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) throw new Error(`gradle failed (${r.status})`);

const unsigned = path.join(project, "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk");
const aligned = path.join(out, "aligned.apk");
const final = path.join(out, `iron-log-${versionName}.apk`);
fs.rmSync(aligned, { force: true });
await sdkTools.zipalign(unsigned, aligned);
// sign: run apksigner.jar directly (no shell → paths with spaces work, password never echoed)
const bt = fs.readdirSync(path.join(sdk, "build-tools")).sort().pop();
const sign = spawnSync(path.join(jdk, "bin", "java"), ["-jar", path.join(sdk, "build-tools", bt, "lib", "apksigner.jar"), "sign",
  "--ks", keystore, "--ks-key-alias", "ironlog", "--ks-pass", "env:IL_KS_PASS", "--key-pass", "env:IL_KS_PASS", "--out", final, aligned],
  { env: { ...process.env, IL_KS_PASS: pw }, stdio: ["ignore", "inherit", "pipe"] });
if (sign.status !== 0) throw new Error("apksigner failed: " + String(sign.stderr).replaceAll(pw, "***"));
const verify = spawnSync(path.join(jdk, "bin", "java"), ["-jar", path.join(sdk, "build-tools", bt, "lib", "apksigner.jar"), "verify", "--print-certs", final], { encoding: "utf8" });
console.log(verify.stdout.split(/\r?\n/).filter((l) => /SHA-256/.test(l)).join("\n"));
fs.rmSync(aligned, { force: true });
console.log(`\nAPK: ${final} (${(fs.statSync(final).size / 1024 / 1024).toFixed(2)} MB)`);
