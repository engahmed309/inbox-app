import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://qqrztdowbtjzjlpfuyig.supabase.co',
  'sb_publishable_1nV_E71tcHwJ2LxtYzwyTg_8OYfRdLV'
)

export const API_URL = 'https://inbox-api.sehawafeya.com'
