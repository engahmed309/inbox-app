import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://qqrztdowbtjzjlpfuyig.supabase.co',
  'sb_publishable_1nV_E71tcHwJ2LxtYzwyTg_8OYfRdLV'
)

export const API_URL = 'https://inbox-api.sehawafeya.com'

// نفس شكل fetch() بالظبط، بس بيحط توكن الجلسة الحقيقي (Authorization: Bearer ...) تلقائيًا —
// السيرفر بقى بيتحقق منه على كل route محتاج موظف مسجّل دخول (بدل ما نبعت agent_id في الطلب
// ونثق فيه من غير تحقق). أي نداء لـ API_URL لازم يستخدمها بدل fetch() العادي
export async function apiFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { ...(options.headers || {}) }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  return fetch(url, { ...options, headers })
}

// معرفات عامة بتاعة تطبيق ميتا (مش سرية) — لازمة لتشغيل SDK بتاع فيسبوك وربط القنوات من جوه التطبيق
export const FB_APP_ID = '1617615039978745'
export const WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = '1009143671730527'
export const INSTAGRAM_APP_ID = '990439503869696'
export const FACEBOOK_LOGIN_CONFIG_ID = '1991162734880151'
export const TIKTOK_APP_ID = '7669200649430499345'
// لازم تبقى نفس الصلاحيات بالظبط اللي متوافق عليها للتطبيق عند تيك توك (My Apps > Basic Information >
// TikTok account holder authorization URL) — أي صلاحية زيادة أو ناقصة بتخلي تيك توك يرفض الرابط
export const TIKTOK_SCOPES = 'user.info.basic,user.info.username,user.info.stats,user.info.profile,user.account.type,user.insights,video.list,video.insights,comment.list,comment.list.manage,video.publish,video.upload,biz.spark.auth,discovery.search.words,message.list.read,message.list.send,message.list.manage'
