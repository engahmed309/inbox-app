// "شاشة بيضا" غالبًا معناها إن التطبيق المخزّن عند الموظف (service worker + كاش) لسه بيشاور على ملفات
// نسخة قديمة اتشالت من السيرفر بعد تحديث جديد. العلاج: نفك تسجيل الـ service worker ونمسح كل الكاش
// ونعمل ريلود — الجلسة (تسجيل الدخول) في localStorage فمش بتتأثر. الحارس بيمنع لفّة ريلود لا نهائية
// لو المشكلة مش في الكاش أصلاً: مرة واحدة كل دقيقة بالكتير
export async function recoverApp({ force = false } = {}) {
  try {
    const last = Number(sessionStorage.getItem('inbox_recover_at') || 0)
    if (!force && Date.now() - last < 60000) return false
    sessionStorage.setItem('inbox_recover_at', String(Date.now()))
  } catch { /* مش مشكلة */ }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((regs || []).map(r => r.unregister()))
  } catch { /* مش مشكلة */ }
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
  } catch { /* مش مشكلة */ }
  window.location.reload()
  return true
}
