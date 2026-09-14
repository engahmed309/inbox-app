import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from './contexts/AuthContext'
import { useToast } from './contexts/ToastContext'
import { API_URL, apiFetch } from './lib/supabase'
import LoginScreen from './screens/LoginScreen'
import ConversationsScreen from './screens/ConversationsScreen'
import ChatScreen from './screens/ChatScreen'
import SetPasswordScreen from './screens/SetPasswordScreen'
import CallCenter from './components/CallCenter'

// الشاشتين دول (ومعاهم مكتبة الشارتات الخاصة بالتقارير) مش محتاجهم غير الأدمن، فبنأجّل تحميلهم
// عشان الموظفين العاديين ميحملوش الحجم ده كله كل مرة يفتحوا التطبيق
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'))
const ReportsScreen = lazy(() => import('./screens/ReportsScreen'))
const BroadcastScreen = lazy(() => import('./screens/BroadcastScreen'))
const CommentsScreen = lazy(() => import('./screens/CommentsScreen'))
const CallsScreen = lazy(() => import('./screens/CallsScreen'))

function ScreenLoader() {
  return (
    <div className="h-full flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function PrivateRoute({ children }) {
  const { t } = useTranslation()
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="h-full flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 text-sm">{t('app.loading')}</span>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

// انستجرام بيحوّل المستخدم كامل الصفحة (مش نافذة منبثقة) لموقعنا الجذر بعد الموافقة، ومعاه
// ?code=... في الرابط — هنا بنمسكه أول ما التطبيق يفتح، أيًا كانت الشاشة اللي هيهبط عليها
function InstagramOAuthHandler() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    if (!code || sessionStorage.getItem('ig_connect_pending') !== '1') return

    sessionStorage.removeItem('ig_connect_pending')
    window.history.replaceState({}, '', location.pathname) // شيل ?code= من الرابط فورًا

    apiFetch(`${API_URL}/channels/instagram/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || t('app.instagramConnectFailed'))
        toast.success(t('app.instagramConnectSuccess'))
      })
      .catch(err => toast.error(t('settings.common.errorWithMessage', { message: err.message })))
      .finally(() => navigate('/settings', { replace: true }))
  }, [])

  return null
}

function HomeForAgent() {
  const { agent } = useAuth()
  if (agent && agent.role !== 'admin' && agent.access_scope === 'comments') {
    return <Navigate to="/comments" replace />
  }
  return <ConversationsScreen />
}

export default function App() {
  return (
    <>
      <InstagramOAuthHandler />
      {/* المكالمة بترن عند الموظف مهما كانت الشاشة المفتوحة، فالمكوّن ده فوق الراوتر مش جواه */}
      <CallCenter />
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/set-password" element={<SetPasswordScreen />} />
        {/* موظف التعليقات بس مالوش شغل في شاشة المحادثات — بيدخل على شاشته مباشرة بدل ما يشوف
            شاشة فاضية أو بيانات مش من حقه */}
        <Route path="/" element={<PrivateRoute><HomeForAgent /></PrivateRoute>} />
        <Route path="/chat/:id" element={<PrivateRoute><ChatScreen /></PrivateRoute>} />
        <Route path="/settings/*" element={<PrivateRoute><Suspense fallback={<ScreenLoader />}><SettingsScreen /></Suspense></PrivateRoute>} />
        <Route path="/reports" element={<PrivateRoute><Suspense fallback={<ScreenLoader />}><ReportsScreen /></Suspense></PrivateRoute>} />
        <Route path="/broadcast" element={<PrivateRoute><Suspense fallback={<ScreenLoader />}><BroadcastScreen /></Suspense></PrivateRoute>} />
        <Route path="/comments" element={<PrivateRoute><Suspense fallback={<ScreenLoader />}><CommentsScreen /></Suspense></PrivateRoute>} />
        <Route path="/calls" element={<PrivateRoute><Suspense fallback={<ScreenLoader />}><CallsScreen /></Suspense></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
