import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useToast } from './contexts/ToastContext'
import { API_URL } from './lib/supabase'
import LoginScreen from './screens/LoginScreen'
import ConversationsScreen from './screens/ConversationsScreen'
import ChatScreen from './screens/ChatScreen'

// الشاشتين دول (ومعاهم مكتبة الشارتات الخاصة بالتقارير) مش محتاجهم غير الأدمن، فبنأجّل تحميلهم
// عشان الموظفين العاديين ميحملوش الحجم ده كله كل مرة يفتحوا التطبيق
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'))
const ReportsScreen = lazy(() => import('./screens/ReportsScreen'))

function ScreenLoader() {
  return (
    <div className="h-full flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="h-full flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 text-sm">جاري التحميل...</span>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

// انستجرام بيحوّل المستخدم كامل الصفحة (مش نافذة منبثقة) لموقعنا الجذر بعد الموافقة، ومعاه
// ?code=... في الرابط — هنا بنمسكه أول ما التطبيق يفتح، أيًا كانت الشاشة اللي هيهبط عليها
function InstagramOAuthHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    if (!code || sessionStorage.getItem('ig_connect_pending') !== '1') return

    sessionStorage.removeItem('ig_connect_pending')
    window.history.replaceState({}, '', location.pathname) // شيل ?code= من الرابط فورًا

    fetch(`${API_URL}/channels/instagram/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'فشل ربط انستجرام')
        toast.success('اترابط حساب انستجرام بنجاح')
      })
      .catch(err => toast.error('خطأ: ' + err.message))
      .finally(() => navigate('/settings', { replace: true }))
  }, [])

  return null
}

export default function App() {
  return (
    <>
      <InstagramOAuthHandler />
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/" element={<PrivateRoute><ConversationsScreen /></PrivateRoute>} />
        <Route path="/chat/:id" element={<PrivateRoute><ChatScreen /></PrivateRoute>} />
        <Route path="/settings/*" element={<PrivateRoute><Suspense fallback={<ScreenLoader />}><SettingsScreen /></Suspense></PrivateRoute>} />
        <Route path="/reports" element={<PrivateRoute><Suspense fallback={<ScreenLoader />}><ReportsScreen /></Suspense></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
