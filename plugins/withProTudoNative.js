// Config plugin local: recoloca, a cada `expo prebuild`, o que antes só existia como edição
// manual em android/ (ver native-overrides/ para as cópias originais). Três partes:
//
//   (a) AndroidManifest — quatro <uses-feature required="false"> e os dois meta-data
//       com.google.firebase.messaging.* (ícone/cor). O par expo.modules.notifications.* NÃO
//       entra aqui: o plugin do expo-notifications já o escreve a partir de app.json.
//   (b) PinturaProOkHttpFactory.kt — copiado de native-overrides/ para o pacote do app.
//   (c) MainApplication.kt — registro do OkHttpClientProvider.setOkHttpClientFactory logo
//       depois de super.onCreate(), antes de qualquer módulo nativo pedir o cliente.
//
// O porquê de cada item está nos comentários dos próprios arquivos em native-overrides/.
const fs = require('fs')
const path = require('path')
const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
  AndroidConfig,
} = require('expo/config-plugins')
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode')

const FACTORY_CLASS = 'PinturaProOkHttpFactory'
const FACTORY_SRC = path.join('native-overrides', 'java', 'com', 'pinturapro', 'app', `${FACTORY_CLASS}.kt`)

// Negam a obrigatoriedade que o Play inferiria de CAMERA / ACCESS_*_LOCATION.
const USES_FEATURES = [
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.location.gps',
  'android.hardware.location',
]

// Apresentação direta do FCM. Mesmo drawable/cor que o expo-notifications usa.
const FIREBASE_META = [
  ['com.google.firebase.messaging.default_notification_icon', '@drawable/notification_icon'],
  ['com.google.firebase.messaging.default_notification_color', '@color/notification_icon_color'],
]

// ---------- (a) manifesto ----------
function setManifest(androidManifest) {
  const manifest = androidManifest.manifest
  manifest['uses-feature'] = manifest['uses-feature'] || []
  for (const name of USES_FEATURES) {
    if (!manifest['uses-feature'].some((f) => f.$['android:name'] === name)) {
      manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } })
    }
  }
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest)
  for (const [name, resource] of FIREBASE_META) {
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, name, resource, 'resource')
  }
  return androidManifest
}

// ---------- (c) MainApplication.kt ----------
function setMainApplication(contents) {
  let src = AndroidConfig.CodeMod.addImports(
    contents,
    ['com.facebook.react.modules.network.OkHttpClientProvider'],
    /* isJava */ false
  )
  return mergeContents({
    src,
    tag: 'protudo-okhttp-factory',
    anchor: /^\s*super\.onCreate\(\)\s*$/m,
    offset: 1,
    comment: '//',
    newSrc: [
      '    // AQUI, e não mais tarde: o OkHttpClientProvider guarda a fábrica num campo estático e',
      '    // quem pedir o cliente antes deste ponto (NetworkingModule, FrescoModule) recebe o',
      '    // padrão do RN em silêncio. Ver native-overrides/java/.../PinturaProOkHttpFactory.kt.',
      `    OkHttpClientProvider.setOkHttpClientFactory(${FACTORY_CLASS}(this))`,
    ].join('\n'),
  }).contents
}

// ---------- (b) cópia da fábrica ----------
function copyFactory(config) {
  const pkg = AndroidConfig.Package.getPackage(config)
  if (!pkg) throw new Error('withProTudoNative: android.package ausente em app.json')
  const src = path.join(config.modRequest.projectRoot, FACTORY_SRC)
  if (!fs.existsSync(src)) throw new Error(`withProTudoNative: ${FACTORY_SRC} não encontrado`)
  const dest = path.join(
    config.modRequest.platformProjectRoot,
    'app', 'src', 'main', 'java', ...pkg.split('.'), `${FACTORY_CLASS}.kt`
  )
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  return config
}

const withProTudoNative = (config) => {
  config = withAndroidManifest(config, (c) => {
    c.modResults = setManifest(c.modResults)
    return c
  })
  config = withDangerousMod(config, ['android', async (c) => copyFactory(c)])
  config = withMainApplication(config, (c) => {
    if (c.modResults.language !== 'kt') {
      throw new Error('withProTudoNative: MainApplication esperado em Kotlin')
    }
    c.modResults.contents = setMainApplication(c.modResults.contents)
    return c
  })
  return config
}

module.exports = withProTudoNative
// Expostos para teste sem rodar o prebuild.
module.exports.setManifest = setManifest
module.exports.setMainApplication = setMainApplication
