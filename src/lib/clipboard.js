// نسخ نص للكليببورد. navigator.clipboard بيترفض في حالات كتير على الموبايل (متصفحات جوه
// تطبيقات زي فيسبوك/واتساب، WebView، صفحة مش في الفوكس، صلاحية ممنوعة...) — فبنرجع للطريقة
// القديمة (textarea مخفي + execCommand) اللي بتشتغل في أغلب الحالات دي. بترجع true لو النسخ نجح
export async function copyText(text) {
  const value = String(text ?? '')
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch { /* نجرب الطريقة القديمة تحت */ }

  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
