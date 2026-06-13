export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-normal tracking-tight text-on-surface mb-2">Privacy Policy</h1>
      <p className="text-sm text-on-surface-variant mb-10">Datenschutzerklärung · Last updated: June 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Controller</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Frederick Künstler (see <a href="/impressum" className="text-primary underline underline-offset-2">Impressum</a>) is
          the controller (Verantwortlicher, Art. 4 No. 7 GDPR) for data processed by Greenplot.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">What we collect</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Greenplot collects your email address, password hash, profile details you provide
          (nickname, city, interests, briefing cadence, consents), and the content you choose to
          save (ideas, notes, links, research papers, and voice transcriptions). We also store
          derived data such as AI-generated summaries, entity extractions, and knowledge-graph
          connections, plus usage metrics (token counts, request timestamps) to enforce service
          limits. If you enable push notifications, we store your push subscription. If you connect
          GitHub or Google Calendar, we store the access tokens encrypted.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">How we use it</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Your data is used exclusively to provide the Greenplot service to you: enriching your
          ideas, generating wiki articles and specs, and sending briefings — based on your account
          (Art. 6(1)(b) GDPR) and the consents you chose during onboarding (Art. 6(1)(a), revocable
          anytime in Settings). We do not sell your data, use it to train shared AI models, or
          share it with third parties except the processors listed below that are necessary to
          operate the product.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Processors &amp; third-party services</h2>
        <ul className="text-sm text-on-surface-variant space-y-2 list-disc pl-5">
          <li><strong>Hetzner</strong> (Germany) — hosting of the backend, database, and vector store.</li>
          <li><strong>Vercel</strong> (USA) — hosting and delivery of the web app.</li>
          <li><strong>Cloudflare</strong> (USA) — network routing and DDoS protection in front of the API.</li>
          <li><strong>OpenRouter / model providers</strong> (USA) — LLM inference for chat, enrichment, and wiki synthesis. Content you submit is processed to generate responses.</li>
          <li><strong>OpenAI</strong> (USA) — voice transcription (Whisper) and image understanding when you use those features.</li>
          <li><strong>Black Forest Labs</strong> — image generation for moodboards when you request it.</li>
          <li><strong>Exa</strong> (USA) — web search and content fetching when you use the web-search tool.</li>
          <li><strong>Resend</strong> (USA) — transactional email for briefings and invites.</li>
          <li><strong>Google</strong> (USA) — optional Calendar integration (OAuth; token stored encrypted) and weather/context lookups.</li>
          <li><strong>GitHub</strong> (USA) — optional repo connection for shipping specs (token stored encrypted).</li>
          <li><strong>Sentry</strong> (USA) — error monitoring. Stack traces may include request metadata but not message content.</li>
          <li><strong>Buy Me a Coffee</strong> — voluntary donations are processed entirely on their platform under their own privacy policy; we receive no payment data.</li>
        </ul>
        <p className="text-sm text-on-surface-variant leading-relaxed mt-3">
          Where providers process data outside the EEA, transfers rely on the EU–US Data Privacy
          Framework and/or EU Standard Contractual Clauses (Art. 46 GDPR).
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Data retention</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Your data is retained as long as your account is active. You can delete your account at
          any time from Settings → Account, which permanently removes all your data from our
          systems including the vector database.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Your rights (GDPR)</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed mb-3">
          You have the right to:
        </p>
        <ul className="text-sm text-on-surface-variant space-y-1 list-disc pl-5">
          <li>Access all data we hold about you (Art. 15) — use <strong>Settings → Export my data</strong></li>
          <li>Correct inaccurate data (Art. 16) — edit your profile in Settings</li>
          <li>Delete your account and all associated data (Art. 17) — use <strong>Settings → Delete account</strong></li>
          <li>Withdraw consents (Art. 7(3)) — toggle them in Settings, effective for the future</li>
          <li>Data portability (Art. 20) — the export above is machine-readable JSON</li>
          <li>Object to processing (Art. 21) — contact us at the address below</li>
          <li>Lodge a complaint with a supervisory authority (Art. 77) — e.g. your local Landesdatenschutzbehörde</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Contact</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          For privacy questions or data requests, email{' '}
          <a href="mailto:contact@example.com" className="text-primary underline underline-offset-2">
            contact@example.com
          </a>
          .
        </p>
      </section>

      <div className="mt-12 pt-6 border-t border-outline-variant/20 flex gap-5">
        <a href="/" className="text-xs text-on-surface-variant/50 hover:text-on-surface-variant transition-colors">
          ← Back to Greenplot
        </a>
        <a href="/impressum" className="text-xs text-on-surface-variant/50 hover:text-on-surface-variant transition-colors">
          Impressum
        </a>
      </div>
    </main>
  )
}
