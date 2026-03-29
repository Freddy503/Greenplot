import React from 'react';

export function WelcomeStep(props: any) {
  const { onNext } = props;

  return (
    <main className="flex-1 relative flex flex-col items-center justify-center px-6 pt-12 pb-24 overflow-hidden">
      {/* ... rest unchanged ... */}
  return (
    <main className="flex-1 relative flex flex-col items-center justify-center px-6 pt-12 pb-24 overflow-hidden">
      {/* Abstract Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary-container/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-5%] left-[-5%] w-[40%] h-[40%] bg-secondary/5 blur-[100px] rounded-full" />
      {/* Hero Section */}
      <div className="relative w-full max-w-lg z-10 flex flex-col items-center">
        {/* Branding Moment */}
        <div className="mb-12 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-6 outline outline-1 outline-outline-variant/20">
            <span className="material-symbols-outlined text-primary text-4xl">psychology</span>
          </div>
          <h1 className="text-on-surface font-headline text-[2.75rem] leading-[1.1] font-extrabold tracking-tight text-center mb-4">
            Welcome to your <span className="text-primary italic">creativity Brain</span>
          </h1>
          <p className="text-on-surface-variant font-body text-lg text-center max-w-[280px] leading-relaxed">
            Your personal, self-improving AI for creative thinking
          </p>
        </div>
        {/* Central Visual Anchor (The Seed) */}
        <div className="relative w-full aspect-square max-w-[340px] mb-12 flex items-center justify-center">
          <div className="absolute inset-0 border border-outline-variant/10 rounded-full animate-pulse" />
          <div className="absolute inset-8 border border-outline-variant/20 rounded-full" />
          <div className="relative z-20 w-[85%] h-[85%] rounded-full overflow-hidden seed-glow ring-4 ring-surface-container-highest">
            <img
              alt="Digital seed growth"
              className="w-full h-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAuTivNaOMy-skiWJknoebGQXi8nj8doNOu2znvZVbvpam5Hxv_RisE_QAFww-3MWQK70Z7txLtGWu6uFXlPPCeEaiHtoLMgBV268cNubjI-jkeTHXjjCkwQrl6Vv8kuks8CNA8xWm7ad5sHZIIPauxa0LFujtfixD9Z8Vot96homDIuRkLT7i2-7vkRkcAP8szi5r-_UmA_ZOxEZJNv3VoR5ZtjTHfrsq5A09nOBRhQHIMIH8QUoYiH8gXjsGBfN0NK9P_0QbHZ7Ha"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
          </div>
          <div className="absolute top-4 left-4 glass-surface p-3 rounded-full flex items-center gap-2 ring-1 ring-outline-variant/30">
            <span className="material-symbols-outlined text-primary text-sm">eco</span>
            <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface">Growth Active</span>
          </div>
          <div className="absolute bottom-10 right-0 glass-surface p-3 rounded-full flex items-center gap-2 ring-1 ring-outline-variant/30">
            <span className="material-symbols-outlined text-secondary text-sm">bolt</span>
            <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface">AI Synced</span>
          </div>
        </div>
        {/* CTA Section */}
        <div className="w-full space-y-4 px-4">
          <button onClick={onNext} className="w-full h-16 bg-secondary text-on-secondary font-headline font-bold text-lg rounded-full shadow-[0_12px_30px_-10px_rgba(248,160,16,0.4)] active:scale-95 transition-all flex items-center justify-center gap-3">
            Get Started
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <p className="text-on-surface-variant font-label text-[10px] uppercase tracking-[0.2em] text-center">
            Already a grower? <span className="text-primary font-bold">Sign In</span>
          </p>
        </div>
      </div>
    </main>
  );
}
