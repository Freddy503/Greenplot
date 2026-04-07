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
      // Store url, prompt, and full briefing structure for click handler
      data: {
        url: data.url || '/chat',
        prompt: data.prompt || '',
        briefing: data.briefing ? JSON.stringify(data.briefing) : '',
      },
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
        data: { url: '/chat', prompt: '', briefing: '' },
      })
    )
  }
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const prompt = typeof data === 'object' ? (data.prompt || '') : ''
  const briefingStr = typeof data === 'object' ? (data.briefing || '') : ''
  const baseUrl = typeof data === 'object' ? (data.url || '/chat') : (data || '/chat')

  const title = event.notification.title || ''
  const body = event.notification.body || ''

  // Parse briefing if available
  let briefing = null
  if (briefingStr) {
    try {
      briefing = JSON.parse(briefingStr)
    } catch (e) {
      console.error('Failed to parse briefing:', e)
    }
  }

  // Build message to send to chat page
  const postMessage = briefing
    ? { type: 'PUSH_SPARK', briefing, title, body, prompt }
    : { type: 'PUSH_SPARK', prompt, title, body }

  // Fallback URL with encoded params (for new window case)
  const targetUrl = prompt
    ? `/chat?spark_prompt=${encodeURIComponent(prompt)}&spark_title=${encodeURIComponent(title)}&spark_body=${encodeURIComponent(body)}`
    : baseUrl

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if already open on /chat
      for (const client of clientList) {
        if (client.url.includes('/chat') && 'focus' in client) {
          client.focus()
          // Send spark data via postMessage so the page shows the SparkCard
          if (prompt || body || briefing) {
            client.postMessage(postMessage)
          }
          return
        }
      }
      // Open new window navigating to /chat with spark params
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
