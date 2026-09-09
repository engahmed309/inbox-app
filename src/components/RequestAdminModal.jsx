import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, API_URL } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { X, Paperclip } from 'lucide-react'

// موظف مش أدمن مش يقدر يضيف تاج/مرحلة/رد سريع مباشرة — بيبعت طلب هنا، وبيوصل لكل الأدمنز في
// جرس الإشعارات، ولو حد منهم وافق بيتضاف العنصر على طول من غير ما الموظف يحتاج يعمل حاجة تانية
export default function RequestAdminModal({ type, onClose }) {
  const { t } = useTranslation()
  const TITLES = { tag: t('requestAdminModal.titles.tag'), lifecycle: t('requestAdminModal.titles.lifecycle'), quick_reply: t('requestAdminModal.titles.quickReply') }
  const NAME_LABELS = { tag: t('requestAdminModal.nameLabels.tag'), lifecycle: t('requestAdminModal.nameLabels.lifecycle'), quick_reply: t('requestAdminModal.nameLabels.quickReply') }
  const { agent } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [color, setColor] = useState(type === 'lifecycle' ? '#3B82F6' : '#6366F1')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const fileType = (f) => f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : 'file'

  const submit = async () => {
    if (!name.trim()) { toast.error(t('requestAdminModal.nameRequired')); return }
    setSaving(true)
    try {
      const payload = { name: name.trim() }
      if (type === 'tag' || type === 'lifecycle') payload.color = color
      if (type === 'quick_reply') {
        payload.text = text.trim() || null
        if (file) {
          const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
          const path = `quick-replies/${Date.now()}_${safeName}`
          const { error } = await supabase.storage.from('inbox-media').upload(path, file)
          if (error) throw error
          const { data: urlData } = supabase.storage.from('inbox-media').getPublicUrl(path)
          payload.file_url = urlData.publicUrl
          payload.file_type = fileType(file)
        }
      }
      const res = await fetch(`${API_URL}/agent-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent?.id, type, payload })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('requestAdminModal.sendFailed'))
      toast.success(t('requestAdminModal.sentSuccess'))
      onClose()
    } catch (err) {
      toast.error(t('settings.common.errorWithMessage', { message: err.message }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-sm bg-surface-2 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-3">
          <span className="font-semibold text-fg text-sm">{TITLES[type]}</span>
          <button onClick={onClose} className="text-fg-muted hover:text-fg"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-fg-muted mb-1">{NAME_LABELS[type]}</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>

          {(type === 'tag' || type === 'lifecycle') && (
            <div>
              <label className="block text-xs text-fg-muted mb-1">{t('settings.common.colorLabel')}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="w-10 h-10 rounded-lg bg-surface-3 border border-surface-3 cursor-pointer" />
                <span className="text-sm text-fg-muted">{color}</span>
              </div>
            </div>
          )}

          {type === 'quick_reply' && (
            <>
              <div>
                <label className="block text-xs text-fg-muted mb-1">{t('requestAdminModal.textLabel')}</label>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
                  className="w-full bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
              </div>
              <div>
                <label className="block text-xs text-fg-muted mb-1">{t('requestAdminModal.fileLabel')}</label>
                <label className="flex items-center gap-2 bg-surface-3 rounded-xl px-3 py-2.5 text-sm text-fg-muted cursor-pointer hover:text-fg">
                  <Paperclip size={14} />
                  {file ? file.name : t('requestAdminModal.chooseFile')}
                  <input type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                    onChange={e => setFile(e.target.files[0] || null)} />
                </label>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-surface-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-3 text-fg-muted hover:text-fg transition-colors disabled:opacity-50">
            {t('settings.common.cancel')}
          </button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('requestAdminModal.sendButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
