import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { supabase, API_URL, apiFetch } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react'

// الصوت بيمشي بين متصفح الموظف وميتا مباشرة — السيرفر بتاعنا بيتعامل مع الإشارات بس.
// STUN بيخلّي المتصفح يعرف عنوانه العام عشان يقدر يتفق مع ميتا على طريق للصوت. لو فيه موظف
// على شبكة مقفولة جدًا هنحتاج نضيف TURN كمان، وده اللي التجربة الأولى هتقوله لنا
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

// ميتا بتاخد الرد الصوتي مرة واحدة كنص كامل (مش trickle ICE زي المعتاد في الويب)، يعني لازم
// نستنى المتصفح يخلّص تجميع العناوين قبل ما نبعت. بنحط سقف عشان لو سيرفر STUN بطيء مانعلّقش
// المكالمة لحد ما مهلة ميتا تخلص
const ICE_GATHER_TIMEOUT_MS = 4000

function waitForIceGathering(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise(resolve => {
    const done = () => { pc.removeEventListener('icegatheringstatechange', check); clearTimeout(timer); resolve() }
    const check = () => { if (pc.iceGatheringState === 'complete') done() }
    const timer = setTimeout(done, ICE_GATHER_TIMEOUT_MS)
    pc.addEventListener('icegatheringstatechange', check)
  })
}

