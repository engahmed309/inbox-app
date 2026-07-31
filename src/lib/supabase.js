import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://qqrztdowbtjzjlpfuyig.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxcnp0ZG93YnRqempscGZ1eWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MjU0NjUsImV4cCI6MjA5OTMwMTQ2NX0.jHjqu-524YhZd_Z9I_Y1HfA_-rxVb7XX2I0Ag_aWOiI'
)

export const API_URL = 'https://inbox-api.sehawafeya.com'

// معرفات عامة بتاعة تطبيق ميتا (مش سرية) — لازمة لتشغيل SDK بتاع فيسبوك وربط القنوات من جوه التطبيق
export const FB_APP_ID = '1617615039978745'
export const WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = '1009143671730527'
export const INSTAGRAM_APP_ID = '990439503869696'
export const FACEBOOK_LOGIN_CONFIG_ID = '1991162734880151'
