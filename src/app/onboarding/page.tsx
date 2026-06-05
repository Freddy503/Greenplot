'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { usePushNotifications } from '@/hooks/use-push-notifications'

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
  { label: 'Technology', icon: 'rocket_launch' },
  { label: 'Business trends', icon: 'trending_up' },
  { label: 'Entrepreneurship', icon: 'lightbulb' },
  { label: 'AI', icon: 'memory' },
  { label: 'Design', icon: 'palette' },
  { label: 'Productivity', icon: 'bolt' },
  { label: 'Learning', icon: 'menu_book' },
  { label: 'Creativity', icon: 'auto_awesome' },
  { label: 'Consulting', icon: 'handshake' },
  { label: 'Law', icon: 'gavel' },
  { label: 'Medicine', icon: 'health_and_safety' },
  { label: 'Sustainability', icon: 'eco' },
]

const DIGEST_OPTIONS: { label: string; sublabel: string; value: OnboardingProfile['digestFrequency'] }[] = [
  { label: 'Twice a day', sublabel: 'Morning & evening cycles', value: 'twice-daily' },
  { label: 'Once a day', sublabel: 'Standard growth pattern', value: 'once-daily' },
  { label: 'Bi-Weekly', sublabel: 'Mid-week and weekend updates', value: 'bi-weekly' },
  { label: 'Weekly', sublabel: 'Batch collection every Sunday', value: 'weekly' },
  { label: 'Based on Calendar', sublabel: 'Smart Scheduling', value: 'calendar' },
]

// Cron job previews per cadence
const CRON_PREVIEW: Record<OnboardingProfile['digestFrequency'], Array<{ icon: string; name: string; time: string; desc: string }>> = {
  'twice-daily': [
    { icon: 'wb_sunny', name: 'Morning Spark', time: '8:00 AM', desc: 'Weather, schedule & a creative prompt to start your day' },
    { icon: 'nights_stay', name: 'Evening Reflection', time: '8:00 PM', desc: 'Review your day, capture loose thoughts' },
    { icon: 'eco', name: 'Garden Pulse', time: '12:00 PM', desc: 'Seed enrichment & connection check' },
  ],
  'once-daily': [
    { icon: 'wb_sunny', name: 'Daily Briefing', time: '9:00 AM', desc: 'Weather, calendar highlights, recent seeds & creative prompt' },
    { icon: 'eco', name: 'Garden Pulse', time: '9:00 AM', desc: 'Runs alongside your briefing' },
  ],
  'bi-weekly': [
    { icon: 'trending_up', name: 'Mid-Week Digest', time: 'Wed 10:00 AM', desc: 'Weekly trends, new seeds, web highlights' },
    { icon: 'auto_stories', name: 'Weekend Review', time: 'Sun 10:00 AM', desc: 'Deep-dive into your garden, connection map' },
  ],
  'weekly': [
    { icon: 'auto_stories', name: 'Weekly Roundup', time: 'Sunday 10:00 AM', desc: 'Full week recap: seeds created, enriched, trending topics' },
  ],
  'calendar': [
    { icon: 'event', name: 'Smart Scheduling', time: 'Based on your calendar', desc: 'Delivers insights when you have free time — never during meetings' },
  ],
}

const TOTAL_STEPS = 5
const STEP_LABELS = ['Welcome', 'Roots', 'Interests', 'Nurture', 'Intelligence']

// ── Ambient Background ────────────────────────────────

function AmbientBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute rounded-full w-[500px] h-[500px] bg-primary/10 -top-[15%] -right-[20%] blur-[120px]" />
      <div className="absolute rounded-full w-[400px] h-[400px] bg-secondary/5 -bottom-[10%] -left-[20%] blur-[100px]" />
    </div>
  )
}

// ── Progress Bar (Stitch: top, gradient, step labels) ─

