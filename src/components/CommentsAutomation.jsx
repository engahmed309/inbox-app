import { useState, useEffect, useCallback } from 'react'
import { Zap, Plus, Trash2, Pencil, Play, Facebook, Instagram, ExternalLink, Check, X, Send, ArrowRight } from 'lucide-react'
import { API_URL, apiFetch } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

// أتمتة الكومنتات (أدمن بس): لفيديو/ريل معيّن + رابط حلقة، اللي يطلب الرابط في تعليق يتبعتله الرابط في رسالة خاصة (private reply)
// ويتردّ عليه علنيًا إنه يشوف رسايله. التعليقات المحجوزة (سبام/إساءة) ما بتوصلش للأتمتة، وفشل الخاص (عدّى ٧ أيام أو الحساب مقفول) بينشر الرابط في الرد العلني.
const spinner = <div className="py-10 flex justify-center"><div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
const PLATFORM_AR = { facebook: 'فيسبوك', instagram: 'إنستجرام' }
const TYPE_AR = { reel: 'ريل', video: 'فيديو', post: 'منشور', image: 'صورة', carousel_album: 'ألبوم' }
const Pill = ({ active, onClick, children }) => <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 ${active ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>{children}</button>
const field = 'w-full bg-surface border border-surface-3 rounded-xl px-3 py-2 text-[13px] text-fg placeholder:text-fg-subtle focus:outline-none focus:border-brand'

const previewRender = (tpl, link) => String(tpl || '').replace(/\{( ?)name\}/g, (_m, sp) => `${sp}سارة`).replace(/\{link\}/g, link || 'https://…')

export default function CommentsAutomation() {
  const toast = useToast()
  const [list, setList] = useState(null)
  const [defaults, setDefaults] = useState(null)
  const [editing, setEditing] = useState(null)   // null | { ...form } (id موجود = تعديل)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/comments/automations`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setList(d.automations || []); setDefaults(d.defaults)
    } catch (err) { setList(prev => prev || []); toast.error(err.message) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const call = async (path, method, body) => {
    const res = await apiFetch(`${API_URL}${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'حصل خطأ')
    return d
  }
  const toggle = async (a) => { setBusy(a.id); try { await call(`/comments/automations/${a.id}`, 'PUT', { enabled: !a.enabled }); await load() } catch (e) { toast.error(e.message) } finally { setBusy(null) } }
  const remove = async (a) => { if (!window.confirm(`تحذف أتمتة «${a.name}»؟ سجل طلباتها هيتحذف كمان.`)) return; setBusy(a.id); try { await call(`/comments/automations/${a.id}`, 'DELETE'); await load() } catch (e) { toast.error(e.message) } finally { setBusy(null) } }
  const backfill = async (a) => {
    if (!window.confirm('هطبّق الأتمتة على التعليقات الموجودة على الفيديو ده (آخر 7 أيام) اللي بتطلب الرابط ولسه محدش ردّ عليها. تكمّل؟')) return
    setBusy(a.id)
    try { const r = await call(`/comments/automations/${a.id}/backfill`, 'POST'); toast.success(`لقيت ${r.matched} تعليق بيطلب الرابط — اتحطّ ${r.queued} في الطابور${r.skipped ? ` (اتخطّيت ${r.skipped}: نفس الشخص أو اتعالج)` : ''}`); await load() }
    catch (e) { toast.error(e.message) } finally { setBusy(null) }
  }

  if (editing) return <Editor toast={toast} call={call} defaults={defaults} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-3 space-y-3 pb-24">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <p className="text-sm font-bold text-fg flex items-center gap-2"><Zap size={16} className="text-brand" />أتمتة «رابط الحلقة»</p>
            <p className="text-[11px] text-fg-subtle mt-0.5 leading-relaxed">اختار فيديو أو ريل نزّلته (مقطع من حلقة يوتيوب مثلًا)، وحط رابط الحلقة. أي حد يعلّق على الفيديو ده يطلب الرابط بيتبعتله الرابط في رسالة خاصة، ويتردّ عليه علنيًا إنه يشوف رسايله. التعليقات المخالفة (سبام/إساءة) بتتفلتر زي ما هي.</p>
          </div>
          <button onClick={() => setEditing({ platform: 'facebook', post_id: '', name: '', link_url: '', private_message: defaults?.private_message || '', public_replies: (defaults?.public_replies || []).join('\n'), fallback_public: defaults?.fallback_public || '', extra_keywords: '', enabled: true })}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-brand text-white"><Plus size={14} />أتمتة جديدة</button>
        </div>

        {list === null && spinner}
        {list && !list.length && <div className="rounded-2xl border border-dashed border-surface-3 p-8 text-center text-xs text-fg-subtle">لسه مفيش أتمتة. دوس «أتمتة جديدة» واختار الفيديو.</div>}

        {list?.map(a => (
          <div key={a.id} className={`bg-surface-2 border rounded-2xl p-3.5 ${a.enabled ? 'border-surface-3' : 'border-surface-3 opacity-70'}`}>
            <div className="flex gap-3">
              {a.post_thumbnail ? <img src={a.post_thumbnail} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-surface-3" /> : <div className="w-16 h-16 rounded-xl bg-surface-3 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {a.platform === 'facebook' ? <Facebook size={13} className="text-blue-400" /> : <Instagram size={13} className="text-pink-400" />}
                  <span className="text-[13px] font-bold text-fg truncate">{a.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.enabled ? 'bg-success/15 text-success' : 'bg-surface-3 text-fg-subtle'}`}>{a.enabled ? 'شغّالة' : 'متوقفة'}</span>
                </div>
                <p className="text-[11px] text-fg-subtle mt-0.5 line-clamp-2">{a.post_label}</p>
                <a href={a.link_url} target="_blank" rel="noreferrer" className="text-[11px] text-brand hover:underline inline-flex items-center gap-1 mt-0.5 break-all" dir="ltr"><ExternalLink size={11} />{a.link_url}</a>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-3 flex-wrap text-[12px] text-fg-muted">
              <span>طلبات: <b className="text-fg tabular-nums">{a.stats.total}</b></span>
              <span className="text-success">اتبعتلهم: <b className="tabular-nums">{a.stats.sent}</b></span>
              {a.stats.public_only > 0 && <span className="text-amber-500">الرابط علني: <b className="tabular-nums">{a.stats.public_only}</b></span>}
              {a.stats.queued > 0 && <span>مستنية: <b className="tabular-nums">{a.stats.queued}</b></span>}
              {a.stats.skipped > 0 && <span className="text-fg-subtle">متخطّاة: <b className="tabular-nums">{a.stats.skipped}</b></span>}
              {a.stats.failed > 0 && <span className="text-danger">فشلت: <b className="tabular-nums">{a.stats.failed}</b></span>}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              {a.post_permalink && <a href={a.post_permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-brand/10 text-brand hover:bg-brand/20"><ExternalLink size={12} />افتح الفيديو</a>}
              <button disabled={busy === a.id} onClick={() => toggle(a)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-40">{a.enabled ? 'إيقاف' : 'تشغيل'}</button>
              <button disabled={busy === a.id} onClick={() => setEditing({ ...a, public_replies: (a.public_replies || []).join('\n'), extra_keywords: (a.extra_keywords || []).join('، '), fallback_public: a.fallback_public || '' })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-3 text-fg-muted hover:text-fg"><Pencil size={12} />تعديل</button>
              <button disabled={busy === a.id || !a.enabled} onClick={() => backfill(a)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-3 text-fg-muted hover:text-fg disabled:opacity-40"><Play size={12} />طبّق على التعليقات السابقة</button>
              <button disabled={busy === a.id} onClick={() => remove(a)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-3 text-danger ms-auto"><Trash2 size={12} />حذف</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Editor({ toast, call, defaults, initial, onClose, onSaved }) {
  const isEdit = !!initial.id
  const [f, setF] = useState(initial)
  const [posts, setPosts] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testText, setTestText] = useState('')
  const [testRes, setTestRes] = useState(null)
  const set = (patch) => setF(prev => ({ ...prev, ...patch }))

  const loadPosts = useCallback(async (platform) => {
    setPosts(null)
    try { setPosts((await call(`/comments/automations/posts?platform=${platform}`, 'GET')).posts || []) }
    catch (e) { toast.error(e.message); setPosts([]) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!isEdit) loadPosts(f.platform) }, [f.platform]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickPost = (p) => set({ post_id: p.id, post_label: p.label, post_permalink: p.permalink, post_thumbnail: p.thumbnail, name: f.name || p.label.slice(0, 50) })
  const runTest = async () => {
    try { setTestRes((await call('/comments/automations/test', 'POST', { text: testText, extra_keywords: f.extra_keywords })).match) } catch (e) { toast.error(e.message) }
  }
  const save = async () => {
    setSaving(true)
    try {
      const body = { platform: f.platform, post_id: f.post_id, post_label: f.post_label, post_permalink: f.post_permalink, post_thumbnail: f.post_thumbnail, name: f.name, link_url: f.link_url, private_message: f.private_message, public_replies: f.public_replies, fallback_public: f.fallback_public, extra_keywords: f.extra_keywords, enabled: f.enabled }
      if (isEdit) await call(`/comments/automations/${f.id}`, 'PUT', body); else await call('/comments/automations', 'POST', body)
      toast.success('اتحفظت الأتمتة'); onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const firstPublic = String(f.public_replies || '').split('\n').filter(Boolean)[0]
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-3 space-y-3 pb-24">
        <button onClick={onClose} className="inline-flex items-center gap-1 text-xs text-brand hover:underline"><ArrowRight size={13} />رجوع للأتمتات</button>
        <p className="text-sm font-bold text-fg">{isEdit ? 'تعديل الأتمتة' : 'أتمتة جديدة'}</p>

        <div className="bg-surface-2 border border-surface-3 rounded-2xl p-3.5">
          <p className="text-[12px] font-semibold text-fg mb-2">١) الفيديو</p>
          {isEdit ? (
            <div className="flex gap-3 items-center">
              {f.post_thumbnail && <img src={f.post_thumbnail} alt="" className="w-14 h-14 rounded-xl object-cover" />}
              <div className="min-w-0"><p className="text-[11px] text-fg-subtle">{PLATFORM_AR[f.platform]} · الفيديو مابيتغيّرش (اعمل أتمتة جديدة لفيديو تاني)</p><p className="text-[12px] text-fg line-clamp-2">{f.post_label}</p></div>
              {f.post_permalink && <a href={f.post_permalink} target="_blank" rel="noreferrer" className="ms-auto flex-shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-medium bg-brand text-white"><ExternalLink size={12} />افتح الفيديو</a>}
            </div>
          ) : (<>
            <div className="flex gap-1.5 mb-2"><Pill active={f.platform === 'facebook'} onClick={() => set({ platform: 'facebook', post_id: '' })}><Facebook size={12} />فيسبوك</Pill><Pill active={f.platform === 'instagram'} onClick={() => set({ platform: 'instagram', post_id: '' })}><Instagram size={12} />إنستجرام</Pill></div>
            {f.post_id && (
              <div className="flex gap-3 items-center rounded-xl border border-brand/40 bg-brand/5 p-2.5 mb-2">
                {f.post_thumbnail && <img src={f.post_thumbnail} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />}
                <div className="min-w-0 flex-1"><p className="text-[10px] text-brand font-semibold">الفيديو المختار</p><p className="text-[12px] text-fg line-clamp-2">{f.post_label}</p></div>
                {f.post_permalink && <a href={f.post_permalink} target="_blank" rel="noreferrer" className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-medium bg-brand text-white"><ExternalLink size={12} />افتح الفيديو وتأكد</a>}
              </div>
            )}
            {posts === null && spinner}
            {posts && !posts.length && <p className="text-xs text-fg-subtle py-4 text-center">مفيش منشورات اتجابت.</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto">
              {posts?.map(p => (
                <div key={p.id} className="relative">
                {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" title="افتح الفيديو في تاب جديد" onClick={e => e.stopPropagation()} className="absolute top-1.5 end-1.5 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-black/65 text-white hover:bg-black/80"><ExternalLink size={11} />افتح</a>}
                <button disabled={!!p.automation_id} onClick={() => pickPost(p)}
                  className={`w-full text-start rounded-xl border overflow-hidden bg-surface ${f.post_id === p.id ? 'border-brand ring-1 ring-brand' : 'border-surface-3'} ${p.automation_id ? 'opacity-50' : 'hover:border-brand/60'}`}>
                  {p.thumbnail ? <img src={p.thumbnail} alt="" className="w-full h-24 object-cover bg-surface-3" /> : <div className="w-full h-24 bg-surface-3" />}
                  <div className="p-2"><div className="flex items-center gap-1 text-[10px] text-fg-subtle"><span className="px-1.5 rounded-full bg-surface-3">{TYPE_AR[p.type] || p.type}</span>{p.automation_id && <span className="text-success">عليه أتمتة</span>}</div><p className="text-[11px] text-fg mt-1 line-clamp-2">{p.label}</p></div>
                </button>
                </div>
              ))}
            </div>
          </>)}
        </div>

        <div className="bg-surface-2 border border-surface-3 rounded-2xl p-3.5 space-y-3">
          <p className="text-[12px] font-semibold text-fg">٢) الرابط والرسايل</p>
          <label className="block text-[11px] text-fg-muted">اسم الأتمتة<input value={f.name} onChange={e => set({ name: e.target.value })} className={`${field} mt-1`} placeholder="مثلًا: حلقة السكر مع د. فلان" /></label>
          <label className="block text-[11px] text-fg-muted">رابط الحلقة<input dir="ltr" value={f.link_url} onChange={e => set({ link_url: e.target.value })} className={`${field} mt-1`} placeholder="https://youtu.be/…" /></label>
          <label className="block text-[11px] text-fg-muted">الرسالة الخاصة (فيها <b>{'{link}'}</b> مكان الرابط، و<b>{'{ name}'}</b> الاسم الأول)
            <textarea rows={4} value={f.private_message} onChange={e => set({ private_message: e.target.value })} className={`${field} mt-1 resize-none`} /></label>
          <label className="block text-[11px] text-fg-muted">الرد العلني على التعليق (رد في كل سطر — بيتبدّلوا عشان ميتا ماتشوفش نفس الجملة)
            <textarea rows={4} value={f.public_replies} onChange={e => set({ public_replies: e.target.value })} className={`${field} mt-1 resize-none`} /></label>
          <label className="block text-[11px] text-fg-muted">لو الرسالة الخاصة اترفضت (عدّى 7 أيام أو الحساب مقفول) بننشر ده علنيًا
            <textarea rows={2} value={f.fallback_public} onChange={e => set({ fallback_public: e.target.value })} className={`${field} mt-1 resize-none`} /></label>
          <label className="block text-[11px] text-fg-muted">كلمات إضافية بتعتبر طلب لينك (اختياري — بفاصلة)
            <input value={f.extra_keywords} onChange={e => set({ extra_keywords: e.target.value })} className={`${field} mt-1`} placeholder="مثلًا: فين اشوف الدكتور، قناة اليوتيوب" /></label>
          <p className="text-[10px] text-fg-subtle">بيتعرّف تلقائيًا على: «رابط»، «لينك»، «الحلقة كاملة»، «فين الحلقة»، «ابغى الفيديو كامل»، «link»… في التعليقات القصيرة (أقل من 100 حرف).</p>
        </div>

        <div className="bg-surface-2 border border-surface-3 rounded-2xl p-3.5">
          <p className="text-[12px] font-semibold text-fg mb-2">٣) جرّب (من غير ما يتبعت حاجة)</p>
          <div className="flex gap-2"><input value={testText} onChange={e => { setTestText(e.target.value); setTestRes(null) }} onKeyDown={e => { if (e.key === 'Enter') runTest() }} className={field} placeholder="اكتب تعليق: «ممكن لينك الحلقة»" />
            <button onClick={runTest} disabled={!testText.trim()} className="px-3 py-2 rounded-xl text-xs bg-surface-3 text-fg disabled:opacity-40 flex-shrink-0">جرّب</button></div>
          {testRes !== null && <p className={`mt-2 text-[12px] flex items-center gap-1.5 ${testRes ? 'text-success' : 'text-fg-subtle'}`}>{testRes ? <><Check size={13} />هيتعامل كطلب لينك</> : <><X size={13} />مش طلب لينك — هيمشي على الرد العادي</>}</p>}
          <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-xl bg-surface border border-surface-3 p-2.5"><p className="text-[10px] text-fg-subtle mb-1 flex items-center gap-1"><Send size={11} />الرسالة الخاصة (معاينة)</p><p className="text-fg whitespace-pre-wrap">{previewRender(f.private_message, f.link_url)}</p></div>
            <div className="rounded-xl bg-surface border border-surface-3 p-2.5"><p className="text-[10px] text-fg-subtle mb-1">الرد العلني (معاينة)</p><p className="text-fg whitespace-pre-wrap">{previewRender(firstPublic, f.link_url)}</p></div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-fg-muted"><input type="checkbox" checked={f.enabled} onChange={e => set({ enabled: e.target.checked })} />شغّالة أول ما تتحفظ</label>
          <span className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs bg-surface-3 text-fg-muted">إلغاء</button>
          <button onClick={save} disabled={saving || !f.post_id || !f.link_url || !f.name} className="px-5 py-2 rounded-xl text-xs font-medium bg-brand text-white disabled:opacity-40">{saving ? 'جاري الحفظ…' : 'حفظ'}</button>
        </div>
      </div>
    </div>
  )
}
