'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'

// ── Types ─────────────────────────────────────────────

interface OnboardingProfile {
  nickname: string
  city: string
  interests: string[]
  digestFrequency: 'twice-daily' | 'once-daily' | 'bi-weekly' | 'weekly' | 'calendar'
  onboardedAt: string
}

// ── Constants ─────────────────────────────────────────

const INTEREST_OPTIONS = [
  'Technology',
  'Business',
  'Entrepreneurship',
  'AI',
  'Design',
  'Productivity',
  'Learning',
  'Creativity',
]

const DIGEST_OPTIONS: { label: string; sublabel: string; value: OnboardingProfile['digestFrequency'] }[] = [
  { label: 'Twice a day', sublabel: 'Morning & evening cycles', value: 'twice-daily' },
  { label: 'Once a day', sublabel: 'Standard growth pattern', value: 'once-daily' },
  { label: 'Bi-Weekly', sublabel: 'Mid-week and weekend updates', value: 'bi-weekly' },
  { label: 'Weekly', sublabel: 'Batch collection every Sunday', value: 'weekly' },
  { label: 'Based on Calendar', sublabel: 'Smart Scheduling', value: 'calendar' },
]

const TOTAL_STEPS = 5

// ── Progress Bar (Stitch: thin green gradient line, centered, rounded-full) ──

function ProgressBar({ step }: { step: number }) {
  const pct = ((step + 1) / TOTAL_STEPS) * 100
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-8">
      <div
        className="h-1 w-48 rounded-full overflow-hidden"
        style={{ background: 'rgba(16,185,129,0.15)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, #10B981, rgba(16,185,129,0.0))',
          }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}

// ── Step Wrapper ──────────────────────────────────────

function StepShell({ children, step }: { children: React.ReactNode; step: number }) {
  return (
    <motion.div
      key={step}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full flex flex-col items-center"
    >
      {children}
    </motion.div>
  )
}

// ── Step Label ────────────────────────────────────────

function StepLabel({ step }: { step: number }) {
  return (
    <p
      className="text-xs tracking-wide mb-8 font-medium"
      style={{ color: '#9fb8aa', opacity: 0.6 }}
    >
      Step {step + 1}/{TOTAL_STEPS}
    </p>
  )
}

// ── Amber CTA Button (Stitch: bg-tertiary, rounded-full) ──

function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full py-5 px-10 rounded-full font-bold text-lg transition-all active:scale-[0.97] disabled:opacity-40"
      style={{
        background: '#ffb84d',
        color: '#482a00',
        boxShadow: '0 8px 32px rgba(255,184,77,0.20)',
      }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span
            className="w-4 h-4 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: '#482a00' }}
          />
          Setting up your garden…
        </span>
      ) : (
        children
      )}
    </button>
  )
}

// ── Pill Input ────────────────────────────────────────

function StyledInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoFocus?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full px-5 py-4 rounded-full text-base outline-none transition-all font-medium placeholder:opacity-40"
      style={{
        background: '#2e312e',
        color: '#e1e3df',
      }}
    />
  )
}

// ── STEP 0: Welcome ───────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <StepShell step={0}>
      {/* Decorative bg blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute rounded-full"
          style={{
            width: 300,
            height: 300,
            background: '#10B981',
            opacity: 0.05,
            top: '-5%',
            left: '-10%',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 200,
            height: 200,
            background: '#ffb84d',
            opacity: 0.04,
            bottom: '15%',
            right: '-8%',
            filter: 'blur(60px)',
          }}
        />
      </div>

      <StepLabel step={0} />

      {/* Seed motif — tall pill container (Stitch: w-64 h-80 rounded-full) */}
      <div className="relative mb-10">
        <div
          className="w-56 h-72 rounded-full flex items-center justify-center relative overflow-hidden"
          style={{ background: '#1f211f' }}
        >
          {/* Glass morphism floating overlay */}
          <div
            className="absolute glass-morphism rounded-full"
            style={{
              width: 64,
              height: 64,
              top: '12%',
              right: '10%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 24, color: '#10B981', fontVariationSettings: '"FILL" 1' }}
            >
              eco
            </span>
          </div>

          {/* Floating decorative circle */}
          <div
            className="absolute rounded-full"
            style={{
              width: 48,
              height: 48,
              background: 'rgba(16,185,129,0.15)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(16,185,129,0.30)',
              bottom: '15%',
              left: '10%',
            }}
          />

          {/* Main icon */}
          <span
            className="material-symbols-outlined relative z-10"
            style={{ fontSize: 72, color: '#10B981', fontVariationSettings: '"FILL" 1' }}
          >
            forest
          </span>
        </div>
      </div>

      {/* Typography (Stitch: text-5xl font-extrabold tracking-tighter) */}
      <div className="text-center mb-10">
        <h1
          className="text-5xl font-extrabold tracking-tighter leading-[1.1] mb-6"
          style={{ color: '#e1e3df' }}
        >
          Welcome to{'\n'}Greenplot
        </h1>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          Your personal AI agent for creative thinking.
          Information as living matter, nurtured to help you grow.
        </p>
      </div>

      {/* Amber CTA */}
      <PrimaryButton onClick={onNext}>Get Started</PrimaryButton>

      <p
        className="mt-6 text-xs flex items-center gap-2 font-medium"
        style={{ color: '#9fb8aa', opacity: 0.6 }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: '#10B981' }} />
        Version 1.0 — Built for growers
      </p>
    </StepShell>
  )
}

