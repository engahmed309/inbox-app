import { useState } from 'react'
import { EMOJI_CATEGORIES } from '../lib/emojis'

// قائمة إيموجي بسيطة وخفيفة (من غير مكتبة خارجية) — بتفتح فوق الزرار اللي فتحها
export default function EmojiPicker({ onPick }) {
  const [category, setCategory] = useState('frequent')
  const active = EMOJI_CATEGORIES.find(c => c.key === category) || EMOJI_CATEGORIES[0]

  return (
    <div className="absolute bottom-full left-3 right-3 mb-1 bg-surface-2 border border-surface-3 rounded-xl shadow-xl z-50 max-h-64 overflow-hidden flex flex-col">
      <div className="flex gap-1 p-2 border-b border-surface-3 overflow-x-auto scrollbar-hide flex-shrink-0">
        {EMOJI_CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setCategory(c.key)}
            className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors ${category === c.key ? 'bg-brand text-white' : 'bg-surface-3 text-fg-muted hover:text-fg'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1 p-2 overflow-y-auto">
        {active.emojis.map((e, i) => (
          <button key={i} onClick={() => onPick(e)}
            className="text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-3 transition-colors">
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
