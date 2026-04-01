'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'

// ── Types ─────────────────────────────────────────────

interface OnboardingProfile {
  nickname: string
  city: string
  interests: string[]
  digestFrequency: 'twice-daily' | 'once-daily' | 'weekly'
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
  { label: 'Twice a day', sublabel: 'Morning & evening briefings', value: 'twice-daily' },
  { label: 'Once a day', sublabel: 'Morning spark every day', value: 'once-daily' },
  { label: 'Weekly', sublabel: 'One curated digest per week', value: 'weekly' },
]

const TOTAL_STEPS = 5

// ── Progress Bar ──────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const pct = ((step + 1) / TOTAL_STEPS) * 100
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="h-[2px] w-full" style={{ background: 'rgba(105,246,184,0.15)' }}>
        <motion.div
          className="h-full"
          style={{ background: 'var(--primary)' }}
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
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="w-full flex flex-col items-center"
    >
      {children}
    </motion.div>
  )
}

// ── Shared UI ─────────────────────────────────────────

function StepLabel({ step }: { step: number }) {
  return (
    <p className="text-xs font-medium mb-6" style={{ color: 'var(--on-surface-variant)' }}>
      Step {step + 1}/{TOTAL_STEPS}
    </p>
  )
}

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
      className="w-full py-3.5 rounded-2xl font-semibold text-base transition-all active:scale-[0.97] disabled:opacity-40"
      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span
            className="w-4 h-4 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: 'var(--primary-foreground)' }}
          />
          Setting up your garden…
        </span>
      ) : (
        children
      )}
    </button>
  )
}

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
      className="w-full px-4 py-3.5 rounded-2xl text-base outline-none transition-all focus:ring-2"
      style={{
        background: 'var(--surface-container)',
        color: 'var(--on-surface)',
        border: '1px solid var(--outline-variant)',
        // @ts-ignore
        '--tw-ring-color': 'rgba(105,246,184,0.35)',
      }}
    />
  )
}

// ── STEP 0: Welcome ───────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <StepShell step={0}>
      <StepLabel step={0} />
      {/* Glow icon */}
      <div className="relative mb-8">
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-40"
          style={{ background: 'var(--primary)', transform: 'scale(1.6)' }}
        />
        <span
          className="material-symbols-outlined relative"
          style={{ fontSize: 72, color: 'var(--primary)', fontVariationSettings: '"FILL" 1' }}
        >
          forest
        </span>
      </div>

      <h1
        className="text-3xl font-bold text-center leading-snug mb-3"
        style={{ color: 'var(--on-surface)' }}
      >
        Welcome to{'\n'}Greenplot
      </h1>
      <p className="text-sm text-center leading-relaxed mb-10 max-w-xs" style={{ color: 'var(--on-surface-variant)' }}>
        Your personal AI agent for creative thinking. Ideas as living matter, nurtured to help you grow.
      </p>

      <PrimaryButton onClick={onNext}>Get Started</PrimaryButton>

      <p className="mt-6 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
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
      <span
        className="material-symbols-outlined mb-6"
        style={{ fontSize: 40, color: 'var(--primary)', fontVariationSettings: '"FILL" 1' }}
      >
        person_pin
      </span>
      <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--on-surface)' }}>
        Tell us about your roots
      </h2>
      <p className="text-sm text-center leading-relaxed mb-8 max-w-xs" style={{ color: 'var(--on-surface-variant)' }}>
        Every garden needs a keeper. Choose a name that reflects your digital presence.
      </p>

      <div className="w-full space-y-3 mb-8">
        <StyledInput
          value={nickname}
          onChange={onNickname}
          placeholder="Seedling_42"
          autoFocus
        />
        <StyledInput
          value={city}
          onChange={onCity}
          placeholder="Your city (optional)"
        />
      </div>

      <PrimaryButton onClick={onNext} disabled={!nickname.trim()}>
        Next
      </PrimaryButton>

      <button
        onClick={onLogin}
        className="mt-4 text-sm transition-opacity hover:opacity-80"
        style={{ color: 'var(--primary)' }}
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
      <span
        className="material-symbols-outlined mb-6"
        style={{ fontSize: 40, color: 'var(--primary)', fontVariationSettings: '"FILL" 1' }}
      >
        interests
      </span>
      <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--on-surface)' }}>
        Cultivating Interests
      </h2>
      <p className="text-sm text-center leading-relaxed mb-8 max-w-xs" style={{ color: 'var(--on-surface-variant)' }}>
        What seeds should we plant?
      </p>

      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {INTEREST_OPTIONS.map((interest) => {
          const isSelected = selected.includes(interest)
          return (
            <button
              key={interest}
              onClick={() => onToggle(interest)}
              className="px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95"
              style={
                isSelected
                  ? { background: '#69f6b8', color: '#005a3c' }
                  : {
                      background: 'var(--surface-container)',
                      color: 'var(--on-surface-variant)',
                      border: '1px solid var(--outline-variant)',
                    }
              }
            >
              {interest}
            </button>
          )
        })}
      </div>

      <div className="w-full mb-8">
        <StyledInput
          value={custom}
          onChange={onCustom}
          placeholder="Add your own…"
        />
      </div>

      <PrimaryButton onClick={onNext}>
        Continue
      </PrimaryButton>
    </StepShell>
  )
}

