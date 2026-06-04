export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-normal tracking-tight text-on-surface mb-2">Privacy Policy</h1>
      <p className="text-sm text-on-surface-variant mb-10">Last updated: June 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">What we collect</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Seedify collects your email address, password hash, and the content you choose to save
          (ideas, notes, links, and voice transcriptions). We also store derived data such as
          AI-generated summaries, entity extractions, and knowledge graph connections. Usage metrics
          (token counts, request timestamps) are collected to enforce service limits.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">How we use it</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Your data is used exclusively to provide the Seedify service to you: enriching your
          ideas, generating wiki articles, and sending daily briefings. We do not sell your data,
          use it to train shared AI models, or share it with third parties except the services
          listed below that are necessary to operate the product.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Third-party services</h2>
        <ul className="text-sm text-on-surface-variant space-y-2 list-disc pl-5">
          <li><strong>OpenRouter</strong> — LLM inference for chat, enrichment, and wiki synthesis. Your content is processed per their privacy policy.</li>
          <li><strong>Exa</strong> — Web search and content fetching when you use the web search tool.</li>
          <li><strong>Resend</strong> — Transactional email for daily briefings and invite links.</li>
          <li><strong>Google</strong> — Optional Calendar integration (OAuth, access token stored encrypted).</li>
          <li><strong>Sentry</strong> — Error monitoring. Stack traces may include request metadata but not message content.</li>
        </ul>
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
          If you are in the European Economic Area, you have the right to:
        </p>
        <ul className="text-sm text-on-surface-variant space-y-1 list-disc pl-5">
          <li>Access all data we hold about you — use <strong>Settings → Export my data</strong></li>
          <li>Correct inaccurate data — edit your profile in Settings</li>
          <li>Delete your account and all associated data — use <strong>Settings → Delete account</strong></li>
          <li>Object to processing — contact us at the address below</li>
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

      <div className="mt-12 pt-6 border-t border-outline-variant/20">
        <a href="/" className="text-xs text-on-surface-variant/50 hover:text-on-surface-variant transition-colors">
          ← Back to Seedify
        </a>
      </div>
    </main>
  )
}
