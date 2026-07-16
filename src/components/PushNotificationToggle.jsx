import { useState, useEffect, useRef } from 'react'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Bell, BellOff, Volume2, VolumeX, X } from 'lucide-react'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

// زرار تفعيل/إيقاف إشعارات الموبايل + ميوت الصوت — بيظهر لكل الموظفين جوا السايدبار
export default function PushNotificationToggle() {
  const { agent } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(agent?.notify_sound_enabled ?? true)
  const wrapRef = useRef(null)

  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

  useEffect(() => {
    setSoundEnabled(agent?.notify_sound_enabled ?? true)
  }, [agent?.notify_sound_enabled])

  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    })
  }, [supported])

  useEffect(() => {
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const enablePush = async () => {
    if (!supported) { toast.error('المتصفح ده مش بيدعم الإشعارات'); return }
    setLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') { toast.error('لازم توافق على الإذن عشان الإشعارات تشتغل'); return }

      const keyRes = await fetch(`${API_URL}/push/vapid-public-key`)
      const keyData = await keyRes.json()
      if (!keyRes.ok) throw new Error(keyData.error || 'فشل تفعيل الإشعارات')

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
        })
      }

      const res = await fetch(`${API_URL}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id, subscription: sub.toJSON() })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'فشل تفعيل الإشعارات')

      setSubscribed(true)
      toast.success('اتفعلت إشعارات الموبايل')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const disablePush = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch(`${API_URL}/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
      toast.success('اتوقفت إشعارات الموبايل')
    } catch (err) {
      toast.error('خطأ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSound = async () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    await supabase.from('agents').update({ notify_sound_enabled: next }).eq('id', agent.id)
  }

  return (
    <div ref={wrapRef}>
      <button onClick={() => setOpen(v => !v)} title="إشعارات الموبايل"
        className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg rounded-lg hover:bg-surface-3 transition-colors">
        {subscribed ? <Bell size={15} /> : <BellOff size={15} />}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm bg-surface border border-surface-3 rounded-2xl shadow-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-fg text-sm">إشعارات الموبايل</span>
              <button onClick={() => setOpen(false)} className="text-fg-muted hover:text-fg">
                <X size={16} />
              </button>
            </div>
            {!supported ? (
              <p className="text-xs text-fg-subtle">المتصفح ده مش بيدعم إشعارات الموبايل</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg">إشعارات الموبايل</span>
                  <button onClick={subscribed ? disablePush : enablePush} disabled={loading}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium disabled:opacity-50 ${subscribed ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                    {loading ? '...' : subscribed ? 'مفعّلة' : 'فعّل'}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-surface-3">
                  <span className="flex items-center gap-1.5 text-sm text-fg">
                    {soundEnabled ? <Volume2 size={14} className="text-fg-muted" /> : <VolumeX size={14} className="text-fg-muted" />}
                    صوت الإشعار
                  </span>
                  <button onClick={toggleSound}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${soundEnabled ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted'}`}>
                    {soundEnabled ? 'شغال' : 'صامت'}
                  </button>
                </div>
                <p className="text-[11px] text-fg-subtle leading-relaxed">
                  الصوت بيجي بس لو التطبيق مقفول أو في الخلفية.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
