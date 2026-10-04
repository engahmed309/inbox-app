import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { recoverApp } from './lib/recover'
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
    // visibilitychange لوحدها مش كفاية: موظف سايب التطبيق مفتوح قدامه ساعات من غير ما يخرج منه
    // مابيحصلش عنده أي فحص خالص، فبيفضل شغال على نسخة قديمة وهو مش واخد باله — وده بيخلي
    // "الميزة مش شغالة" مختلطة بـ"الميزة مش عندك أصلاً". نفحص كل ربع ساعة كمان طول ما التاب ظاهر
    setInterval(() => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    }, 15 * 60 * 1000)
  }
})

// فشل تحميل chunk (شاشة lazy) بعد تحديث جديد — Vite بيطلق الحدث ده، وبنعالجه بمسح الكاش وريلود
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); recoverApp() })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
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
    </ErrorBoundary>
  </React.StrictMode>
)
