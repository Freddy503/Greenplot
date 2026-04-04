'use client'

import { useCallback, useEffect, useState } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || 'BMvL3eG7pJjdT4AEXd6Ky_u8DCwYchD523OhkXXPXq5O6lSxCAK4I9Gj4xPjnEPU0w-q5mQlqXJRYs2yJXsuw_c'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export type PushStatus = 'unsupported' | 'denied' | 'default' | 'granted' | 'subscribed' | 'error'

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('default')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)

  // Check current status on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }

    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }

    // Check for existing subscription
    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        setSubscription(existing)
        setStatus('subscribed')
      } else if (Notification.permission === 'granted') {
        setStatus('granted')
      }
    })
  }, [])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (status === 'unsupported') return false

    try {
      // Register service worker (idempotent — skips if already registered)
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.register('/sw.js') : null
      if (!registration) {
        setStatus('unsupported')
        return false
      }

      // Wait for SW to be ready
      const reg = await navigator.serviceWorker.ready

      // Check if already subscribed on this device
      const existingSub = await reg.pushManager.getSubscription()
      if (existingSub) {
        setSubscription(existingSub)
        setStatus('subscribed')
        return true
      }

      // Check if permission already denied
      if (Notification.permission === 'denied') {
        setStatus('denied')
        return false
      }

      // Request notification permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission as PushStatus)
        return false
      }

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })

      setSubscription(sub)
      setStatus('subscribed')

      // Send subscription to server
      const userId = localStorage.getItem('greenplot_token') || 'default'
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), userId }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        console.error('[push] Server rejected subscription:', errData)
        return false
      }

      console.log('[push] Successfully subscribed for push notifications')
      return true
    } catch (err: any) {
      const msg = err?.message || 'Unknown error'
      console.error('[push] Failed:', msg, err)

      // Specific error handling
      if (msg.includes('permission')) {
        setStatus('denied')
      } else if (msg.includes('subscribe')) {
        setStatus('error')
      }

      return false
    }
  }, [status])

  return { status, subscription, requestPermission }
}

// Poll for queued notifications (called from service worker or app)
export async function pollNotifications() {
  try {
    const res = await fetch('/api/push/notifications')
    const data = await res.json()
    const notifications = data.notifications || []

    for (const notif of notifications) {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notif.title, {
          body: notif.body,
          icon: '/icon-192.png',
          data: notif.url,
        })
      }
    }
  } catch {}
}
