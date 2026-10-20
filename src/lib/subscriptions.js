import { supabase } from './supabase'

// مرحلتا «حجز»: اختيار الباقة إجباري قبل ما العميل يتحط فيهم (الداتابيز كمان بترفض لو محصلش — trigger enforce_booking_package)
export const BOOKING_STAGE_NAMES = ['تم الحجز', 'تجديد الاشتراك']
export const isBookingStage = (stage) => !!stage && BOOKING_STAGE_NAMES.includes(String(stage.name || '').trim())

// الموظف لسه مختار باقة للعميل ده من دقايق (من الشريط الجانبي مثلًا)؟ مايتسألش تاني — نفس نافذة الـtrigger (٣٠ دقيقة) بهامش أمان
export async function hasRecentSubscription(contactId, minutes = 25) {
  const since = new Date(Date.now() - minutes * 60000).toISOString()
  const { data } = await supabase.from('contact_subscriptions').select('id, created_at, updated_at').eq('contact_id', contactId)
    .or(`created_at.gt.${since},updated_at.gt.${since}`).limit(1)
  return !!data?.length
}
