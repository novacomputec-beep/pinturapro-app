import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pt from './pt.json'
import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import de from './de.json'
import ru from './ru.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
      ru: { translation: ru },
    },
    lng: 'pt', // idioma padrão
    fallbackLng: 'pt',
    interpolation: { escapeValue: false },
  })

export default i18n