export default function CallCenter() {
  const { t } = useTranslation()
  const { agent } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [incoming, setIncoming] = useState(null)   // { call_id, contact_name, conversation_id, ... }
  const [active, setActive] = useState(null)       // نفس الشكل، بعد ما الموظف رد
  const [answering, setAnswering] = useState(false)
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const pcRef = useRef(null)
  const streamRef = useRef(null)
  const audioRef = useRef(null)
  const ringRef = useRef(null)
  const audioCtxRef = useRef(null)
  const activeRef = useRef(null)
  const tokenRef = useRef(null)

  const canTakeCalls = agent && ['messages', 'both'].includes(agent.access_scope || 'both')

  // المتصفحات بتبدأ الصوت "معلّق" لحد ما المستخدم يلمس الصفحة — وده كان بيخلي نغمة الرنين
  // ماتطلعش أصلاً، خصوصًا على الموبايل. فبنجهّز السياق الصوتي من أول لمسة للتطبيق ونسيبه
  // مفتوح، عشان أول مكالمة تيجي يبقى جاهز يرن فورًا
  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      audioCtxRef.current = new Ctx()
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {})
    return audioCtxRef.current
  }, [])

  useEffect(() => {
    const unlock = () => ensureAudio()
    for (const e of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(e, unlock, { passive: true })
    return () => { for (const e of ['pointerdown', 'keydown', 'touchstart']) document.removeEventListener(e, unlock) }
  }, [ensureAudio])

  // رنة تليفون حقيقية: نغمتين متداخلتين (زي نغمة الشبكة) بدل بيب واحد، عشان تبان إنها مكالمة
  const startRinging = useCallback(() => {
    const ctx = ensureAudio()
    if (!ctx) return
    const ring = () => {
      try {
        const gain = ctx.createGain()
        gain.gain.value = 0.0001
        gain.connect(ctx.destination)
        for (const freq of [440, 480]) {
          const osc = ctx.createOscillator()
          osc.type = 'sine'
          osc.frequency.value = freq
          osc.connect(gain)
          osc.start()
          osc.stop(ctx.currentTime + 1.2)
        }
        const t = ctx.currentTime
        gain.gain.exponentialRampToValueAtTime(0.35, t + 0.05)
        gain.gain.setValueAtTime(0.35, t + 0.9)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
      } catch { /* السياق اتقفل */ }
      // اهتزاز كمان على الموبايل — بيوصل حتى لو الجهاز صامت
      try { navigator.vibrate?.([400, 200, 400]) } catch { /* مش مدعوم */ }
    }
    ring()
    ringRef.current = { id: setInterval(ring, 3000) }
  }, [ensureAudio])

  const stopRinging = useCallback(() => {
    if (!ringRef.current) return
    clearInterval(ringRef.current.id)
    ringRef.current = null
    try { navigator.vibrate?.(0) } catch { /* مش مدعوم */ }
  }, [])

  const teardown = useCallback(() => {
    stopRinging()
    if (pcRef.current) { try { pcRef.current.close() } catch { /* مقفولة خلاص */ } pcRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(tr => tr.stop()); streamRef.current = null }
    setActive(null); setIncoming(null); setAnswering(false); setMuted(false); setSeconds(0)
  }, [stopRinging])

  // ─── الاشتراك في بث المكالمات ─────────────────────────────
  useEffect(() => {
    if (!canTakeCalls) return

    const ch = supabase.channel('agents:calls')
      .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
        // مرحلة الرنين الفردي: المكالمة بترن عند الموظف المعيّن بس، مش عندنا كلنا
        if (payload.target_agent_id && payload.target_agent_id !== agent.id) return
        setActive(a => { if (!a) { setIncoming(payload); startRinging() } return a })
      })
      .on('broadcast', { event: 'call-taken' }, ({ payload }) => {
        // موظف تاني سبقنا — بطّل رنين من غير ما تلمس مكالمة شغالة عندنا
        setIncoming(cur => (cur?.call_id === payload.call_id ? (stopRinging(), null) : cur))
      })
      .on('broadcast', { event: 'call-ended' }, ({ payload }) => {
        setIncoming(cur => (cur?.call_id === payload.call_id ? (stopRinging(), null) : cur))
        setActive(cur => { if (cur?.call_id === payload.call_id) { teardown(); return null } return cur })
      })
      .subscribe()

    // لو الموظف فتح البرنامج ومكالمة بترن خلاص، مش هيوصله البث اللي فات
    apiFetch(`${API_URL}/calls/ringing`)
      .then(r => r.json())
      .then(d => { if (d.calls?.length) { setIncoming(d.calls[0]); startRinging() } })
      .catch(() => {})

    return () => { supabase.removeChannel(ch) }
  }, [canTakeCalls, agent?.id, startRinging, stopRinging, teardown])

  // عدّاد مدة المكالمة
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [active])

  // بنمسك التوكن مقدمًا عشان لحظة الإغلاق مافيهاش وقت لأي await
  useEffect(() => {
    activeRef.current = active
    if (active) supabase.auth.getSession().then(({ data }) => { tokenRef.current = data?.session?.access_token || null })
  }, [active])

  // لما الموظف يقفل التطبيق وهو في مكالمة، الصوت بيموت عنده فورًا لكن المريض بيفضل سامع خط
  // مفتوح لحد ما ميتا تستسلم لوحدها. لازم نقول لميتا إن المكالمة خلصت.
  //
  // كل حاجة هنا لازم تكون متزامنة: المتصفح مش مستني أي await وهو بيقفل الصفحة. وkeepalive
  // هو اللي بيخلي الطلب يكمّل بعد ما الصفحة تموت — fetch عادي بيتلغي معاها
  useEffect(() => {
    const endOnLeave = () => {
      const id = activeRef.current?.call_id
      if (!id) return
      fetch(`${API_URL}/calls/${id}/hangup`, {
        method: 'POST', keepalive: true,
        headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}
      }).catch(() => {})
    }
    window.addEventListener('pagehide', endOnLeave)
    return () => window.removeEventListener('pagehide', endOnLeave)
  }, [])

  // ─── الرد ─────────────────────────────────────────────────
  const answer = async () => {
    if (!incoming || answering) return
    setAnswering(true)
    stopRinging()
    try {
      // الميكروفون الأول: لو الموظف رفض الإذن، مفيش فايدة من باقي الخطوات
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const offerRes = await apiFetch(`${API_URL}/calls/${incoming.call_id}/offer`)
      const offerData = await offerRes.json()
      if (!offerRes.ok) throw new Error(offerData.error)

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc
      stream.getTracks().forEach(tr => pc.addTrack(tr, stream))
      pc.ontrack = e => { if (audioRef.current) audioRef.current.srcObject = e.streams[0] }
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected'].includes(pc.connectionState)) {
          toast.error(t('calls.mediaFailed'))
          hangup()
        }
      }

      await pc.setRemoteDescription({ type: 'offer', sdp: offerData.sdp })
      const localAnswer = await pc.createAnswer()
      await pc.setLocalDescription(localAnswer)
      await waitForIceGathering(pc)

      const res = await apiFetch(`${API_URL}/calls/${incoming.call_id}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: pc.localDescription.sdp })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setActive({ ...incoming, conversation_id: data.conversation_id || incoming.conversation_id })
      setIncoming(null)
    } catch (err) {
      toast.error(err.message || t('calls.answerFailed'))
      teardown()
    } finally { setAnswering(false) }
  }

  const reject = async () => {
    if (!incoming) return
    const id = incoming.call_id
    stopRinging(); setIncoming(null)
    try { await apiFetch(`${API_URL}/calls/${id}/reject`, { method: 'POST' }) } catch { /* انتهت خلاص */ }
  }

  const hangup = async () => {
    const id = active?.call_id
    teardown()
    if (id) { try { await apiFetch(`${API_URL}/calls/${id}/hangup`, { method: 'POST' }) } catch { /* انتهت خلاص */ } }
  }

  const toggleMute = () => {
    const tracks = streamRef.current?.getAudioTracks() || []
    const next = !muted
    tracks.forEach(tr => { tr.enabled = !next })
    setMuted(next)
  }

  if (!canTakeCalls || (!incoming && !active)) return null
  const call = active || incoming
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline />
      <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-safe pt-3 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm bg-surface-2 border border-surface-3 rounded-2xl shadow-2xl p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-success/15' : 'bg-brand/15 animate-pulse'}`}>
              <Phone size={17} className={active ? 'text-success' : 'text-brand'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg truncate">{call.contact_name || call.from}</p>
              <p className="text-[11px] text-fg-subtle">
                {active ? `${t('calls.inCall')} · ${mmss}` : answering ? t('calls.connecting') : t('calls.incoming')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            {active ? (<>
              <button onClick={toggleMute}
                className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl bg-surface-3 text-fg-muted hover:text-fg text-xs font-medium">
                {muted ? <MicOff size={14} /> : <Mic size={14} />} {muted ? t('calls.unmute') : t('calls.mute')}
              </button>
              {call.conversation_id && (
                <button onClick={() => navigate(`/chat/${call.conversation_id}`)}
                  className="px-3 py-2.5 rounded-xl bg-surface-3 text-fg-muted hover:text-fg text-xs font-medium">
                  {t('calls.openChat')}
                </button>
              )}
              <button onClick={hangup}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-danger text-white text-xs font-semibold">
                <PhoneOff size={14} /> {t('calls.hangup')}
              </button>
            </>) : (<>
              <button onClick={reject} disabled={answering}
                className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl bg-surface-3 text-fg-muted hover:text-danger text-xs font-medium disabled:opacity-40">
                <PhoneOff size={14} /> {t('calls.decline')}
              </button>
              <button onClick={answer} disabled={answering}
                className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl bg-success text-white text-xs font-semibold disabled:opacity-40">
                <Phone size={14} /> {answering ? t('calls.connecting') : t('calls.answer')}
              </button>
            </>)}
          </div>
        </div>
      </div>
    </>
  )
}