function ProgressBar({ step }: { step: number }) {
  const pct = ((step + 1) / TOTAL_STEPS) * 100
  return (
    <div className="w-full max-w-md mb-12 flex flex-col gap-4">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          Step {step + 1} of {TOTAL_STEPS}
        </span>
        <span className="text-[10px] font-bold text-primary uppercase tracking-[0.1em]">
          {STEP_LABELS[step]}
        </span>
      </div>
      <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-container shadow-[0_0_15px_rgba(105,246,184,0.3)]"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
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
      className="w-full max-w-lg flex flex-col items-center"
    >
      {children}
    </motion.div>
  )
}

// ── Gradient CTA Button (Stitch style) ────────────────

function CTAButton({
  children,
  onClick,
  disabled,
  loading,
  icon = 'arrow_forward',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  icon?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full max-w-xs group relative flex items-center justify-center gap-3 bg-gradient-to-br from-primary to-primary-container text-on-primary font-headline font-bold py-5 rounded-full shadow-[0_10px_40px_-10px_rgba(105,246,184,0.3)] hover:shadow-[0_15px_50px_-10px_rgba(105,246,184,0.5)] active:scale-[0.97] transition-all duration-300 disabled:opacity-40 disabled:pointer-events-none"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <Spinner className="text-on-primary" />
          Setting up your garden…
        </span>
      ) : (
        <>
          <span className="text-lg">{children}</span>
          <span
            className="material-symbols-outlined transition-transform group-hover:translate-x-1"
            style={{ fontVariationSettings: '"wght" 700' }}
          >
            {icon}
          </span>
        </>
      )}
    </button>
  )
}

// ── Input Field (Stitch style: pill, with icon) ───────

function StitchInput({
  label,
  icon,
  optional,
  ...props
}: {
  label: string
  icon: string
  optional?: boolean
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <Label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant ml-4">
        {label}
        {optional && (
          <span className="text-on-surface-variant/50 normal-case tracking-normal font-medium ml-1">
            (Optional)
          </span>
        )}
      </Label>
      <div className="relative group">
        <Input
          {...props}
          className="w-full bg-surface-container-highest border-none rounded-full px-6 py-4 text-on-surface placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary transition-all pr-12"
        />
        <div className="absolute inset-y-0 right-4 flex items-center text-primary/40 pointer-events-none">
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{icon}</span>
        </div>
      </div>
    </div>
  )
}

// ── STEP 0: Welcome ───────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <StepShell step={0}>
      {/* Seed motif */}
      <div className="relative mb-10">
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-[1.8]" />
        <div className="relative w-56 h-72 rounded-full flex items-center justify-center bg-surface-container border border-outline-variant/20 overflow-hidden">
          <div className="absolute bg-surface-container/80 backdrop-blur-sm rounded-full w-16 h-16 top-[12%] right-[10%] flex items-center justify-center">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: 24, fontVariationSettings: '"FILL" 1' }}
            >
              eco
            </span>
          </div>
          <span
            className="material-symbols-outlined text-primary relative z-10"
            style={{ fontSize: 72, fontVariationSettings: '"FILL" 1' }}
          >
            forest
          </span>
        </div>
      </div>

      <div className="text-center mb-10">
        <h1 className="text-5xl font-normal tracking-tighter leading-[1.1] mb-6 text-on-surface">
          Welcome to{'\n'}Greenplot
        </h1>
        <p className="text-base font-medium leading-relaxed max-w-xs mx-auto text-on-surface-variant">
          Your personal AI agent for creative thinking. Information as living matter, nurtured to help you grow.
        </p>
      </div>

      <CTAButton onClick={onNext}>Get Started</CTAButton>

      <p className="mt-6 text-xs flex items-center gap-2 font-medium text-on-surface-variant/40">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        Version 1.0 — Built for growers
      </p>
    </StepShell>
  )
}

// ── STEP 1: Who Are You ───────────────────────────────

