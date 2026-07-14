import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/" element={<PrivateRoute><ConversationsScreen /></PrivateRoute>} />
      <Route path="/chat/:id" element={<PrivateRoute><ChatScreen /></PrivateRoute>} />
      <Route path="/settings/*" element={<PrivateRoute><Suspense fallback={<ScreenLoader />}><SettingsScreen /></Suspense></PrivateRoute>} />
      <Route path="/reports" element={<PrivateRoute><Suspense fallback={<ScreenLoader />}><ReportsScreen /></Suspense></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
