import { createContext, useContext, useState, useEffect } from 'react'
import i18n from '../i18n'

const LanguageContext = createContext(null)

function getInitialLanguage() {
  const saved = localStorage.getItem('language')
  if (saved === 'ar' || saved === 'en') return saved
  return 'ar'
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    i18n.changeLanguage(language)
    localStorage.setItem('language', language)
  }, [language])

  const toggleLanguage = () => setLanguage(l => (l === 'ar' ? 'en' : 'ar'))

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