// ── STEP 1: Who Are You ───────────────────────────────

function StepWhoAreYou({
  nickname,
  city,
  onNickname,
  onCity,
  onNext,
  onLogin,
}: {
  nickname: string
  city: string
  onNickname: (v: string) => void
  onCity: (v: string) => void
  onNext: () => void
  onLogin: () => void
}) {
  return (
    <StepShell step={1}>
      <StepLabel step={1} />

      <div className="text-center mb-10">
        <h2
          className="text-3xl font-extrabold tracking-tight mb-3"
          style={{ color: '#e1e3df' }}
        >
          Tell us about your roots
        </h2>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          Every garden needs a keeper. Choose a name that reflects your digital presence.
        </p>
      </div>

      <div className="w-full space-y-4 mb-10">
        <div>
          <label
            className="block text-xs font-bold mb-2 pl-1 uppercase tracking-wider"
            style={{ color: '#10B981' }}
          >
            Nickname
          </label>
          <StyledInput
            value={nickname}
            onChange={onNickname}
            placeholder="Seedling_42"
            autoFocus
          />
        </div>
        <div>
          <label
            className="block text-xs font-bold mb-2 pl-1 uppercase tracking-wider"
            style={{ color: '#10B981' }}
          >
            City <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(Optional)</span>
          </label>
          <StyledInput
            value={city}
            onChange={onCity}
            placeholder="The Digital Valley"
          />
        </div>
      </div>

      <PrimaryButton onClick={onNext} disabled={!nickname.trim()}>
        Next
      </PrimaryButton>

      <button
        onClick={onLogin}
        className="mt-5 text-sm font-medium transition-opacity hover:opacity-80"
        style={{ color: '#10B981' }}
      >
        Already have an account? Log In
      </button>
    </StepShell>
  )
}

// ── STEP 2: Interests ─────────────────────────────────

function StepInterests({
  selected,
  onToggle,
  custom,
  onCustom,
  onNext,
}: {
  selected: string[]
  onToggle: (v: string) => void
  custom: string
  onCustom: (v: string) => void
  onNext: () => void
}) {
  return (
    <StepShell step={2}>
      <StepLabel step={2} />

      <div className="text-center mb-10">
        <h2
          className="text-3xl font-extrabold tracking-tight mb-3"
          style={{ color: '#e1e3df' }}
        >
          Cultivating Interests
        </h2>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          What seeds should we plant?
        </p>
      </div>

      {/* Pill chips (Stitch: rounded-full px-5 py-2.5) */}
      <div className="flex flex-wrap gap-3 justify-center mb-8">
        {INTEREST_OPTIONS.map((interest) => {
          const isSelected = selected.includes(interest)
          return (
            <button
              key={interest}
              onClick={() => onToggle(interest)}
              className="px-5 py-2.5 rounded-full text-sm font-medium transition-all active:scale-95"
              style={
                isSelected
                  ? { background: '#10B981', color: '#003825' }
                  : {
                      background: '#1f211f',
                      color: '#9fb8aa',
                      border: '1px solid rgba(63,73,67,0.20)',
                    }
              }
            >
              {interest}
            </button>
          )
        })}
      </div>

      {/* Custom interest */}
      <div className="w-full mb-10">
        <StyledInput
          value={custom}
          onChange={onCustom}
          placeholder="Add your own…"
        />
      </div>

      <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
    </StepShell>
  )
}

// ── STEP 3: Nurture Focus ─────────────────────────────

