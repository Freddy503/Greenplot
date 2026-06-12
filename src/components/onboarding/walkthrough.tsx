'use client'

// First-visit in-app walkthrough — a 5-step guided tour shown once after
// onboarding (flag: greenplot_tour_pending). Bottom-sheet card in the v2
// language; swipe through the surfaces before the garden opens.

import { useState } from 'react'
import { MessageCircle, Sprout, FlaskConical, BookOpen, Bell, type LucideIcon } from 'lucide-react'

const STEPS: Array<{ icon: LucideIcon; label: string; title: string; body: string }> = [
  {
    icon: MessageCircle, label: 'Chat · home base',
    title: 'Everything starts here',
    body: 'Capture thoughts, ask questions, dictate voice memos. Whatever you plant gets enriched, tagged and connected automatically — and the green chips under each reply suggest your next move.',
  },
  {
    icon: Sprout, label: 'Garden',
    title: 'Watch ideas take root',
    body: 'Every thought becomes a seed. The Garden shows them growing — open the knowledge graph to see how your thinking connects, even in ways you didn’t notice.',
  },
  {
    icon: BookOpen, label: 'Library',
    title: 'A wiki that writes itself',
    body: 'Related seeds compile into living articles. Save links and research papers here too — share anything to Greenplot from your phone and it lands as a seed.',
  },
  {
    icon: FlaskConical, label: 'Studio',
    title: 'From idea to buildable spec',
    body: 'Develop an idea into a full PRD with an AI thinking partner that interrogates it properly. Ready specs ship to GitHub — coding agents build them while you think.',
  },
  {
    icon: Bell, label: 'Briefings',
    title: 'The garden comes to you',
    body: 'Morning sparks, research digests and weekly reviews arrive on your rhythm. Tap the bell anytime — and that’s the tour. Plant your first thought!',
  },
]

export function Walkthrough({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const Icon = s.icon
  const last = step === STEPS.length - 1

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 95 }}>
      <div onClick={onDone} style={{ position: 'absolute', inset: 0, background: 'rgba(8,22,14,0.5)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }} />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div className="gp-tour-up" style={{
          pointerEvents: 'auto', width: '100%', maxWidth: 440,
          background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden',
          boxShadow: '0 -18px 60px -12px rgba(8,20,12,0.55)',
        }}>
          {/* Forest header */}
          <div className="hero-forest" style={{ borderRadius: '26px 26px 0 0', padding: '14px 20px 18px', position: 'relative' }}>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ width: 36, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.28)', margin: '0 auto 16px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="glass-dark" style={{ width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={21} color="rgba(180,240,205,0.95)" strokeWidth={1.75} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="caps" style={{ fontSize: 10, color: 'rgba(180,240,205,0.85)' }}>{s.label}</span>
                  <h2 className="serif" style={{ fontSize: 23, lineHeight: 1.12, color: '#fff', letterSpacing: '-0.01em', marginTop: 3 }}>{s.title}</h2>
                </div>
                <button onClick={onDone} className="tap ui" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, fontSize: 11.5, fontWeight: 600, color: 'rgba(233,250,239,0.55)', flexShrink: 0 }}>
                  Skip
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '18px 22px calc(20px + env(safe-area-inset-bottom))' }}>
            <p className="body-text" style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)', margin: '0 0 18px', minHeight: 70 }}>
              {s.body}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Dots */}
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                {STEPS.map((_, i) => (
                  <button key={i} onClick={() => setStep(i)} aria-label={`Step ${i + 1}`} className="tap"
                    style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 99, border: 'none', padding: 0, cursor: 'pointer', background: i === step ? 'var(--green)' : 'var(--border-2)', transition: 'all .25s' }} />
                ))}
              </div>

              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="tap ui"
                  style={{ height: 44, padding: '0 16px', borderRadius: 9999, background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Back
                </button>
              )}
              <button onClick={() => last ? onDone() : setStep(step + 1)} className="tap ui"
                style={{ height: 44, padding: '0 22px', borderRadius: 9999, border: 'none', background: 'var(--green)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px -8px rgba(34,197,94,0.7)' }}>
                {last ? 'Start planting' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gpTourUp { from { transform: translateY(60%); opacity: 0.4; } to { transform: translateY(0); opacity: 1; } }
        .gp-tour-up { animation: gpTourUp .4s cubic-bezier(.16,1,.3,1) both; }
      ` }} />
    </div>
  )
}
