'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'

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

// ── Progress Bar ──────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const pct = ((step + 1) / TOTAL_STEPS) * 100
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-8">
      <div className="h-1 w-48 rounded-full overflow-hidden bg-primary/15">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/0"
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
    <p className="text-xs tracking-wide mb-8 font-medium text-on-surface-variant/60">
      Step {step + 1}/{TOTAL_STEPS}
    </p>
  )
}

// ── Amber CTA Button ──────────────────────────────────

function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full py-5 px-10 rounded-full font-bold text-lg h-auto bg-secondary text-on-secondary hover:bg-secondary/90 shadow-[0_8px_32px_rgba(248,160,16,0.20)] active:scale-[0.97] transition-transform"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <Spinner className="text-on-secondary" />
          Setting up your garden…
        </span>
      ) : (
        children
      )}
    </Button>
  )
}

// ── STEP 0: Welcome ───────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <StepShell step={0}>
      {/* Decorative bg blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute rounded-full w-[300px] h-[300px] bg-primary opacity-[0.05] -top-[5%] -left-[10%] blur-[80px]" />
        <div className="absolute rounded-full w-[200px] h-[200px] bg-secondary opacity-[0.04] bottom-[15%] -right-[8%] blur-[60px]" />
      </div>

      <StepLabel step={0} />

      {/* Seed motif */}
      <div className="relative mb-10">
        <div className="w-56 h-72 rounded-full flex items-center justify-center relative overflow-hidden bg-surface-container">
          <div className="absolute glass-morphism rounded-full w-16 h-16 top-[12%] right-[10%] flex items-center justify-center">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: 24, fontVariationSettings: '"FILL" 1' }}
            >
              eco
            </span>
          </div>
          <div className="absolute rounded-full w-12 h-12 bg-primary/15 backdrop-blur-sm border border-primary/30 bottom-[15%] left-[10%]" />
          <span
            className="material-symbols-outlined text-primary relative z-10"
            style={{ fontSize: 72, fontVariationSettings: '"FILL" 1' }}
          >
            forest
          </span>
        </div>
      </div>

      <div className="text-center mb-10">
        <h1 className="text-5xl font-extrabold tracking-tighter leading-[1.1] mb-6 text-on-surface">
          Welcome to{'\n'}Greenplot
        </h1>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto text-on-surface-variant">
          Your personal AI agent for creative thinking.
          Information as living matter, nurtured to help you grow.
        </p>
      </div>

      <PrimaryButton onClick={onNext}>Get Started</PrimaryButton>

      <p className="mt-6 text-xs flex items-center gap-2 font-medium text-on-surface-variant/60">
        <span className="w-2 h-2 rounded-full bg-primary" />
        Version 1.0 — Built for growers
      </p>
    </StepShell>
  )
}

// ── STEP 1: Who Are You ───────────────────────────────

