import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import './index.css'

// أي تحديث جديد بنرفعه لايف كان محتاج مسح كاش/تابات يدوي عشان يظهر، لأن الـ service worker
// كان بيسجل التحديث بس من غير ما يفرض تحميل الصفحة تاني. دلوقتي بمجرد ما نسخة جديدة تتلاقي،
// بنعمل ريلود فوري تلقائي عشانها تظهر لأول ريفريش عادي
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
