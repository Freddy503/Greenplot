'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

export function CalendarConnectCard() {
  const [connected, setConnected] = useState(false)
  const [timezone, setTimezone] = useState('')
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  const authToken = typeof window !== 'undefined'
    ? localStorage.getItem('greenplot_token') || ''
    : ''

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/status', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      })
      const data = await res.json()
      setConnected(data.connected)
      setTimezone(data.timezone || '')
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => {
    checkStatus()

    // Check for callback params
    const params = new URLSearchParams(window.location.search)
    if (params.get('calendar_connected') === 'true') {
      toast.success('Google Calendar connected! 📅')
      checkStatus()
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('calendar_error')) {
      toast.error(`Calendar connection failed: ${params.get('calendar_error')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [checkStatus])

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/calendar/auth', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error('Calendar not configured')
      }
    } catch {
      toast.error('Failed to start calendar connection')
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch('/api/calendar/disconnect', {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      })
      setConnected(false)
      setTimezone('')
      toast.success('Calendar disconnected')
    } catch {
      toast.error('Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full rounded-2xl p-5 bg-surface-container border border-outline-variant/10 animate-pulse">
        <div className="h-5 w-32 bg-surface-container-high rounded mb-2" />
        <div className="h-3 w-48 bg-surface-container-high rounded" />
      </div>
    )
  }

  return (
    <div className="w-full rounded-2xl p-5 bg-surface-container border border-outline-variant/10">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-500/10">
          <span className="material-symbols-outlined text-blue-400" style={{ fontVariationSettings: '"FILL" 1' }}>
            event
          </span>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-on-surface">Google Calendar</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {connected
              ? `Connected${timezone ? ` (${timezone})` : ''}. Cron jobs sync with your free time.`
              : 'Connect your calendar for smart scheduling and context-aware insights.'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {connected ? (
          <>
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Connected
            </div>
            <div className="flex-1" />
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 rounded-full text-xs font-semibold text-error/80 hover:text-error hover:bg-error/5 transition-all"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </>
        ) : (
          <button
            onClick={handleConnect}
            className="w-full py-3 rounded-full text-sm font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all active:scale-[0.98]"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.5 22H4.5C3.12 22 2 20.88 2 19.5V4.5C2 3.12 3.12 2 4.5 2H19.5C20.88 2 22 3.12 22 4.5V19.5C22 20.88 20.88 22 19.5 22ZM4.5 3.5V19.5H19.5V3.5H4.5ZM12 7C12.83 7 13.5 7.67 13.5 8.5C13.5 9.33 12.83 10 12 10C11.17 10 10.5 9.33 10.5 8.5C10.5 7.67 11.17 7 12 7ZM7 7C7.83 7 8.5 7.67 8.5 8.5C8.5 9.33 7.83 10 7 10C6.17 10 5.5 9.33 5.5 8.5C5.5 7.67 6.17 7 7 7ZM17 7C17.83 7 18.5 7.67 18.5 8.5C18.5 9.33 17.83 10 17 10C16.17 10 15.5 9.33 15.5 8.5C15.5 7.67 16.17 7 17 7Z" />
              </svg>
              Connect Google Calendar
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
