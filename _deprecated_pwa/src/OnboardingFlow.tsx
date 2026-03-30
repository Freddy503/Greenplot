import { useState } from 'react';
import { WelcomeStep } from './steps/WelcomeStep';
import { WhoAreYouStep } from './steps/WhoAreYouStep';
import { WhatInterestsStep } from './steps/WhatInterestsStep';
import { CoreTechStep } from './steps/CoreTechStep';
import { NurtureFocusStep } from './steps/NurtureFocusStep';
import { PrivacyConsentStep } from './steps/PrivacyConsentStep';
import { ChatStep } from './steps/ChatStep';

interface OnboardingFlowProps {
  onLogout: () => void;
}

const STEPS = [
  'welcome',
  'who',
  'interests',
  'coretech',
  'nurture',
  'privacy',
  'chat',
] as const;

export function OnboardingFlow({ onLogout }: OnboardingFlowProps) {
  const [current, setCurrent] = useState<number>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('onboardingComplete') === 'true') {
      return STEPS.length - 1;
    }
    return 0;
  });

  const goToNext = (..._args: any[]) => {
    setCurrent((prev) => Math.min(prev + 1, STEPS.length - 1));
    if (current === STEPS.length - 2) {
      localStorage.setItem('onboardingComplete', 'true');
    }
  };

  const stepName = STEPS[current];

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      {stepName === 'welcome' && <WelcomeStep onNext={goToNext} />}
      {stepName === 'who' && <WhoAreYouStep onNext={goToNext} />}
      {stepName === 'interests' && <WhatInterestsStep onNext={goToNext} />}
      {stepName === 'coretech' && <CoreTechStep onNext={goToNext} />}
      {stepName === 'nurture' && <NurtureFocusStep onNext={goToNext} />}
      {stepName === 'privacy' && <PrivacyConsentStep onNext={goToNext} />}
      {stepName === 'chat' && <ChatStep onLogout={onLogout} />}
    </div>
  );
}
