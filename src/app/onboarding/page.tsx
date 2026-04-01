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

// ── Progress Bar (Figma: thin green gradient line, 192px centered, rounded) ──

function ProgressBar({ step }: { step: number }) {
  const pct = ((step + 1) / TOTAL_STEPS) * 100
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-8">
      <div className="h-1 w-48 rounded-full overflow-hidden" style={{ background: 'rgba(16,185,129,0.15)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, #10b981, rgba(16,185,129,0.0))',
            width: `${pct}%`,
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
    <p className="text-xs tracking-wide mb-8" style={{ color: '#9fb8aa', opacity: 0.6 }}>
      Step {step + 1}/{TOTAL_STEPS}
    </p>
  )
}

// ── Primary Button (Figma: amber/gold, pill-shaped, 68px tall) ──

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
      className="w-full py-4 rounded-full font-semibold text-base transition-all active:scale-[0.97] disabled:opacity-40 shadow-lg"
      style={{
        background: '#f59e0b',
        color: '#ffffff',
        boxShadow: '0 8px 32px rgba(245,158,11,0.3)',
      }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span
            className="w-4 h-4 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: '#ffffff' }}
          />
          Setting up your garden…
        </span>
      ) : (
        children
      )}
    </button>
  )
}

// ── Styled Input ──────────────────────────────────────

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
      className="w-full px-5 py-4 rounded-full text-base outline-none transition-all placeholder:opacity-50"
      style={{
        background: '#232623',
        color: '#e1e3df',
        border: '1px solid #2e4a3f',
      }}
    />
  )
}

// ── STEP 0: Welcome (Figma: Seedify: Welcome) ─────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <StepShell step={0}>
      {/* Decorative background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute rounded-full"
          style={{
            width: 228,
            height: 228,
            background: '#10b981',
            opacity: 0.06,
            top: '8%',
            right: '-15%',
            filter: 'blur(2px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 390,
            height: 390,
            background: '#10b981',
            opacity: 0.04,
            top: '-10%',
            left: '-20%',
            filter: 'blur(60px)',
          }}
        />
      </div>

      <StepLabel step={0} />

      {/* Seed motif illustration — dark green rounded container */}
      <div className="relative mb-10">
        <div
          className="w-56 h-72 rounded-[9999px] flex items-center justify-center relative overflow-hidden"
          style={{ background: '#1a2e26' }}
        >
          {/* Floating decorative element */}
          <div
            className="absolute w-20 h-20 rounded-full"
            style={{
              background: '#10b981',
              top: '15%',
              right: '10%',
              opacity: 0.8,
            }}
          />
          {/* Main icon */}
          <span
            className="material-symbols-outlined relative z-10"
            style={{ fontSize: 72, color: '#10b981', fontVariationSettings: '"FILL" 1' }}
          >
            forest
          </span>
        </div>
      </div>

      {/* Typography */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold leading-tight mb-6" style={{ color: '#e1e3df' }}>
          Welcome to{'\n'}your creative{'\n'}Brain
        </h1>
        <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          Your personal AI agent in your pocket for creative thinking.
          Information as living matter, nurtured to help you grow.
        </p>
      </div>

      <PrimaryButton onClick={onNext}>Get Started</PrimaryButton>

      <p className="mt-6 text-xs flex items-center gap-2" style={{ color: '#9fb8aa', opacity: 0.6 }}>
        <span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
        Version 1.0 — Built for growers
      </p>
    </StepShell>
  )
}

// ── STEP 1: Who Are You (Figma: Who are you?) ─────────

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
        <h2 className="text-3xl font-bold mb-3" style={{ color: '#e1e3df' }}>
          Tell us about your{'\n'}roots
        </h2>
        <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          Every garden needs a keeper. Choose a name that reflects your digital presence.
        </p>
      </div>

      <div className="w-full space-y-4 mb-10">
        <div>
          <label className="block text-xs font-medium mb-2 pl-1" style={{ color: '#9fb8aa' }}>
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
          <label className="block text-xs font-medium mb-2 pl-1" style={{ color: '#9fb8aa' }}>
            City <span style={{ opacity: 0.5 }}>(Optional)</span>
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
        style={{ color: '#10b981' }}
      >
        Already have an account? Log In
      </button>
    </StepShell>
  )
}

