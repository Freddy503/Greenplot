export function NurtureFocusStep(props: any) {
  const { onNext } = props;
  // We'll just call onNext() with no args, placeholder
  // For MVP, we'll just allow proceeding without actual selection (placeholder)
  return (
    <main className="flex-grow flex flex-col px-6 md:px-12 pt-12 pb-24 max-w-2xl mx-auto w-full relative">
      {/* Fixed background glows */}
      <div className="fixed top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 blur-[120px] -z-10 rounded-full" />
      <div className="fixed bottom-[-5%] left-[-10%] w-[600px] h-[600px] bg-tertiary/5 blur-[150px] -z-10 rounded-full" />
      {/* Header Section */}
      <header className="mb-12">
        <div className="h-2 flex-grow bg-surface-container rounded-full overflow-hidden mb-3">
          <div className="h-full w-5/5 bg-primary rounded-full" />
        </div>
        <span className="text-sm text-primary font-bold">5/7</span>
        <h1 className="font-headline text-5xl font-extrabold tracking-tight mb-4">
          Nurture your <span className="text-primary italic">focus.</span>
        </h1>
        <p className="text-lg text-slate-400 leading-relaxed">
          Choose how often you'd like your Seedify digest to arrive in your garden.
        </p>
      </header>
      {/* Placeholder: we could add radio cards like earlier but skip for MVP */}
      <div className="mb-12 p-6 bg-surface-container rounded-xl text-center">
        <p className="text-on-surface-variant">Frequency selection is not implemented for this demo.</p>
      </div>
      {/* Sticky Bottom Action */}
      <div className="mt-auto pt-8">
        <button
          onClick={onNext}
          className="w-full py-5 bg-primary text-on-primary font-headline font-bold text-xl rounded-xl shadow-[0_12px_30px_-10px_rgba(105,246,184,0.4)] hover:shadow-[0_15px_40px_-10px_rgba(105,246,184,0.6)] active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          Next
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    </main>
  );
}
