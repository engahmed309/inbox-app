// نص الرسالة بيتعرض كنص خام، فأي رابط جواه (رابط دفع، مكتبة حالات، رابط العميل بيبعته) كان
// لازم الموظف ينسخه بإيده ويلزقه في المتصفح. هنا بنقسّم النص لأجزاء ونحوّل الروابط بس لعناصر
// قابلة للضغط — من غير dangerouslySetInnerHTML، فمفيش أي احتمال إن محتوى العميل يتنفّذ كـ HTML
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi

// علامات الترقيم في آخر الجملة مش جزء من الرابط: "شوف الرابط: https://x.com/a." أو "(https://x.com)"
function trimTrailingPunctuation(url) {
  let end = url.length
  while (end > 0 && '.,;:!?'.includes(url[end - 1])) end--
  // قوس قافل بيتشال بس لو مفيش قوس فاتح يقابله جوه الرابط نفسه
  while (end > 0 && url[end - 1] === ')' && (url.slice(0, end).match(/\(/g) || []).length < (url.slice(0, end).match(/\)/g) || []).length) end--
  return url.slice(0, end)
}

export default function LinkifiedText({ text, className = '' }) {
  if (!text) return null
  const parts = String(text).split(URL_RE)
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part // الأجزاء الفردية بس هي اللي الـ regex لقطها كروابط
        const url = trimTrailingPunctuation(part)
        const rest = part.slice(url.length)
        const href = url.startsWith('http') ? url : `https://${url}`
        return (
          <span key={i}>
            {/* dir=ltr عشان الرابط مايتقلبش جوه نص عربي */}
            <a href={href} target="_blank" rel="noopener noreferrer" dir="ltr"
              className="underline underline-offset-2 break-all hover:opacity-80"
              onClick={e => e.stopPropagation()}>{url}</a>
            {rest}
          </span>
        )
      })}
    </span>
  )
}
