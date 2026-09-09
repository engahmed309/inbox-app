import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { MessageSquare } from 'lucide-react'

// الشاشة دي بتفتح لما موظف يدوس على رابط الدعوة اللي وصله بالإيميل — سوبابيز بتعمل session
// تلقائي من التوكن اللي في الرابط، وهنا بس بنخليه يحط باسورد لنفسه عشان يقدر يدخل بيه بعد كده
export default function SetPasswordScreen() {
  const { t } = useTranslation()
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError(t('setPassword.passwordTooShort')); return }
    if (password !== confirm) { setError(t('setPassword.passwordMismatch')); return }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) { setError(t('setPassword.genericError')); return }
    navigate('/', { replace: true })
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center bg-surface p-4 text-center">
        <p className="text-fg-muted text-sm">{t('setPassword.invalidInviteLink')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand/30">
            <MessageSquare size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-fg">{t('setPassword.welcomeTitle')}</h1>
          <p className="text-fg-muted text-sm mt-1">{t('setPassword.subtitle', { email: user.email })}</p>
        </div>

        <form onSubmit={submit} className="bg-surface-2 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-2.5 text-danger text-sm">
              {error}
            </div>
          )}
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder={t('settings.common.password')} required
            className="w-full bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:ring-2 focus:ring-brand" />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder={t('setPassword.confirmPasswordPlaceholder')} required
            className="w-full bg-surface-3 rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:ring-2 focus:ring-brand" />
          <button type="submit" disabled={saving}
            className="w-full bg-brand hover:bg-brand/90 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
            {saving ? t('settings.common.savingEllipsis') : t('setPassword.confirmAndLogin')}
          </button>
        </form>
      </div>
    </div>
  )
}
