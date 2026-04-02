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
      data: data.url || '/',
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
      })
    )
  }
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})
