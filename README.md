# PinturaPro — App Mobile

App React Native (Expo) da plataforma PinturaPro.

---

## Pré-requisitos

- Node.js 18+
- npm ou yarn
- Expo CLI: `npm install -g expo-cli`
- Expo Go no celular (Android) — [baixar na Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

---

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar a URL da API
# Edite o arquivo src/services/api.js e atualize API_URL
# com o endereço do seu servidor backend
```

---

## Rodando o app

```bash
# Iniciar o servidor de desenvolvimento
npm start

# Ou diretamente no Android
npm run android
```

Após rodar `npm start`, um QR Code aparece no terminal.
Escaneie com o app **Expo Go** no seu celular Android.

---

## Estrutura do projeto

```
src/
├── App.js                        ← entrada da aplicação
├── app.json                      ← configuração Expo
├── src/
│   ├── contexts/
│   │   └── AuthContext.js        ← estado global de autenticação
│   ├── navigation/
│   │   └── AppNavigator.js       ← toda a navegação do app
│   ├── screens/
│   │   ├── Auth/
│   │   │   ├── SplashScreen.js   ← tela de boas-vindas
│   │   │   └── LoginScreen.js    ← tela de login
│   │   ├── Feed/
│   │   │   └── FeedScreen.js     ← lista de obras com filtros
│   │   └── Obra/
│   │       └── DetalheObraScreen.js ← detalhe + candidatura
│   ├── components/
│   │   └── index.js              ← componentes reutilizáveis
│   ├── services/
│   │   └── api.js                ← todas as chamadas ao backend
│   ├── hooks/
│   │   └── useLocalizacao.js     ← hook de geolocalização
│   └── utils/
│       └── tema.js               ← cores, fontes, espaçamentos
```

---

## Publicando o app (APK para Android)

```bash
# 1. Instalar EAS CLI
npm install -g eas-cli

# 2. Login na conta Expo
eas login

# 3. Configurar o build
eas build:configure

# 4. Gerar o APK
eas build --platform android --profile preview
```

O APK gerado pode ser distribuído diretamente ou publicado na Play Store.

---

## Próximas telas a implementar

- [ ] CadastroScreen (3 etapas)
- [ ] ContratosScreen (lista + visualizar PDF)
- [ ] MensagensScreen (minhas dúvidas + respostas)
- [ ] PerfilScreen (dados + assinatura + logout)
- [ ] Notificações push (nova obra, candidatura aprovada)
