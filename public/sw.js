// Service Worker for Greenplot PWA Push Notifications
const CACHE_NAME = 'greenplot-v1'

// Install
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const title = data.title || 'Greenplot'
    const options = {
      body: data.body || 'You have a new notification',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Store both url and prompt so the click handler can open /chat?prompt=...
      data: { url: data.url || '/chat', prompt: data.prompt || '' },
      actions: data.actions || [],
      tag: data.tag || 'greenplot-notification',
      renotify: true,
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch {
    // Fallback for non-JSON data
    event.waitUntil(
      self.registration.showNotification('Greenplot', {
        body: event.data.text(),
        icon: '/icon-192.png',
        data: { url: '/chat', prompt: '' },
      })
    )
  }
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const prompt = typeof data === 'object' ? (data.prompt || '') : ''
  const baseUrl = typeof data === 'object' ? (data.url || '/chat') : (data || '/chat')

  // If a structured prompt is attached, open /chat?prompt=<encoded>
  const targetUrl = prompt
    ? `/chat?prompt=${encodeURIComponent(prompt)}`
    : baseUrl

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if already open on /chat
      for (const client of clientList) {
        if (client.url.includes('/chat') && 'focus' in client) {
          client.focus()
          // Navigate to the prompt URL if we have one
          if (prompt && 'navigate' in client) {
            return client.navigate(targetUrl)
          }
          return client.focus()
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