function StepNurtureFocus({
  frequency,
  onFrequency,
  onNext,
}: {
  frequency: OnboardingProfile['digestFrequency']
  onFrequency: (v: OnboardingProfile['digestFrequency']) => void
  onNext: () => void
}) {
  return (
    <StepShell step={3}>
      <StepLabel step={3} />

      <div className="text-center mb-10">
        <h2
          className="text-3xl font-extrabold tracking-tight mb-3"
          style={{ color: '#e1e3df' }}
        >
          Nurture your focus.
        </h2>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          Choose your harvest frequency. Adjust how often you want to collect your yields.
        </p>
      </div>

      {/* Radio cards (Stitch: pill-shaped containers) */}
      <div className="w-full space-y-3 mb-6">
        {DIGEST_OPTIONS.map((opt) => {
          const isSelected = frequency === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onFrequency(opt.value)}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-full transition-all active:scale-[0.98] text-left"
              style={{
                background: isSelected ? 'rgba(16,185,129,0.10)' : '#1f211f',
                border: `1.5px solid ${isSelected ? '#10B981' : 'rgba(63,73,67,0.20)'}`,
              }}
            >
              {/* Amber radio dot when selected (Stitch) */}
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  border: `2px solid ${isSelected ? '#ffb84d' : '#89938d'}`,
                  background: isSelected ? '#ffb84d' : 'transparent',
                }}
              >
                {isSelected && <div className="w-2 h-2 rounded-full" style={{ background: '#482a00' }} />}
              </div>
              <div>
                <p
                  className="text-sm font-bold"
                  style={{ color: isSelected ? '#10B981' : '#e1e3df' }}
                >
                  {opt.label}
                </p>
                <p className="text-xs font-medium mt-0.5" style={{ color: '#9fb8aa' }}>
                  {opt.sublabel}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Time setting */}
      <div
        className="w-full rounded-full px-5 py-4 mb-2 flex items-center justify-between"
        style={{ background: '#1f211f', border: '1px solid rgba(63,73,67,0.20)' }}
      >
        <div>
          <p className="text-xs font-medium" style={{ color: '#9fb8aa' }}>Time</p>
          <p className="text-lg font-bold" style={{ color: '#e1e3df' }}>09:00 AM</p>
        </div>
        <button
          className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
          style={{
            background: 'rgba(16,185,129,0.12)',
            color: '#10B981',
            border: '1px solid rgba(16,185,129,0.20)',
          }}
        >
          Edit
        </button>
      </div>

      <p className="text-xs text-center mb-6" style={{ color: '#9fb8aa', opacity: 0.6 }}>
        Local time based on your current region.
      </p>

      <PrimaryButton onClick={onNext}>Next →</PrimaryButton>

      <p className="mt-4 text-xs text-center" style={{ color: '#9fb8aa', opacity: 0.5 }}>
        You can change these settings later in Profile &gt; Vault.
      </p>
    </StepShell>
  )
}

// ── STEP 4: How It Works ──────────────────────────────

const BENTO_CARDS = [
  {
    icon: 'auto_awesome',
    title: 'Synthesis',
    body: 'Your raw thoughts are seeds. We provide the water and light needed for them to thrive through synthesis.',
  },
  {
    icon: 'language',
    title: 'Web Enrichment',
    body: 'Importing outside nutrients. LLM models and high-fidelity research expand your knowledge beyond the garden walls.',
  },
  {
    icon: 'favorite',
    title: 'Heartbeat',
    body: 'The daily Garden Pulse. Morning Spark prompts and Daily Briefings keep your evolving thoughts alive.',
  },
  {
    icon: 'hub',
    title: 'Search & Graph',
    body: 'Powered by Vector Search and Knowledge Graphs. Semantic similarity across your entire knowledge base.',
  },
]