// ── STEP 2: Interests (Figma: What interests you?) ─────

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
        <h2 className="text-3xl font-bold mb-3" style={{ color: '#e1e3df' }}>
          Cultivating{'\n'}Interests
        </h2>
        <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          What seeds should we plant?
        </p>
      </div>

      {/* Interest chips — Figma style: pill-shaped, organic tonal layering */}
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
                  ? { background: '#10b981', color: '#ffffff' }
                  : { background: '#232623', color: '#9fb8aa', border: '1px solid #2e4a3f' }
              }
            >
              {interest}
            </button>
          )
        })}
      </div>

      {/* Custom input */}
      <div className="w-full mb-10">
        <StyledInput
          value={custom}
          onChange={onCustom}
          placeholder="Add your own…"
        />
      </div>

      <div className="flex items-center justify-between w-full">
        <button
          onClick={onNext}
          className="text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: '#9fb8aa' }}
        >
          Back
        </button>
        <PrimaryButton onClick={onNext}>
          Continue
        </PrimaryButton>
      </div>
    </StepShell>
  )
}

// ── STEP 3: Nurture Focus (Figma: Nurture Focus) ──────

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
        <h2 className="text-3xl font-bold mb-3" style={{ color: '#e1e3df' }}>
          Nurture your focus.
        </h2>
        <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          Choose your harvest frequency. Adjust how often you want to collect your yields.
        </p>
      </div>

      <div className="w-full space-y-3 mb-10">
        {DIGEST_OPTIONS.map((opt) => {
          const isSelected = frequency === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onFrequency(opt.value)}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all active:scale-[0.98] text-left"
              style={{
                background: isSelected ? 'rgba(16,185,129,0.1)' : '#232623',
                border: `1.5px solid ${isSelected ? '#10b981' : '#2e4a3f'}`,
              }}
            >
              {/* Radio dot */}
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  border: `2px solid ${isSelected ? '#10b981' : '#657a70'}`,
                  background: isSelected ? '#10b981' : 'transparent',
                }}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: isSelected ? '#10b981' : '#e1e3df' }}>
                  {opt.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#9fb8aa' }}>
                  {opt.sublabel}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
    </StepShell>
  )
}

// ── STEP 4: How It Works (Figma: How it works) ────────

const BENTO_CARDS = [
  {
    icon: 'auto_awesome',
    title: 'Synthesis',
    body: 'Your raw thoughts are seeds. We provide the water and light needed for them to thrive through synthesis.',
  },
  {
    icon: 'language',
    title: 'Web Enrichment',
    body: 'Importing Outside Nutrients. We leverage LLM models and high-fidelity research to expand your knowledge beyond the garden walls.',
  },
  {
    icon: 'favorite',
    title: 'Heartbeat',
    body: 'The daily Garden Pulse. Morning Spark prompts and Daily Briefings ensure you never lose track of evolving thoughts.',
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
        <h2 className="text-3xl font-bold mb-3" style={{ color: '#e1e3df' }}>
          The Living{'\n'}Intelligence
        </h2>
        <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: '#9fb8aa' }}>
          Experience how your digital greenhouse breathes, learns, and connects.
        </p>
      </div>

      {/* Bento grid — Figma: 2x2, organic tonal layering */}
      <div className="grid grid-cols-2 gap-3 w-full mb-10">
        {BENTO_CARDS.map((card, i) => (
          <div
            key={card.title}
            className="flex flex-col gap-2.5 p-5 rounded-2xl relative overflow-hidden"
            style={{ background: '#1a2e26', border: '1px solid #2e4a3f' }}
          >
            {/* Subtle organic background */}
            <div
              className="absolute w-16 h-16 rounded-full -top-4 -right-4"
              style={{ background: '#10b981', opacity: 0.06 }}
            />
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 28, color: '#10b981', fontVariationSettings: '"FILL" 1' }}
            >
              {card.icon}
            </span>
            <p className="text-sm font-bold leading-tight" style={{ color: '#e1e3df' }}>
              {card.title}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#9fb8aa' }}>
              {card.body}
            </p>
          </div>
        ))}
      </div>

      {/* Seeds auto-sync banner */}
      <div
        className="w-full rounded-2xl p-4 mb-8 text-center"
        style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}
      >
        <p className="text-xs leading-relaxed" style={{ color: '#9fb8aa' }}>
          Seeds are automatically synced to memory so both you and the AI can connect the dots. No manual saving required.
        </p>
      </div>

      {error && (
        <div
          className="w-full rounded-2xl px-4 py-3 mb-4 text-sm"
          style={{ background: 'rgba(255,113,108,0.1)', color: '#ff716c' }}
        >
          {error}
        </div>
      )}

      <PrimaryButton onClick={onEnter} loading={loading}>
        Enter the Garden
      </PrimaryButton>

      <p className="mt-4 text-xs text-center" style={{ color: '#9fb8aa', opacity: 0.5 }}>
        Initializing the Greenhouse
      </p>
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
          email: `${slug}@greenplot.app`,
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
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16 pb-8 relative overflow-hidden"
      style={{ background: '#111412' }}
    >
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
