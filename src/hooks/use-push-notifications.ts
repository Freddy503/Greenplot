'use client'

import { useCallback, useEffect, useState } from 'react'

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

export type PushStatus = 'unsupported' | 'denied' | 'error' | 'default' | 'granted' | 'subscribed' | 'not-installed'

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('default')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)

  // Detect iOS Safari (not home screen installed)
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )

  // Check current status on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }

    // Safari iOS: check if app is installed to home screen
    if (isIOS && !isStandalone) {
      setStatus('not-installed')
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
        // Re-register with server in case push_notifications.json was cleared
        const token = localStorage.getItem('greenplot_token') || ''
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ subscription: existing.toJSON(), userId: token || 'default' }),
        }).catch(() => {/* silent — server may be unreachable */})
      } else if (Notification.permission === 'granted') {
        setStatus('granted')
      }
    })
  }, [isIOS, isStandalone])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (status === 'unsupported') return false

    // Safari iOS: must be installed to home screen first
    if (status === 'not-installed') return false

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

      const keyRes = await fetch('/api/push/subscribe')
      if (!keyRes.ok) {
        setStatus('error')
        return false
      }
      const { publicKey } = await keyRes.json()
      if (!publicKey || typeof publicKey !== 'string') {
        setStatus('error')
        return false
      }

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })

      setSubscription(sub)
      setStatus('subscribed')

      // Send subscription to server
      const token = localStorage.getItem('greenplot_token') || ''
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subscription: sub.toJSON(), userId: token || 'default' }),
      })

      if (!res.ok) {
        console.error('[push] Server rejected subscription:', res.status)
        return false
      }

      console.log('[push] Successfully subscribed for push notifications')
      return true
    } catch (err: any) {
      const msg = err?.message || String(err)
      console.error('[push] Failed:', msg)

      // iOS Safari gives a very specific error for non-home-screen installs
      if (msg.includes('NotAllowedError') || msg.includes('not allowed')) {
        setStatus('not-installed')
      } else if (msg.includes('permission') || msg.includes('denied')) {
        setStatus('denied')
      } else {
        setStatus('error')
      }

      return false
    }
  }, [status])

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
      }
      setSubscription(null)
      setStatus('default')
      return true
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err)
      return false
    }
  }, [])

  return { status, subscription, requestPermission, unsubscribe, isIOS, isStandalone }
}

// Poll for queued notifications (called from service worker or app)
export async function pollNotifications(onBriefing?: (briefing: any) => void) {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
    const res = await fetch('/api/push/notifications', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const data = await res.json()
    const notifications = data.notifications || []

    for (const notif of notifications) {
      if (notif.briefing && onBriefing) {
        // Full briefing — show SparkCard
        const briefing = typeof notif.briefing === 'string' ? JSON.parse(notif.briefing) : notif.briefing
        onBriefing({
          type: briefing.type || 'daily_briefing',
          title: notif.title || briefing.title || 'Briefing',
          subtitle: briefing.subtitle,
          sections: briefing.sections || [],
          prompt: briefing.prompt,
        })
      } else if (!notif.briefing && 'Notification' in window && Notification.permission === 'granted') {
        // Plain notification (no briefing) — show OS banner as fallback
        new Notification(notif.title, {
          body: notif.body,
          icon: '/icon-192.png',
          data: notif.url,
        })
      }
      // briefing exists but no callback: skip silently (Web Push already delivered it)
    }
  } catch (err) {
    console.error('[pollNotifications]', err)
  }
}
