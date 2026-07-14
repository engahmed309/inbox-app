import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://qqrztdowbtjzjlpfuyig.supabase.co',
  'sb_publishable_1nV_E71tcHwJ2LxtYzwyTg_8OYfRdLV'
)

export const API_URL = 'https://inbox-api.sehawafeya.com'

// معرفات عامة بتاعة تطبيق ميتا (مش سرية) — لازمة لتشغيل SDK بتاع فيسبوك وربط القنوات من جوه التطبيق
export const FB_APP_ID = '1617615039978745'
export const WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = '1009143671730527'
