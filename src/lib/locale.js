import i18n from '../i18n'

function getLocale() {
  return i18n.language === 'en' ? 'en-US' : 'ar-EG'
}

export function formatDate(date, options) {
  return new Date(date).toLocaleDateString(getLocale(), options)
}

export function formatTime(date, options) {
  return new Date(date).toLocaleTimeString(getLocale(), options)
}

export function formatDateTime(date, options) {
  return new Date(date).toLocaleString(getLocale(), options)
}

export function formatNumber(n) {
  return Number(n).toLocaleString(getLocale())
}
