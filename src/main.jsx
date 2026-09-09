import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ToastProvider } from './contexts/ToastContext'
import './index.css'
import './i18n'

// أي تحديث جديد بنرفعه لايف كان محتاج مسح كاش/تابات يدوي عشان يظهر — مش لأن الريلود مش شغال، لكن
// لأن حد مايتفحصش نسخة السيرفر أصلاً طول ما التطبيق (PWA متثبتة) فاتح في الخلفية من غير ما يتقفل
// تمامًا. دلوقتي بنفحص كل مرة الموظف يرجع يفتح التطبيق (visibilitychange)، وبمجرد ما نسخة جديدة
// تتلاقي بنعمل ريلود فوري تلقائي
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload()
  },
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
)
