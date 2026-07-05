import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import th from '../locales/th.json'
import en from '../locales/en.json'

export type Language = 'th' | 'en'

const STORAGE_KEY = 'tb-lang'

/** Read the persisted UI language, defaulting to Thai (the product's primary locale). */
export function getStoredLanguage(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'th' || v === 'en') return v
  } catch {
    /* ignore */
  }
  return 'th'
}

/** Change language, persist it, and reflect it on <html lang> for a11y/SEO. */
export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang)
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute('lang', lang)
}

i18n.use(initReactI18next).init({
  resources: {
    th: { translation: th },
    en: { translation: en },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'th',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
})

document.documentElement.setAttribute('lang', getStoredLanguage())

export default i18n