function StepWhoAreYou({
  email,
  nickname,
  city,
  password,
  confirmPassword,
  onEmail,
  onNickname,
  onCity,
  onPassword,
  onConfirmPassword,
  onNext,
  onLogin,
}: {
  email: string
  nickname: string
  city: string
  password: string
  confirmPassword: string
  onEmail: (v: string) => void
  onNickname: (v: string) => void
  onCity: (v: string) => void
  onPassword: (v: string) => void
  onConfirmPassword: (v: string) => void
  onNext: () => void
  onLogin: () => void
}) {
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const passwordsMatch = password === confirmPassword
  const passwordValid = password.length >= 6
  const canProceed = emailValid && nickname.trim() && passwordValid && passwordsMatch

  return (
    <StepShell step={1}>
      {/* Avatar upload placeholder */}
      <div className="relative group mx-auto w-36 h-36 mb-8">
        <div className="absolute inset-0 bg-primary/20 blur-2xl group-hover:bg-primary/30 transition-all duration-500 rounded-full" />
        <div className="relative w-full h-full rounded-full flex items-center justify-center bg-surface-container-high border border-outline-variant/20 hover:border-primary/40 transition-colors cursor-pointer overflow-hidden">
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-300">
              <span className="material-symbols-outlined text-3xl">photo_camera</span>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-secondary rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
          <span className="material-symbols-outlined text-on-secondary text-xl" style={{ fontVariationSettings: '"wght" 700' }}>add</span>
        </div>
      </div>

      <div className="text-center mb-8">
        <h2 className="text-4xl font-normal tracking-tight mb-3 text-on-surface">
          Tell us about your roots
        </h2>
        <p className="text-base font-medium leading-relaxed max-w-xs mx-auto text-on-surface-variant">
          Every garden needs a keeper. Choose a name that reflects your digital presence.
        </p>
      </div>

      <div className="w-full space-y-4 mb-8">
        <StitchInput label="Email" icon="mail" type="email" value={email} onChange={(e) => onEmail(e.target.value)} placeholder="you@example.com" autoFocus />
        {email.length > 0 && !emailValid && (
          <p className="text-xs text-error ml-4">Enter a valid email address</p>
        )}
        <StitchInput label="Nickname" icon="face" value={nickname} onChange={(e) => onNickname(e.target.value)} placeholder="Seedling_42" />
        <StitchInput label="Password" icon="lock" type="password" value={password} onChange={(e) => onPassword(e.target.value)} placeholder="Min. 6 characters" />
        {password.length > 0 && !passwordValid && (
          <p className="text-xs text-error ml-4">At least 6 characters</p>
        )}
        <StitchInput label="Confirm Password" icon="lock" type="password" value={confirmPassword} onChange={(e) => onConfirmPassword(e.target.value)} placeholder="Repeat your password" />
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p className="text-xs text-error ml-4">Passwords don't match</p>
        )}
        <StitchInput label="City" icon="location_on" optional value={city} onChange={(e) => onCity(e.target.value)} placeholder="The Digital Valley" />
      </div>

      <CTAButton onClick={onNext} disabled={!canProceed}>Next</CTAButton>

      <button onClick={onLogin} className="mt-6 text-xs text-on-surface-variant/40 hover:text-primary transition-colors">
        Already have an account? <span className="text-primary font-bold">Log In</span>
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
      <div className="text-left mb-10 w-full">
        <h2 className="text-[2.5rem] leading-[1.1] font-normal tracking-[-0.04em] text-on-surface mb-4">
          What seeds should<br />we plant?
        </h2>
        <p className="text-base text-on-surface-variant max-w-md leading-relaxed">
          Select topics that excite you to curate your digital garden.
        </p>
      </div>

      {/* Interest chips with icons */}
      <div className="w-full flex flex-wrap gap-3 mb-6">
        {INTEREST_OPTIONS.map(({ label, icon }) => {
          const isSelected = selected.includes(label)
          return (
            <button
              key={label}
              onClick={() => onToggle(label)}
              className={`flex items-center px-5 py-3.5 rounded-full font-bold text-sm transition-all active:scale-95 ${
                isSelected
                  ? 'bg-gradient-to-br from-primary to-primary-container text-on-primary'
                  : 'bg-surface-container hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span
                className="material-symbols-outlined mr-2"
                style={{ fontSize: '20px', fontVariationSettings: isSelected ? '"FILL" 1' : '"FILL" 0' }}
              >
                {icon}
              </span>
              {label}
            </button>
          )
        })}
      </div>

      {/* Custom interest */}
      <div className="w-full mb-10">
        <div className="relative">
          <Input
            value={custom}
            onChange={(e) => onCustom(e.target.value)}
            placeholder="Add your own…"
            className="w-full bg-surface-container-highest border-none rounded-full px-6 py-4 text-on-surface placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary pr-14"
          />
          <div className="absolute inset-y-0 right-4 flex items-center text-primary/40 pointer-events-none">
            <span className="material-symbols-outlined">add</span>
          </div>
        </div>
      </div>

      <CTAButton onClick={onNext}>Continue</CTAButton>
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
      <div className="text-left mb-10 w-full">
        <h2 className="text-[2.5rem] leading-[1.1] font-normal tracking-[-0.04em] text-on-surface mb-4">
          Nurture your focus.
        </h2>
        <p className="text-base text-on-surface-variant max-w-md leading-relaxed">
          Choose how often you want your AI garden to deliver insights. Each cadence includes a preview of what you'll receive.
        </p>
      </div>

      {/* Radio cards */}
      <div className="w-full space-y-3 mb-4">
        {DIGEST_OPTIONS.map((opt) => {
          const isSelected = frequency === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onFrequency(opt.value)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all active:scale-[0.98] border ${
                isSelected
                  ? 'bg-primary/10 border-primary/30'
                  : 'bg-surface-container border-outline-variant/20 hover:bg-surface-container-high'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all border-2 ${
                  isSelected ? 'border-secondary bg-secondary' : 'border-on-surface-variant/50 bg-transparent'
                }`}
              >
                {isSelected && <div className="w-2 h-2 rounded-full bg-on-secondary" />}
              </div>
              <div className="flex flex-col items-start">
                <p className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                  {opt.label}
                </p>
                <p className="text-xs font-medium mt-0.5 text-on-surface-variant">{opt.sublabel}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Cron Preview Panel */}
      <div className="w-full mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}>
            schedule
          </span>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">
            What you'll receive
          </p>
        </div>
        <div className="space-y-2.5">
          {CRON_PREVIEW[frequency]?.map((job, i) => (
            <div
              key={`${frequency}-${i}`}
              className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-surface-container-low border border-outline-variant/10"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/10">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{ fontSize: '18px', fontVariationSettings: '"FILL" 1' }}
                >
                  {job.icon}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-on-surface">{job.name}</p>
                  <span className="text-[10px] font-semibold text-primary/60 uppercase tracking-wide">
                    {job.time}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{job.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <CTAButton onClick={onNext}>Next</CTAButton>

      <p className="mt-4 text-xs text-center text-on-surface-variant/30">
        You can change these settings later in Profile &gt; Vault.
      </p>
    </StepShell>
  )
}

// ── STEP 4: How It Works ──────────────────────────────

const BENTO_CARDS = [
  { icon: 'auto_awesome', title: 'Synthesis', body: 'Your raw thoughts are seeds. We provide the water and light needed for them to thrive through synthesis.' },
  { icon: 'language', title: 'Web Enrichment', body: 'Importing outside nutrients. LLM models and high-fidelity research expand your knowledge beyond the garden walls.' },
  { icon: 'favorite', title: 'Heartbeat', body: 'The daily Garden Pulse. Morning Spark prompts and Daily Briefings keep your evolving thoughts alive.' },
  { icon: 'hub', title: 'Search & Graph', body: 'Powered by Vector Search and Knowledge Graphs. Semantic similarity across your entire knowledge base.' },
]

function StepHowItWorks({
  onEnter,
  loading,
  error,
  showIOSPrompt = false,
}: {
  onEnter: () => void
  loading: boolean
  error: string
  showIOSPrompt?: boolean
}) {
  return (
    <StepShell step={4}>
      <div className="text-left mb-8 w-full">
        <h2 className="text-[2.5rem] leading-[1.1] font-normal tracking-[-0.04em] text-on-surface mb-4">
          The Living Intelligence
        </h2>
        <p className="text-base text-on-surface-variant max-w-md leading-relaxed">
          Experience how your digital greenhouse breathes, learns, and connects.
        </p>
      </div>

      {/* iOS home-screen install prompt — required for push notifications on Safari */}
      {showIOSPrompt && (
        <div className="w-full rounded-2xl px-5 py-4 mb-5 bg-primary/8 border border-primary/20">
          <div className="flex items-start gap-3">
            <span
              className="material-symbols-outlined text-primary mt-0.5 shrink-0"
              style={{ fontSize: 22, fontVariationSettings: '"FILL" 1' }}
            >
              ios_share
            </span>
            <div>
              <p className="text-sm font-bold text-on-surface mb-1">Enable push notifications</p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                To receive daily briefings on iOS, add this app to your Home Screen first:
                tap <strong>Share</strong> <span className="inline-block">↑</span> then{' '}
                <strong>Add to Home Screen</strong>. Then reopen and continue.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bento grid */}
      <div className="grid grid-cols-2 gap-3 w-full mb-6">
        {BENTO_CARDS.map((card) => (
          <div key={card.title} className="flex flex-col gap-2.5 p-5 rounded-2xl bg-surface-container border border-outline-variant/10 relative overflow-hidden">
            <div className="absolute w-16 h-16 rounded-full -top-4 -right-4 bg-primary opacity-[0.06]" />
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: 28, fontVariationSettings: '"FILL" 1' }}
            >
              {card.icon}
            </span>
            <p className="text-sm font-bold leading-tight text-on-surface">{card.title}</p>
            <p className="text-xs leading-relaxed font-medium text-on-surface-variant">{card.body}</p>
          </div>
        ))}
      </div>

      {/* Sync banner */}
      <div className="w-full rounded-full px-5 py-3 mb-6 text-center bg-primary/8 border border-primary/15">
        <p className="text-xs font-medium text-on-surface-variant">
          Seeds auto-sync to memory — no manual saving required.
        </p>
      </div>

      {error && (
        <div className="w-full rounded-full px-5 py-3 mb-4 text-sm font-medium bg-error/10 text-error">
          {error}
        </div>
      )}

      <CTAButton onClick={onEnter} loading={loading} icon="eco">
        Enter the Garden
      </CTAButton>

      <p className="mt-4 text-xs text-center font-medium text-on-surface-variant/30">
        Initializing the Greenhouse
      </p>
    </StepShell>
  )
}

// ── Main Page ─────────────────────────────────────────

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentStep, setCurrentStep] = useState(0)

  const [email, setEmail] = useState('')

  // Pre-fill email from invite link (?email=...)
  useEffect(() => {
    const inviteEmail = searchParams.get('email')
    if (inviteEmail) setEmail(inviteEmail)
  }, [searchParams])
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [customInterest, setCustomInterest] = useState('')
  const [digestFrequency, setDigestFrequency] = useState<OnboardingProfile['digestFrequency']>('once-daily')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { requestPermission, isIOS, isStandalone } = usePushNotifications()

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
      const registerRes = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          city: city.trim() || undefined,
          nickname: nickname.trim() || undefined,
          interests: allInterests.length > 0 ? allInterests : undefined,
          digest_frequency: digestFrequency,
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
      localStorage.setItem('greenplot_email', email.trim())
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

      // Register push notifications (non-blocking)
      requestPermission().catch(() => {})

      router.push('/chat')
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const next = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden bg-background">
      <AmbientBg />

      {/* Progress at top */}
      <div className="w-full max-w-lg mb-8">
        <ProgressBar step={currentStep} />
      </div>

      <AnimatePresence mode="wait">
        {currentStep === 0 && <StepWelcome onNext={next} />}
        {currentStep === 1 && (
          <StepWhoAreYou
            email={email}
            nickname={nickname}
            city={city}
            password={password}
            confirmPassword={confirmPassword}
            onEmail={setEmail}
            onNickname={setNickname}
            onCity={setCity}
            onPassword={setPassword}
            onConfirmPassword={setConfirmPassword}
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
            showIOSPrompt={isIOS && !isStandalone}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  )
}
