import { useState } from 'react';

export function PrivacyConsentStep(props: any) {
  const { onNext } = props;
  const [consent, setConsent] = useState(false);
  // rest unchanged

  return (
    <main className="flex-grow flex flex-col items-center justify-center px-8 py-12 max-w-2xl mx-auto w-full relative">
      {/* Visual Embellishments */}
      <div className="fixed -bottom-24 -left-24 w-64 h-64 bg-primary-container/20 rounded-full blur-[100px] -z-10" />
      <div className="fixed top-20 -right-20 w-80 h-80 bg-tertiary-container/10 rounded-full blur-[120px] -z-10" />
      <div className="fixed bottom-12 right-12 w-32 h-32 opacity-20 -z-10 overflow-hidden rounded-full border-2 border-primary/30">
        <img
          alt="Monstera leaf"
          className="w-full h-full object-cover"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAC_i4gF43lY73jsJE-_WUcds3aUIhqZkqexxKbRlhCT4p8FAB0aoXmPQxRfNw9ztvKj1d68toXWgb1vE1qFGzvojDt8vecZ5ZquaIVh6Q577vONZeTOlf-QRS8UPaoY7IuYLDj4faHOHDDyrNW9i-6dWtgMDBiekM4Ii_YHb9II-Iwb-RI4AfwRPWUQoPNmMHoL7P50r8NTKE-Zp38CTIJbMIQEUTbZvALR3TBi6XKP1z1mov6lSKblTCn5XzjnsaH6vAr5PRvf5wU"
        />
      </div>
      {/* Progress Indicator */}
      <div className="w-full max-w-xs mb-16">
        <div className="h-3 w-full bg-surface-variant rounded-full overflow-hidden">
          <div className="h-full w-[85%] bg-gradient-to-r from-primary to-primary-container rounded-full" />
        </div>
        <p className="text-on-surface-variant font-label text-[11px] uppercase tracking-widest mt-4 text-center">Step 6 of 7 • Nurturing Growth</p>
      </div>
      {/* Hero Motif */}
      <div className="relative mb-12">
        <div className="w-32 h-32 seed-shape bg-secondary-container flex items-center justify-center">
          <span className="material-symbols-outlined text-5xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>psychology_alt</span>
        </div>
        <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>thumb_up</span>
        </div>
      </div>
      {/* Content Section */}
      <div className="text-center mb-12">
        <h1 className="font-headline text-4xl md:text-5xl font-extrabold text-primary tracking-tight mb-6 leading-tight">
          Help make Seedify smarter?
        </h1>
        <p className="text-on-surface-variant text-lg leading-relaxed max-w-md mx-auto">
          Your feedback (thumbs up/down) can be used to improve the system for everyone. You can opt in or out later in Settings.
        </p>
      </div>
      {/* Interaction Card */}
      <div className="w-full bg-surface-container-low rounded-xl p-8 mb-12">
        <div className="flex items-center justify-between gap-6">
          <div className="flex-grow">
            <h3 className="font-headline text-lg font-bold text-on-surface mb-1">Feedback Contribution</h3>
            <p className="text-sm text-on-surface-variant">Yes, contribute my feedback</p>
          </div>
          {/* Custom Toggle Switch */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-14 h-8 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>
      </div>
      {/* Privacy Assurance */}
      <div className="flex items-start gap-4 bg-surface-container-highest/30 p-6 rounded-lg mb-16 w-full">
        <span className="material-symbols-outlined shrink-0 text-tertiary-container">warning</span>
        <p className="text-sm text-on-surface-variant leading-snug">
          Data is not anonymized before processing. Don't input any sensitive information. It should be about your productivity.
        </p>
      </div>
      {/* CTA Action */}
      <div className="w-full flex flex-col gap-4">
        <button
          onClick={() => onNext(consent)}
          className="w-full py-5 bg-tertiary-container text-on-tertiary-container font-headline font-bold text-lg rounded-full shadow-xl shadow-tertiary-container/20"
        >
          Next
        </button>
        <button className="w-full py-4 text-primary font-headline font-semibold text-sm hover:underline">
          Learn more about our training data
        </button>
      </div>
    </main>
  );
}