function StepHowItWorks({
  onEnter,
  loading,
  error,
}: {
  onEnter: () => void
  loading: boolean
  error: string
}) {
  return (
    <StepShell step={4}>
      <StepLabel step={4} />

      <div className="text-center mb-8">
        <h2
          className="text-3xl font-extrabold tracking-tight mb-3"
          style={{ color: '#e1e3df' }}
        >
          The Living Intelligence
        </h2>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          Experience how your digital greenhouse breathes, learns, and connects.
        </p>
      </div>

      {/* Bento grid 2x2 (Stitch: rounded-2xl bg-surface-container) */}
      <div className="grid grid-cols-2 gap-3 w-full mb-8">
        {BENTO_CARDS.map((card) => (
          <div
            key={card.title}
            className="flex flex-col gap-2.5 p-5 rounded-2xl relative overflow-hidden"
            style={{ background: '#1f211f' }}
          >
            {/* Subtle organic bg blob */}
            <div
              className="absolute w-16 h-16 rounded-full -top-4 -right-4 pointer-events-none"
              style={{ background: '#10B981', opacity: 0.06 }}
            />
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 28, color: '#10B981', fontVariationSettings: '"FILL" 1' }}
            >
              {card.icon}
            </span>
            <p className="text-sm font-bold leading-tight" style={{ color: '#e1e3df' }}>
              {card.title}
            </p>
            <p className="text-xs leading-relaxed font-medium" style={{ color: '#9fb8aa' }}>
              {card.body}
            </p>
          </div>
        ))}
      </div>

      {/* Sync banner */}
      <div
        className="w-full rounded-full px-5 py-3 mb-8 text-center"
        style={{
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.15)',
        }}
      >
        <p className="text-xs font-medium leading-relaxed" style={{ color: '#9fb8aa' }}>
          Seeds auto-sync to memory — no manual saving required.
        </p>
      </div>

      {error && (
        <div
          className="w-full rounded-full px-5 py-3 mb-4 text-sm font-medium"
          style={{ background: 'rgba(255,180,171,0.10)', color: '#ffb4ab' }}
        >
          {error}
        </div>
      )}

      {/* "Enter the Garden" amber CTA */}
      <PrimaryButton onClick={onEnter} loading={loading}>
        Enter the Garden
      </PrimaryButton>

      <p className="mt-4 text-xs text-center font-medium" style={{ color: '#9fb8aa', opacity: 0.5 }}>
        Initializing the Greenhouse
      </p>
    </StepShell>
  )
}

// ── Main Page ─────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)

  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [customInterest, setCustomInterest] = useState('')
  const [digestFrequency, setDigestFrequency] = useState<OnboardingProfile['digestFrequency']>('once-daily')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const toggleInterest = (val: string) => {
    setSelectedInterests((prev) =>
      prev.includes(val) ? prev.filter((i) => i !== val) : [...prev, val]
    )
  }

  const allInterests = [
    ...selectedInterests,
    ...(customInterest.trim() ? [customInterest.trim()] : []),
  ]

  const handleEnter = async () => {
    setLoading(true)
    setError('')

    try {
      const slug = nickname.toLowerCase().replace(/\s+/g, '')
      const password = crypto.randomUUID()

      const registerRes = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${slug}@greenplot.app`,
          password,
        }),
      })

      if (!registerRes.ok) {
        const text = await registerRes.text()
        throw new Error(`Registration failed: ${text}`)
      }

      const { access_token, tenant_id } = await registerRes.json()

      const profile: OnboardingProfile = {
        nickname: nickname.trim(),
        city: city.trim(),
        interests: allInterests,
        digestFrequency,
        onboardedAt: new Date().toISOString(),
      }

      localStorage.setItem('greenplot_token', access_token)
      localStorage.setItem('greenplot_tenant', tenant_id)
      localStorage.setItem('greenplot_nickname', nickname.trim())
      localStorage.setItem('greenplot_profile', JSON.stringify(profile))

      const interestStr = allInterests.length > 0 ? allInterests.join(', ') : 'general ideas'
      fetch('/api/thoughts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({
          content: `Welcome! I'm ${nickname.trim()}. My interests include: ${interestStr}. Let's start building my knowledge garden.`,
          source: 'onboarding',
        }),
      }).catch(() => {})

      router.push('/chat')
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const next = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16 pb-8 relative overflow-hidden"
      style={{ background: '#111412' }}
    >
      {/* Global background glow */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 500,
          height: 500,
          background: '#10B981',
          opacity: 0.03,
          top: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          filter: 'blur(120px)',
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        <AnimatePresence mode="wait">
          {currentStep === 0 && <StepWelcome onNext={next} />}

          {currentStep === 1 && (
            <StepWhoAreYou
              nickname={nickname}
              city={city}
              onNickname={setNickname}
              onCity={setCity}
              onNext={next}
              onLogin={() => router.push('/login')}
            />
          )}

          {currentStep === 2 && (
            <StepInterests
              selected={selectedInterests}
              onToggle={toggleInterest}
              custom={customInterest}
              onCustom={setCustomInterest}
              onNext={next}
            />
          )}

          {currentStep === 3 && (
            <StepNurtureFocus
              frequency={digestFrequency}
              onFrequency={setDigestFrequency}
              onNext={next}
            />
          )}

          {currentStep === 4 && (
            <StepHowItWorks
              onEnter={handleEnter}
              loading={loading}
              error={error}
            />
          )}
        </AnimatePresence>
      </div>

      <ProgressBar step={currentStep} />
    </div>
  )
}
