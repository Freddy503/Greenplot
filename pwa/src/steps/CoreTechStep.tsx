export function CoreTechStep() {
  return (
    <main className="pt-24 px-6 md:px-12 max-w-7xl mx-auto w-full">
      {/* Hero Section */}
      <section className="mb-16 mt-8">
        <div className="flex flex-col md:flex-row gap-12 items-center">
          <div className="flex-1 space-y-6 md:pr-12">
            <span className="bg-primary/20 text-primary px-6 py-2 rounded-full font-label text-sm font-semibold uppercase tracking-widest border border-primary/30">Core Architecture</span>
            <h1 className="text-6xl md:text-7xl font-headline font-extrabold tracking-tighter text-on-surface leading-[0.9]">
              The Living <span className="text-primary">Organism</span>
            </h1>
            <p className="text-xl text-on-surface-variant font-body leading-relaxed max-w-xl">
              Information isn't data—it's life. Seedify treats your second brain as a flourishing ecosystem that breathes, learns, and connects.
            </p>
          </div>
          <div className="flex-1 w-full aspect-square relative">
            <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl" />
            <img
              className="w-full h-full object-cover seed-shape shadow-2xl relative z-10 opacity-90 grayscale-[0.2]"
              alt="Abstract macro shot of vibrant green leaf veins mirroring neural networks"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBf4noKUjd8zMgYboO6Eg0YSTz7WvYKVqw4v5mIg20jvqKn4doDYdwziE_Rcl8gqSvkmcIiuN0NIsPZJfT2pLKiDjmjf-Us4VgL8uCB8wq_PJnpQ64Vlxfofb3BU2dix2_GqbiJ3cItSzGFIZSG_INAjU7E_tuKlW3IjNvVIPzr26kYLC-ycP_MNBU-HHlXGbXVLwpXAcoWQHe7oemDdn-3xwY35KAnXftmWLXi9h1kXXz6kqq1VW_B0CcrL9v6TcKJGCyl-c3zDSKB"
            />
          </div>
        </div>
      </section>
      {/* Auto-Sync Callout */}
      <section className="mb-16">
        <div className="bg-surface-container-high p-8 rounded-full border border-primary/20 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-on-secondary shrink-0">
            <span className="material-symbols-outlined text-3xl">sync_alt</span>
          </div>
          <p className="text-lg text-on-surface font-medium leading-relaxed">
            Seeds are automatically synced to memory, allowing both you and the AI to access them instantly and connect the dots across your entire knowledge base.
          </p>
        </div>
      </section>
      {/* Bento Grid: The Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-16">
        {/* Pillar 1: Vector Search and Knowledge Graphs */}
        <div className="md:col-span-7 bg-surface-container p-10 rounded-xl relative overflow-hidden flex flex-col justify-between group border border-outline-variant">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-on-secondary">
                <span className="material-symbols-outlined text-3xl">hub</span>
              </div>
              <h2 className="text-3xl font-headline font-bold text-on-surface tracking-tight">Search &amp; Graph</h2>
            </div>
            <h3 className="text-xl font-headline font-bold mb-4 text-primary">The Mycelium</h3>
            <p className="text-on-surface-variant leading-relaxed text-lg mb-8">
              Powered by <span className="text-on-surface font-semibold">Vector Search and Knowledge Graphs</span> and HNSW indexing, our search acts like fungal mycelium underground—sensing nutrients (meaning) before they even touch. It combines <span className="text-primary font-bold">semantic similarity</span> with structural relevance to find patterns that keywords miss.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 relative z-10">
            <div className="bg-surface p-6 rounded-lg border border-outline-variant">
              <span className="text-xs uppercase font-label tracking-widest text-on-surface-variant block mb-2">Vector Core</span>
              <p className="font-bold text-primary">Contextual Depth</p>
            </div>
            <div className="bg-surface p-6 rounded-lg border border-outline-variant">
              <span className="text-xs uppercase font-label tracking-widest text-on-surface-variant block mb-2">HNSW Engine</span>
              <p className="font-bold text-primary">Ultra-Fast Recall</p>
            </div>
          </div>
          {/* Decorative element */}
          <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
        </div>
        {/* Pillar 2: Web Enrichment */}
        <div className="md:col-span-5 bg-surface-container-high p-10 rounded-xl flex flex-col border border-outline-variant">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined text-3xl">eco</span>
            </div>
            <h2 className="text-3xl font-headline font-bold text-on-surface tracking-tight">Synthesis</h2>
          </div>
          <p className="text-on-surface-variant leading-relaxed mb-10">
            Your raw thoughts are seeds. We provide the water and light needed for them to thrive through synthesis.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-full bg-background border border-outline-variant">
              <span className="material-symbols-outlined text-secondary">travel_explore</span>
              <div>
                <p className="font-bold text-on-surface">Advanced Web Enrichment</p>
                <p className="text-sm text-on-surface-variant">Real-time nutrient fetching</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-full bg-background border border-outline-variant">
              <span className="material-symbols-outlined text-secondary">psychology</span>
              <div>
                <p className="font-bold text-on-surface">State-of-the-Art LLM</p>
                <p className="text-sm text-on-surface-variant">Super-powered knowledge distillation</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-full bg-background border border-outline-variant">
              <span className="material-symbols-outlined text-secondary">palette</span>
              <div>
                <p className="font-bold text-on-surface">AI Image Generation</p>
                <p className="text-sm text-on-surface-variant">Visualizing abstract concepts</p>
              </div>
            </div>
          </div>
        </div>
        {/* Pillar 3: Heartbeat */}
        <div className="md:col-span-12 bg-surface-container p-12 rounded-xl border border-outline-variant">
          <div className="flex flex-col md:flex-row gap-12 items-start">
            <div className="md:w-1/3">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-on-secondary">
                  <span className="material-symbols-outlined text-3xl">monitor_heart</span>
                </div>
                <h2 className="text-4xl font-headline font-extrabold text-on-surface tracking-tighter">Heartbeat</h2>
              </div>
              <p className="text-lg text-on-surface-variant font-body">
                The pulse of the garden. A rhythmic cycle of reflection and growth that ensures your digital garden never goes dormant.
              </p>
            </div>
            <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
              <div className="p-8 rounded-xl bg-background border border-outline-variant shadow-sm hover:border-primary/50 transition-colors">
                <h4 className="font-headline font-bold text-primary mb-2">Morning Spark</h4>
                <p className="text-sm text-on-surface-variant leading-relaxed">Daily mental activation based on recent inquiries.</p>
              </div>
              <div className="p-8 rounded-xl bg-background border border-outline-variant shadow-sm hover:border-primary/50 transition-colors">
                <h4 className="font-headline font-bold text-primary mb-2">Daily Briefing</h4>
                <p className="text-sm text-on-surface-variant leading-relaxed">A sunset review of what you planted throughout the day.</p>
              </div>
              <div className="p-8 rounded-xl bg-background border border-outline-variant shadow-sm hover:border-primary/50 transition-colors">
                <h4 className="font-headline font-bold text-primary mb-2">Weekly Review</h4>
                <p className="text-sm text-on-surface-variant leading-relaxed">Deep synthesis of the week's highest-priority themes.</p>
              </div>
              <div className="p-8 rounded-xl bg-background border border-outline-variant shadow-sm hover:border-primary/50 transition-colors">
                <h4 className="font-headline font-bold text-primary mb-2">Biweekly Challenge</h4>
                <p className="text-sm text-on-surface-variant leading-relaxed">AI-generated prompts to expand your garden boundaries.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Progress/Pulse Visualization */}
      <section className="mb-16">
        <div className="bg-surface-container-high p-12 rounded-xl text-center border border-outline-variant">
          <h3 className="text-2xl font-headline font-bold text-on-surface mb-8">Ecosystem Vitality</h3>
          <div className="max-w-2xl mx-auto space-y-8">
            <div>
              <div className="flex justify-between mb-3 px-2">
                <span className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Mycelium Density</span>
                <span className="font-bold text-secondary">84%</span>
              </div>
              <div className="h-3 w-full bg-background rounded-full overflow-hidden">
                <div className="h-full w-[84%] bg-gradient-to-r from-primary to-secondary rounded-full" />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-3 px-2">
                <span className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Photosynthesis Rate</span>
                <span className="font-bold text-secondary">62%</span>
              </div>
              <div className="h-3 w-full bg-background rounded-full overflow-hidden">
                <div className="h-full w-[62%] bg-gradient-to-r from-primary to-secondary rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Call to Action */}
      <section className="mb-24 flex flex-col md:flex-row items-center gap-12 bg-primary p-12 rounded-xl text-on-primary overflow-hidden relative">
        <div className="flex-1 z-10">
          <h2 className="text-4xl font-headline font-extrabold mb-4 tracking-tight">Ready to plant your first seed?</h2>
          <p className="text-lg opacity-90 mb-8 font-body">The Arboretum grows stronger with every thought you contribute. Start nurturing your second brain today.</p>
          <button className="bg-on-primary text-primary px-10 py-4 rounded-full font-headline font-bold text-lg hover:scale-105 transition-transform active:scale-95">
            Enter the Garden
          </button>
        </div>
        <div className="flex-1 relative z-10">
          <img
            className="w-full aspect-video object-cover seed-shape shadow-2xl grayscale-[0.3] brightness-75"
            alt="Lush private greenhouse filled with various exotic plants"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBR2DqVYoXaOaipdgURN8rDB1fRXx4cP0XueXDjwQ_ykWJZzycMiI4oNUKKh50ZX34OetTPS3vTEWW-QEJ0GyCcW0eVv8O35wuq5fVVva0QXNCHop6GrjVahjQt_AfDd6fkvAhr-1e57e0cRbIky9426va4x1imTInNc3ZYvQKDVeBqC2M9LQtEnxbUXs6as-xL9zbc-bKxx0VgoMmwmQ8Nsgle0til5z4xBzWqGDr_ydQ4jcP7Uqsw20CRZBqXUZcs-tO-Nxx8O3gz"
          />
        </div>
        {/* Decorative circle */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-background/20 rounded-full -mr-48 -mt-48 blur-3xl" />
      </section>
    </main>
  );
}
