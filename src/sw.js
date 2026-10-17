import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)

// ملحوظة مهمة: كان هنا كاش (NetworkFirst بمهلة ٣ ثواني) على كل طلبات Supabase، يعني أي استعلام GET (رسايل،
// محادثات، عدّادات) اتأخر أكتر من ٣ ثواني كان بيرجع لنسخة قديمة محفوظة (لحد ٥ دقايق) بدل الرد الحي. ده كان سبب
// "الرسالة بتوصل برا لكن مبتظهرش وأنا جوه المحادثة غير لما أخرج وأرجع" وتأخر القوائم. صندوق وارد لحظي مايصحش
// يتكاشى. وكمان كان بيحتفظ ببيانات مرضى في تخزين المتصفح حتى بعد تسجيل الخروج. اتشال، والطلبات بتروح للشبكة مباشرة.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // مسح الكاش القديم اللي كان بيحتوي نسخ قديمة من ردود Supabase على أجهزة الموظفين
    await caches.delete('supabase-cache').catch(() => {})
    await self.clients.claim()
  })())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Bridge', body: event.data.text() }
  }

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const hasFocusedClient = clientsList.some((client) => client.focused)
      if (hasFocusedClient) return

      await self.registration.showNotification(payload.title || 'Bridge', {
        body: payload.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        silent: !!payload.silent,
        tag: payload.tag || undefined,
        // مكالمة بترن مش إشعار عادي: لازم تفضل على الشاشة لحد ما حد يدوس، وتهتز.
        // الإشعار اللي بيختفي لوحده بعد ثانيتين معناه مكالمة ضايعة
        requireInteraction: !!payload.requireInteraction,
        renotify: !!payload.tag && !!payload.requireInteraction,
        vibrate: payload.vibrate || undefined,
        data: { url: payload.data?.url || payload.url || '/' }
      })
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientsList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) client.navigate(targetUrl)
          return
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })()
  )
})
