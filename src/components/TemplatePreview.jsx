import { useTranslation } from 'react-i18next'

// معاينة شكل القالب في واتساب — مكوّن بحت من غير أي fetch، مستخدم في إنشاء/تعديل القوالب
// (الإعدادات) وفي معاينة قالب جاهز قبل إرسال جماعي (Broadcast)
export default function TemplatePreview({ header, body, footer, buttons }) {
  const { t } = useTranslation()
  const empty = !body?.trim() && !header?.text?.trim() && !footer?.trim() && !buttons?.length
  if (empty) {
    return <p className="text-[11px] text-fg-subtle bg-surface-3/50 rounded-xl px-3 py-3 text-center">{t('settings.templates.preview.emptyHint')}</p>
  }
  return (
    <div className="bg-[#0b141a] rounded-xl p-3">
      <div className="bg-[#005c4b] rounded-lg rounded-se-none px-2.5 py-2 max-w-[85%] shadow">
        {header?.enabled && header.format === 'TEXT' && header.text && (
          <p className="text-[13px] font-bold text-white mb-1 whitespace-pre-wrap break-words">{header.text}</p>
        )}
        {header?.enabled && header.format === 'LOCATION' && (
          <div className="bg-black/20 rounded-md px-2 py-3 mb-1 text-center text-[11px] text-white/70">📍 {t('settings.templates.mediaType.location')}</div>
        )}
        {header?.enabled && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format) && (
          <div className="bg-black/20 rounded-md px-2 py-5 mb-1 text-center text-[11px] text-white/70">
            {header.format === 'IMAGE' ? `🖼️ ${t('settings.templates.mediaType.image')}` : header.format === 'VIDEO' ? `🎥 ${t('settings.templates.mediaType.video')}` : `📎 ${t('settings.templates.mediaType.document')}`}
          </div>
        )}
        {body && <p className="text-[13px] text-white whitespace-pre-wrap break-words leading-relaxed">{body}</p>}
        {footer && <p className="text-[11px] text-white/60 mt-1.5 whitespace-pre-wrap break-words">{footer}</p>}
        <p className="text-[10px] text-white/50 text-end mt-1">{t('settings.templates.preview.mockTime')} ✓✓</p>
      </div>
      {buttons?.filter(b => b.text?.trim()).length > 0 && (
        <div className="mt-1 space-y-1 max-w-[85%]">
          {buttons.filter(b => b.text?.trim()).map((b, i) => (
            <div key={i} className="bg-[#1f2c33] rounded-lg py-1.5 text-center text-[12px] text-[#53bdeb]">
              {b.type === 'URL' ? '🔗 ' : b.type === 'PHONE_NUMBER' ? '📞 ' : ''}{b.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
