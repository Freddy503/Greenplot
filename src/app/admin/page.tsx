'use client'

// Operator dashboard — users, activity, LLM token spend. Backend gates on
// ADMIN_EMAILS (non-admins get a 404), so this page is safe to ship publicly.

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { Users, Sprout, FileText, Cpu } from 'lucide-react'

interface AdminUser {
  email: string
  nickname: string
  created_at: string | null
  seeds: number
  last_seed_at: string | null
  tokens_30d: number
}

interface AdminStats {
  users: AdminUser[]
  user_count: number
  seed_count: number
  spec_count: number
  tokens_30d: number
  tokens_by_day: Array<{ date: string; tokens: number }>
  chat_model: string
  daily_token_limit: number
  waitlist?: Array<{ email: string; joined_at: string | null; invited_at: string | null }>
  waitlist_count?: number
}

// Rough blended $/M tokens for the configured chat model — an estimate for
// trend-watching, not accounting. Adjust as pricing changes.
const EST_USD_PER_MTOK = 0.6

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; label: string; value: string; sub?: string }) {
  return (
    <div className="v2-card" style={{ borderRadius: 18, padding: '14px 16px', flex: 1, minWidth: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color="var(--green-700)" strokeWidth={1.75} />
        </span>
        <span className="caps" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>{label}</span>
      </div>
      <div className="serif" style={{ fontSize: 30, lineHeight: 1, color: 'var(--ink)' }}>{value}</div>
      {sub && <div className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    const token = localStorage.getItem('greenplot_token') || ''
    fetch('/api/admin/stats', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (r) => {
        if (!r.ok) { setState('denied'); return }
        setStats(await r.json())
        setState('ok')
      })
      .catch(() => setState('denied'))
  }, [])

  if (state === 'loading') {
    return <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="body-text" style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</span>
    </div>
  }
  if (state === 'denied' || !stats) {
    return <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="body-text" style={{ color: 'var(--ink-3)', fontSize: 13 }}>Nothing here.</span>
    </div>
  }

  const estCost = (stats.tokens_30d / 1_000_000) * EST_USD_PER_MTOK
  const maxDay = Math.max(1, ...stats.tokens_by_day.map(d => d.tokens))

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <div className="hero-forest" style={{ borderRadius: '0 0 28px 28px', paddingTop: 'calc(env(safe-area-inset-top) + 44px)', paddingBottom: 22 }}>
        <div style={{ position: 'relative', zIndex: 2, padding: '0 18px', maxWidth: 920, margin: '0 auto' }}>
          <div className="caps" style={{ fontSize: 10.5, color: 'rgba(180,240,205,0.82)', marginBottom: 10 }}>Operator</div>
          <h1 className="serif" style={{ fontSize: 30, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.02em' }}>Greenplot dashboard</h1>
          <p className="body-text" style={{ fontSize: 12.5, color: 'rgba(233,250,239,0.6)', marginTop: 6 }}>
            {stats.chat_model} · daily cap {fmt(stats.daily_token_limit)} tokens/user
          </p>
        </div>
      </div>

      <div style={{ padding: '18px 18px 80px', maxWidth: 920, margin: '0 auto' }}>
        {/* Stat cards */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
          <StatCard icon={Users} label="Users" value={String(stats.user_count)} />
          <StatCard icon={Sprout} label="Seeds" value={fmt(stats.seed_count)} />
          <StatCard icon={FileText} label="Specs" value={String(stats.spec_count)} />
          <StatCard icon={Cpu} label="Tokens · 30d" value={fmt(stats.tokens_30d)} sub={`≈ $${estCost.toFixed(2)} est.`} />
        </div>

        {/* Tokens per day */}
        <div className="caps" style={{ fontSize: 10, color: 'var(--ink-3)', margin: '0 2px 8px' }}>LLM tokens · last 30 days</div>
        <div className="v2-card" style={{ borderRadius: 18, padding: '16px 16px 12px', marginBottom: 22 }}>
          {stats.tokens_by_day.length === 0 ? (
            <p className="body-text" style={{ fontSize: 12, color: 'var(--ink-3)' }}>No usage recorded yet.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
              {stats.tokens_by_day.map(d => (
                <div key={d.date} title={`${d.date}: ${d.tokens.toLocaleString()} tokens`}
                  style={{ flex: 1, minWidth: 3, height: `${Math.max(4, (d.tokens / maxDay) * 100)}%`, borderRadius: 3, background: 'var(--green)', opacity: 0.35 + 0.65 * (d.tokens / maxDay) }} />
              ))}
            </div>
          )}
        </div>

        {/* Users table */}
        <div className="caps" style={{ fontSize: 10, color: 'var(--ink-3)', margin: '0 2px 8px' }}>Users</div>
        <div className="v2-card" style={{ borderRadius: 18, overflow: 'hidden', padding: 0 }}>
          {stats.users.map((u, i) => (
            <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderBottom: i === stats.users.length - 1 ? 'none' : '1px solid var(--hairline)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ui" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.nickname || u.email.split('@')[0]}
                  <span className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400, marginLeft: 7 }}>{u.email}</span>
                </div>
                <div className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>
                  joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  {u.last_seed_at && <> · last seed {new Date(u.last_seed_at).toLocaleDateString()}</>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="ui" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--green-700)' }}>{u.seeds} seeds</div>
                <div className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{fmt(u.tokens_30d)} tok/30d</div>
              </div>
            </div>
          ))}
        </div>

        {/* Waitlist */}
        <div className="caps" style={{ fontSize: 10, color: 'var(--ink-3)', margin: '22px 2px 8px' }}>
          Waitlist{typeof stats.waitlist_count === 'number' ? ` · ${stats.waitlist_count}` : ''}
        </div>
        <div className="v2-card" style={{ borderRadius: 18, overflow: 'hidden', padding: 0 }}>
          {(!stats.waitlist || stats.waitlist.length === 0) && (
            <p className="body-text" style={{ padding: '14px 15px', fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
              No waitlist entries yet. (Signups before the Postgres fix live in your Gmail
              notifications &amp; the Resend sent-mail log.)
            </p>
          )}
          {(stats.waitlist || []).map((w, i) => (
            <div key={w.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 15px', borderBottom: i === (stats.waitlist!.length - 1) ? 'none' : '1px solid var(--hairline)' }}>
              <span className="ui" style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.email}</span>
              <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)', flexShrink: 0 }}>
                {w.joined_at ? new Date(w.joined_at).toLocaleDateString() : '—'}
              </span>
              {w.invited_at ? (
                <span className="caps" style={{ fontSize: 8.5, color: 'var(--green-700)', background: 'var(--green-tint)', borderRadius: 99, padding: '3px 8px', flexShrink: 0 }}>invited</span>
              ) : (
                <span className="caps" style={{ fontSize: 8.5, color: 'var(--ink-3)', background: 'var(--surface-sunk)', borderRadius: 99, padding: '3px 8px', flexShrink: 0 }}>waiting</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
