import { supabase, API_URL, apiFetch } from './supabase'

// بيانات بتتغير نادرًا (مراحل الـlifecycle، القنوات، التاجات، الحقول المخصصة، الردود السريعة) بتتجاب مرة وتتشارك بين كل الشاشات.
// قبل كده كل شاشة (وكل فتح محادثة، وكل دقيقتين في قائمة المحادثات) كانت بتطلبها تاني من الداتابيز — جزء من حمل يوم ١٩ أكتوبر.
// بتتجدد لوحدها بعد ١٠ دقايق، وفورًا لما الأدمن يخرج من الإعدادات (اللي بيتعدل فيها كل ده) أو يعمل تحديث للصفحة
const TTL_MS = 10 * 60 * 1000
const cache = new Map()   // key → { value, at } أو { promise }

function cached(key, loader) {
  const e = cache.get(key)
  if (e?.promise) return e.promise
  if (e && Date.now() - e.at < TTL_MS) return Promise.resolve(e.value)
  const promise = loader()
    .then(value => { cache.set(key, { value, at: Date.now() }); return value })
    .catch(err => { cache.delete(key); throw err })
  cache.set(key, { promise })
  return promise
}

export function invalidateStaticData(key) {
  if (key) cache.delete(key)
  else cache.clear()
}

const table = (name, order) => async () => {
  const { data, error } = await supabase.from(name).select('*').order(order)
  if (error) throw error
  return data || []
}

export const getLifecycleStages = () => cached('lifecycle_stages', table('lifecycle_stages', 'stage_order'))
export const getTags = () => cached('tags', table('tags', 'name'))
export const getCustomFieldDefinitions = () => cached('custom_field_definitions', table('custom_field_definitions', 'field_order'))
export const getQuickReplies = () => cached('quick_replies', table('quick_replies', 'name'))
export const getPackages = () => cached('contact_packages', table('contact_packages', 'sort_order'))
export const getChannels = () => cached('channels', async () => {
  const res = await apiFetch(`${API_URL}/channels`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'channels')
  return data.channels || []
})
