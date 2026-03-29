import { useState } from 'react';

const INTERESTS = [
  { id: 'tech', label: 'Technology', icon: 'rocket_launch', selected: true },
  { id: 'business', label: 'Business trends', icon: 'trending_up', selected: false },
  { id: 'entrepreneurship', label: 'Entrepreneurship', icon: 'lightbulb', selected: true },
  { id: 'ai', label: 'AI', icon: 'memory', selected: false },
  { id: 'design', label: 'Design', icon: 'palette', selected: false },
  { id: 'productivity', label: 'Productivity', icon: 'bolt', selected: true },
  { id: 'learning', label: 'Learning', icon: 'menu_book', selected: false },
  { id: 'creativity', label: 'Creativity', icon: 'auto_awesome', selected: false },
];

export function WhatInterestsStep({ onNext }: { onNext: (interests: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>(
    INTERESTS.filter(i => i.selected).map(i => i.id)
  );
  const [custom, setCustom] = useState('');

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleNext = () => {
    onNext(selected);
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-center px-6 py-12 relative">
      {/* Atmospheric Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-20%] w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none" />
      {/* Progress Indicator */}
      <div className="w-full max-w-lg mb-12 flex flex-col gap-4">
        <div className="flex justify-between items-end">
          <span className="text-label-md font-bold uppercase tracking-[0.1em] text-on-surface-variant">Step 3 of 7</span>
          <span className="text-label-md font-bold text-primary">Cultivating Interests</span>
        </div>
        <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
          <div className="h-full w-[42.8%] bg-primary progress-glow rounded-full transition-all duration-700 ease-out" />
        </div>
      </div>
      <div className="w-full max-w-lg space-y-10 text-center">
        {/* Header Section */}
        <div className="w-full text-left mb-10">
          <h1 className="text-[2.5rem] leading-[1.1] font-extrabold tracking-[-0.04em] text-on-surface mb-4">
            What seeds should <br/> we plant?
          </h1>
          <p className="text-headline-sm text-on-surface-variant max-w-md leading-relaxed">
            Select topics that excite you to curate your digital garden.
          </p>
        </div>
        {/* Multi-select Chips Bento */}
        <div className="w-full flex flex-wrap gap-3 mb-8">
          {INTERESTS.map(interest => (
            <button
              key={interest.id}
              onClick={() => toggle(interest.id)}
              className={`flex items-center px-6 py-3.5 rounded-full font-bold text-sm transition-all active:scale-95 ${
                selected.includes(interest.id)
                  ? 'chip-selected'
                  : 'bg-surface-container hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined mr-2 text-[20px]">{interest.icon}</span>
              {interest.label}
            </button>
          ))}
        </div>
        {/* Custom Input Field */}
        <div className="w-full mb-12">
          <div className="group relative">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-outline">add_circle</span>
            </div>
            <input
              className="w-full bg-surface-container-highest border-none rounded-[1rem] py-5 pl-14 pr-6 text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary transition-all outline-none"
              placeholder="Add your own"
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </div>
        </div>
        {/* Sticky Bottom Action */}
        <div className="w-full flex items-center justify-between gap-6 pt-4 border-t border-outline-variant/10">
          <button className="text-on-surface-variant hover:text-on-surface font-bold text-sm tracking-wide uppercase px-4 transition-colors">
            Back
          </button>
          <button
            onClick={handleNext}
            className="flex-1 bg-gradient-to-br from-primary to-primary-container text-on-primary font-extrabold text-base py-5 px-8 rounded-full shadow-[0_12px_30px_-10px_rgba(105,246,184,0.4)] hover:shadow-[0_15px_40px_-10px_rgba(105,246,184,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            Continue
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>
    </main>
  );
}
