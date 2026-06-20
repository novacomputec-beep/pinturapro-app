# Checklist — Notificações Push (Android / FCM)

Estado da configuração de push notifications. Itens manuais (EAS / Firebase) são
executados pelo Luiz; os de código/config já estão commitados.

## Feito (código/config)

- [x] `app.json`: `android.googleServicesFile` → `./google-services.json`
- [x] `app.json`: permissão `android.permission.POST_NOTIFICATIONS` (Android 13+)
- [x] `app.json`: plugin `expo-notifications` com `color` `#E8833A`
- [x] `app.config.js`: injeta `google-services.json` via env var `GOOGLE_SERVICES_JSON`
      (fallback p/ `./google-services.json` em build local)
- [x] `eas.json`: profiles `development`/`preview`/`production` vinculados aos environments
- [x] `.gitignore`: `google-services.json` (não versionado; fornecido via EAS)
- [x] `AuthContext`: loga permissão negada e falhas de registro do push token
- [x] `pinturapro-api` `alertaService`: loga falhas de ticket e limpa tokens
      `DeviceNotRegistered` via recibos
- [x] `google-services.json` validado: JSON ok, `package_name` = `com.pinturapro.app`,
      `api_key` presente, project `pinturapro-881d1`

## Pendente (passos manuais do Luiz)

- [ ] **Upload da credencial FCM V1** (chave de service account) para o serviço de push:
      `eas credentials` → plataforma **Android** → **Google Service Account Key for FCM V1**.
      Sem isso o build sobe mas as notificações NÃO são entregues.
      Gerar a chave no Firebase Console → Project Settings → Service accounts →
      *Generate new private key* (JSON) do projeto `pinturapro-881d1`.
- [ ] Criar a file env var em cada environment que for buildar:
      `eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json`
      (repetir p/ `preview` / `development` se forem buildados)

## Verificação pós-build

- [ ] Build Android conclui sem erro de `googleServicesFile` ausente
- [ ] App registra o push token após login (log `[Push] token registrado:`)
- [ ] Envio de teste chega ao dispositivo; recibos não retornam `DeviceNotRegistered`
