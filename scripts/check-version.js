#!/usr/bin/env node
// Garante que expo.version (app.json) e versionName (android/app/build.gradle) são a MESMA
// string. Com a pasta android/ no repo, o EAS ignora app.json e usa o versionName do Gradle
// no APK/AAB — um bump só no app.json publica a versão antiga na loja (foi o caso 1.1.8 → 1.1.9).
//
// versionCode/buildNumber NÃO entram: são remotos (eas.json appVersionSource "remote").
//
// Uso: node scripts/check-version.js        → sai 1 se divergirem
//      node scripts/check-version.js --fix  → copia o expo.version para o Gradle
const fs = require('fs')
const path = require('path')

const raiz = path.resolve(__dirname, '..')
const appJsonPath = path.join(raiz, 'app.json')
const gradlePath = path.join(raiz, 'android', 'app', 'build.gradle')

const appVersion = JSON.parse(fs.readFileSync(appJsonPath, 'utf8')).expo.version
const gradle = fs.readFileSync(gradlePath, 'utf8')
const m = gradle.match(/^(\s*versionName\s+")([^"]*)(")/m)
if (!m) { console.error('check-version: versionName não encontrado em android/app/build.gradle'); process.exit(2) }
const gradleVersion = m[2]

if (appVersion === gradleVersion) {
  console.log(`check-version: OK — app.json e build.gradle em ${appVersion}`)
  process.exit(0)
}

if (process.argv.includes('--fix')) {
  fs.writeFileSync(gradlePath, gradle.replace(m[0], `${m[1]}${appVersion}${m[3]}`))
  console.log(`check-version: build.gradle versionName ${gradleVersion} → ${appVersion}`)
  process.exit(0)
}

console.error(`check-version: DIVERGENTES — app.json expo.version ${appVersion} ≠ build.gradle versionName ${gradleVersion}`)
console.error('  rode: node scripts/check-version.js --fix')
process.exit(1)
