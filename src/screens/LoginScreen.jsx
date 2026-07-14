import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { MessageSquare } from 'lucide-react'

// مؤقتاً: لسه فاتحين تسجيل الدخول بإيميل وباسورد كمان (بجانب جوجل)، عشان مراجع ميتا يقدر يدخل يجرب التطبيق
const SHOW_PASSWORD_LOGIN = true

function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...props}>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.1z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  )
}

export default function LoginScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { user, signInWithGoogle, signInWithPassword, authError } = useAuth()
  const navigate = useNavigate()

  // بعد نجاح الدخول بالإيميل والباسورد، مفيش أي حاجة بتحول المستخدم لصفحة التطبيق تلقائي
  // (عكس جوجل اللي بيعمل ريدايركت كامل للصفحة)، فلازم نوديه إحنا بمجرد ما الـ user يتظبط
  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user])

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
      // المتصفح هيتحول لصفحة جوجل، فمش محتاجين نعمل حاجة تانية هنا
    } catch (err) {
      setError('حصل خطأ أثناء تسجيل الدخول، حاول تاني')
      setLoading(false)
    }
  }

  const handlePasswordLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithPassword(email, password)
    } catch (err) {
      setError('الإيميل أو الباسورد غلط')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand/30">
            <MessageSquare size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-fg">صحة وعافية</h1>
          <p className="text-fg-muted text-sm mt-1">منصة خدمة العملاء</p>
        </div>

        <div className="bg-surface-2 rounded-2xl p-6 space-y-4">
          {(error || authError) && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-2.5 text-danger text-sm">
              {error || authError}
            </div>
          )}

          {SHOW_PASSWORD_LOGIN && (
            <form onSubmit={handlePasswordLogin} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="الإيميل"
                required
                className="w-full bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:ring-2 focus:ring-brand"
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="الباسورد"
                required
                className="w-full bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:ring-2 focus:ring-brand"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand hover:bg-brand/90 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60"
              >
                {loading ? 'جاري الدخول...' : 'دخول'}
              </button>
            </form>
          )}

          {SHOW_PASSWORD_LOGIN && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-surface-3" />
              <span className="text-xs text-fg-subtle whitespace-nowrap">أو</span>
              <div className="flex-1 h-px bg-surface-3" />
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-3 border border-surface-3"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <><GoogleIcon /> تسجيل الدخول بجوجل</>
            )}
          </button>

          <p className="text-xs text-fg-subtle text-center leading-relaxed">
            الدخول متاح بس للموظفين المدعوين من الأدمن. لو محتاج حساب، تواصل مع إدارة العيادة.
          </p>
        </div>
      </div>
    </div>
  )
}
