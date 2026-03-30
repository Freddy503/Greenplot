import { useState } from 'react';

export function WhoAreYouStep(props: any) {
  const { onNext } = props;
  const [nickname, setNickname] = useState('');
  const [city, setCity] = useState('');

  // rest unchanged, just replace onNext calls with onNext({ nickname, city })

  return (
    <main className="flex-grow flex flex-col items-center justify-center px-6 py-12 relative">
      {/* Atmospheric Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-5%] left-[-5%] w-80 h-80 bg-secondary/5 rounded-full blur-[100px] pointer-events-none" />
      {/* Progress Indicator */}
      <div className="w-full max-w-md mb-12 flex flex-col items-center">
        <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden mb-3">
          <div className="h-full bg-gradient-to-r from-primary to-primary-container w-[28.5%]" />
        </div>
        <span className="text-on-surface-variant font-label text-[10px] tracking-[0.2em] uppercase font-bold">Step 2 of 7</span>
      </div>
      <div className="w-full max-w-lg space-y-10 text-center">
        {/* Header Section */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-headline font-extrabold tracking-tight leading-tight text-on-surface">
            Tell us about your roots
          </h1>
          <p className="text-on-surface-variant text-lg max-w-xs mx-auto leading-relaxed">
            Every garden needs a keeper. Choose a name that reflects your digital presence.
          </p>
        </div>
        {/* Avatar Upload Section */}
        <div className="relative group mx-auto w-40 h-40">
          <div className="absolute inset-0 bg-primary/20 blur-2xl group-hover:bg-primary/30 transition-all duration-500 rounded-full" />
          <div className="relative w-full h-full bg-surface-container-high seed-shape flex items-center justify-center border border-outline-variant/20 hover:border-primary/40 transition-colors cursor-pointer overflow-hidden">
            <img
              alt="Abstract organic green texture"
              className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-700"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDN8dlkB7DnCPHdg9hBOZugjmIpGxpG6A3GrxfkQrIjWohuOQ0WRY_Na7am7rjLHazcxpYW4U60VNzYj9fAwoMPRmg11NuSaIg0MN-gLbQyTbTwvigBDzk_5aAbXTRQ_bNmUNirCRD_y2K52wxH35dJNGuXJvG_nDIXgf4kd_U1qHExoEvZGbHSiEn66X2wIMWXvS6DSehZafQNvtzZxf_vm-FN5PDBfpSEpBZhhiksnnA8qXVP7bwFzMUgrED2_BXlG_KN0tXgrBDc"
            />
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-300">
                <span className="material-symbols-outlined text-3xl">photo_camera</span>
              </div>
            </div>
          </div>
          {/* Mini floating badge */}
          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-secondary rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-on-secondary text-xl">add</span>
          </div>
        </div>
        {/* Form Section */}
        <div className="space-y-6 text-left max-w-sm mx-auto">
          <div className="space-y-2">
            <label className="block font-label text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant ml-4">Nickname</label>
            <div className="relative group">
              <input
                className="w-full bg-surface-container-highest border-none rounded-xl px-6 py-4 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary transition-all"
                placeholder="Seedling_42"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
              <div className="absolute inset-y-0 right-4 flex items-center text-primary/40">
                <span className="material-symbols-outlined">face</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block font-label text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant ml-4">City (Optional)</label>
            <div className="relative group">
              <input
                className="w-full bg-surface-container-highest border-none rounded-xl px-6 py-4 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary transition-all"
                placeholder="The Digital Valley"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <div className="absolute inset-y-0 right-4 flex items-center text-primary/40">
                <span className="material-symbols-outlined">location_on</span>
              </div>
            </div>
          </div>
        </div>
        {/* Action Button */}
        <div className="pt-8">
          <button
            onClick={() => onNext({ nickname, city })}
            className="w-full max-w-xs mx-auto group relative flex items-center justify-center gap-3 bg-gradient-to-br from-primary to-primary-container text-on-primary font-headline font-bold py-5 rounded-full shadow-[0_10px_40px_-10px_rgba(105,246,184,0.3)] hover:shadow-[0_15px_50px_-10px_rgba(105,246,184,0.5)] active:scale-95 transition-all duration-300"
          >
            <span className="text-lg">Next</span>
            <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">arrow_forward</span>
          </button>
        </div>
      </div>
    </main>
  );
}