// ── STEP 3: Digest Frequency ──────────────────────────

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
      <span
        className="material-symbols-outlined mb-6"
        style={{ fontSize: 40, color: 'var(--primary)', fontVariationSettings: '"FILL" 1' }}
      >
        spa
      </span>
      <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--on-surface)' }}>
        Nurture your focus
      </h2>
      <p className="text-sm text-center leading-relaxed mb-8 max-w-xs" style={{ color: 'var(--on-surface-variant)' }}>
        How often should Greenplot surface your growing ideas?
      </p>

      <div className="w-full space-y-3 mb-8">
        {DIGEST_OPTIONS.map((opt) => {
          const isSelected = frequency === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onFrequency(opt.value)}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all active:scale-[0.98]"
              style={{
                background: isSelected ? 'rgba(105,246,184,0.12)' : 'var(--surface-container)',
                border: `1.5px solid ${isSelected ? '#69f6b8' : 'var(--outline-variant)'}`,
              }}
            >
              {/* Radio dot */}
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  border: `2px solid ${isSelected ? '#69f6b8' : 'var(--outline-variant)'}`,
                  background: isSelected ? '#69f6b8' : 'transparent',
                }}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full" style={{ background: '#005a3c' }} />
                )}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold" style={{ color: isSelected ? '#69f6b8' : 'var(--on-surface)' }}>
                  {opt.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                  {opt.sublabel}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <PrimaryButton onClick={onNext}>
        Continue
      </PrimaryButton>
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
    body: 'Importing outside nutrients. We leverage LLM models and high-fidelity research to expand your knowledge beyond garden walls.',
  },
  {
    icon: 'favorite',
    title: 'Heartbeat',
    body: 'The daily pulse. Morning Spark prompts and Daily Briefings ensure you never lose track of evolving thoughts.',
  },
  {
    icon: 'hub',
    title: 'Search & Graph',
    body: 'Powered by vector search and knowledge graphs. Semantic similarity across your entire knowledge base.',
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
      <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--on-surface)' }}>
        The Living Intelligence
      </h2>
      <p className="text-sm text-center leading-relaxed mb-8 max-w-xs" style={{ color: 'var(--on-surface-variant)' }}>
        Experience how your digital greenhouse breathes, learns, and connects.
      </p>

      <div className="grid grid-cols-2 gap-3 w-full mb-8">
        {BENTO_CARDS.map((card) => (
          <div
            key={card.title}
            className="flex flex-col gap-2 p-4 rounded-2xl"
            style={{ background: 'var(--surface-container)' }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 26, color: 'var(--primary)', fontVariationSettings: '"FILL" 1' }}
            >
              {card.icon}
            </span>
            <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--on-surface)' }}>
              {card.title}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
              {card.body}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div
          className="w-full rounded-2xl px-4 py-3 mb-4 text-sm"
          style={{ background: 'rgba(255,113,108,0.1)', color: 'var(--error)' }}
        >
          {error}
        </div>
      )}

      <PrimaryButton onClick={onEnter} loading={loading}>
        Enter the Garden
      </PrimaryButton>
    </StepShell>
  )
}

// ── Main Page ─────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)

  // Step 1 data
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')

  // Step 2 data
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [customInterest, setCustomInterest] = useState('')

  // Step 3 data
  const [digestFrequency, setDigestFrequency] = useState<OnboardingProfile['digestFrequency']>('once-daily')

  // Step 4 state
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

      // 1. Register
      const registerRes = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${slug}@greenplot.local`,
          password,
        }),
      })

      if (!registerRes.ok) {
        const text = await registerRes.text()
        throw new Error(`Registration failed: ${text}`)
      }

      const { access_token, tenant_id } = await registerRes.json()

      // 2. Build profile object
      const profile: OnboardingProfile = {
        nickname: nickname.trim(),
        city: city.trim(),
        interests: allInterests,
        digestFrequency,
        onboardedAt: new Date().toISOString(),
      }

      // 3. Store everything
      localStorage.setItem('greenplot_token', access_token)
      localStorage.setItem('greenplot_tenant', tenant_id)
      localStorage.setItem('greenplot_nickname', nickname.trim())
      localStorage.setItem('greenplot_profile', JSON.stringify(profile))

      // 4. Plant first seed (non-critical)
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

      // 5. Navigate
      router.push('/chat')
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const next = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16 pb-8"
      style={{ background: 'var(--background)' }}
    >
      <div className="w-full max-w-sm">
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
