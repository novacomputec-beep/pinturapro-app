// Configuração dinâmica do Expo.
// Usa app.json como base (recebido em `config`) e injeta o google-services.json
// a partir da variável de ambiente do EAS (file env var GOOGLE_SERVICES_JSON).
// Em builds locais, faz fallback para o ./google-services.json definido no app.json
// (arquivo gitignored, fornecido localmente).
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
})