function StepWhoAreYou({
  nickname,
  city,
  password,
  confirmPassword,
  onNickname,
  onCity,
  onPassword,
  onConfirmPassword,
  onNext,
  onLogin,
}: {
  nickname: string
  city: string
  password: string
  confirmPassword: string
  onNickname: (v: string) => void
  onCity: (v: string) => void
  onPassword: (v: string) => void
  onConfirmPassword: (v: string) => void
  onNext: () => void
  onLogin: () => void
}) {
  const passwordsMatch = password === confirmPassword
  const passwordValid = password.length >= 6
  const canProceed = nickname.trim() && passwordValid && passwordsMatch

  return (
    <StepShell step={1}>
      <StepLabel step={1} />

      <div className="text-center mb-10">
        <h2 className="text-3xl font-extrabold tracking-tight mb-3 text-on-surface">
          Tell us about your roots
        </h2>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto text-on-surface-variant">
          Every garden needs a keeper. Choose a name that reflects your digital presence.
        </p>
      </div>

      <div className="w-full space-y-4 mb-10">
        <div>
          <Label className="text-xs font-bold mb-2 pl-1 uppercase tracking-wider text-primary block">
            Nickname
          </Label>
          <Input
            type="text"
            value={nickname}
            onChange={(e) => onNickname(e.target.value)}
            placeholder="Seedling_42"
            autoFocus
            className="w-full px-5 py-4 rounded-full text-base h-auto bg-surface-container-highest text-on-surface border-0 placeholder:text-on-surface-variant/40 focus-visible:ring-primary/50"
          />
        </div>
        <div>
          <Label className="text-xs font-bold mb-2 pl-1 uppercase tracking-wider text-primary block">
            Password
          </Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            placeholder="Min. 6 characters"
            className="w-full px-5 py-4 rounded-full text-base h-auto bg-surface-container-highest text-on-surface border-0 placeholder:text-on-surface-variant/40 focus-visible:ring-primary/50"
          />
          {password.length > 0 && !passwordValid && (
            <p className="text-xs mt-1 pl-1 text-error">At least 6 characters</p>
          )}
        </div>
        <div>
          <Label className="text-xs font-bold mb-2 pl-1 uppercase tracking-wider text-primary block">
            Confirm Password
          </Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => onConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            className="w-full px-5 py-4 rounded-full text-base h-auto bg-surface-container-highest text-on-surface border-0 placeholder:text-on-surface-variant/40 focus-visible:ring-primary/50"
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs mt-1 pl-1 text-error">Passwords don't match</p>
          )}
        </div>
        <div>
          <Label className="text-xs font-bold mb-2 pl-1 uppercase tracking-wider text-primary block">
            City{' '}
            <span className="text-on-surface-variant/50 normal-case tracking-normal font-medium">
              (Optional)
            </span>
          </Label>
          <Input
            type="text"
            value={city}
            onChange={(e) => onCity(e.target.value)}
            placeholder="The Digital Valley"
            className="w-full px-5 py-4 rounded-full text-base h-auto bg-surface-container-highest text-on-surface border-0 placeholder:text-on-surface-variant/40 focus-visible:ring-primary/50"
          />
        </div>
      </div>

      <PrimaryButton onClick={onNext} disabled={!canProceed}>
        Next
      </PrimaryButton>

      <Button
        variant="link"
        onClick={onLogin}
        className="mt-5 text-sm font-medium text-primary"
      >
        Already have an account? Log In
      </Button>
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
        <h2 className="text-3xl font-extrabold tracking-tight mb-3 text-on-surface">
          Cultivating Interests
        </h2>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto text-on-surface-variant">
          What seeds should we plant?
        </p>
      </div>

      {/* Pill chips using Badge */}
      <div className="flex flex-wrap gap-3 justify-center mb-8">
        {INTEREST_OPTIONS.map((interest) => {
          const isSelected = selected.includes(interest)
          return (
            <div
              key={interest}
              onClick={() => onToggle(interest)}
              className="cursor-pointer transition-all active:scale-95"
            >
              <Badge
                variant={isSelected ? 'default' : 'outline'}
                className={`
                  cursor-pointer px-5 py-2.5 rounded-full text-sm font-medium h-auto
                  ${isSelected
                    ? 'bg-primary text-on-primary border-0 hover:bg-primary/90'
                    : 'bg-surface-container text-on-surface-variant border-outline-variant/20 hover:bg-surface-container-high'
                  }
                `}
              >
                {interest}
              </Badge>
            </div>
          )
        })}
      </div>

      {/* Custom interest input */}
      <div className="w-full mb-10">
        <Input
          type="text"
          value={custom}
          onChange={(e) => onCustom(e.target.value)}
          placeholder="Add your own…"
          className="w-full px-5 py-4 rounded-full text-base h-auto bg-surface-container-highest text-on-surface border-0 placeholder:text-on-surface-variant/40 focus-visible:ring-primary/50"
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
        <h2 className="text-3xl font-extrabold tracking-tight mb-3 text-on-surface">
          Nurture your focus.
        </h2>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto text-on-surface-variant">
          Choose your harvest frequency. Adjust how often you want to collect your yields.
        </p>
      </div>

      {/* Radio cards */}
      <div className="w-full space-y-3 mb-6">
        {DIGEST_OPTIONS.map((opt) => {
          const isSelected = frequency === opt.value
          return (
            <Button
              key={opt.value}
              variant="outline"
              onClick={() => onFrequency(opt.value)}
              className={`
                w-full flex items-center gap-4 px-5 py-4 rounded-full h-auto text-left justify-start
                transition-all active:scale-[0.98]
                ${isSelected
                  ? 'bg-primary/10 border-primary text-on-surface'
                  : 'bg-surface-container border-outline-variant/20 text-on-surface'
                }
              `}
            >
              {/* Radio dot */}
              <div
                className={`
                  w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all border-2
                  ${isSelected ? 'border-secondary bg-secondary' : 'border-on-surface-variant/50 bg-transparent'}
                `}
              >
                {isSelected && <div className="w-2 h-2 rounded-full bg-on-secondary" />}
              </div>
              <div className="flex flex-col items-start">
                <p className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                  {opt.label}
                </p>
                <p className="text-xs font-medium mt-0.5 text-on-surface-variant">
                  {opt.sublabel}
                </p>
              </div>
            </Button>
          )
        })}
      </div>

      {/* Time setting */}
      <div className="w-full rounded-full px-5 py-4 mb-2 flex items-center justify-between bg-surface-container border border-outline-variant/20">
        <div>
          <p className="text-xs font-medium text-on-surface-variant">Time</p>
          <p className="text-lg font-bold text-on-surface">09:00 AM</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/12 text-primary border border-primary/20 hover:bg-primary/20"
        >
          Edit
        </Button>
      </div>

      <p className="text-xs text-center mb-6 text-on-surface-variant/60">
        Local time based on your current region.
      </p>

      <PrimaryButton onClick={onNext}>Next →</PrimaryButton>

      <p className="mt-4 text-xs text-center text-on-surface-variant/50">
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
        <h2 className="text-3xl font-extrabold tracking-tight mb-3 text-on-surface">
          The Living Intelligence
        </h2>
        <p className="text-sm font-medium leading-relaxed max-w-xs mx-auto text-on-surface-variant">
          Experience how your digital greenhouse breathes, learns, and connects.
        </p>
      </div>

      {/* Bento grid 2x2 */}
      <div className="grid grid-cols-2 gap-3 w-full mb-8">
        {BENTO_CARDS.map((card) => (
          <div
            key={card.title}
            className="flex flex-col gap-2.5 p-5 rounded-2xl relative overflow-hidden bg-surface-container"
          >
            <div className="absolute w-16 h-16 rounded-full -top-4 -right-4 pointer-events-none bg-primary opacity-[0.06]" />
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
      <div className="w-full rounded-full px-5 py-3 mb-8 text-center bg-primary/8 border border-primary/15">
        <p className="text-xs font-medium leading-relaxed text-on-surface-variant">
          Seeds auto-sync to memory — no manual saving required.
        </p>
      </div>

      {error && (
        <div className="w-full rounded-full px-5 py-3 mb-4 text-sm font-medium bg-error/10 text-error">
          {error}
        </div>
      )}

      <PrimaryButton onClick={onEnter} loading={loading}>
        Enter the Garden
      </PrimaryButton>

      <p className="mt-4 text-xs text-center font-medium text-on-surface-variant/50">
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
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 pb-8 relative overflow-hidden bg-background">
      {/* Global background glow */}
      <div className="absolute rounded-full pointer-events-none w-[500px] h-[500px] bg-primary opacity-[0.03] top-[10%] left-1/2 -translate-x-1/2 blur-[120px]" />

      <div className="w-full max-w-sm relative z-10">
        <AnimatePresence mode="wait">
          {currentStep === 0 && <StepWelcome onNext={next} />}

          {currentStep === 1 && (
            <StepWhoAreYou
              nickname={nickname}
              city={city}
              password={password}
              confirmPassword={confirmPassword}
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
            />
          )}
        </AnimatePresence>
      </div>

      <ProgressBar step={currentStep} />
    </div>
  )
}
