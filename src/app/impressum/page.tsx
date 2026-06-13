// Impressum — required under §5 DDG for geschäftsmäßige Online-Dienste.
// NOTE: the postal address below is a placeholder. German law requires a
// ladungsfähige Anschrift (a real, summonable postal address — a virtual
// business address is fine, a PO box is not). Fill it in before launch.

export default function ImpressumPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-normal tracking-tight text-on-surface mb-2">Impressum</h1>
      <p className="text-sm text-on-surface-variant mb-10">Angaben gemäß § 5 DDG</p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Diensteanbieter</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Frederick Künstler<br />
          {/* TODO vor Launch: ladungsfähige Anschrift eintragen (Geschäftsadresse) */}
          [Anschrift folgt]<br />
          Deutschland
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Kontakt</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          E-Mail:{' '}
          <a href="mailto:contact@example.com" className="text-primary underline underline-offset-2">
            contact@example.com
          </a>
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Frederick Künstler (Anschrift wie oben)
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Haftung für Inhalte</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen
          Gesetzen verantwortlich. Für von Nutzerinnen und Nutzern eingestellte Inhalte (Seeds,
          Notizen, Artikel) sind wir nicht verpflichtet, übermittelte oder gespeicherte fremde
          Informationen zu überwachen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung
          von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Haftung für Links</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
          Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter
          oder Betreiber der Seiten verantwortlich.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-on-surface mb-3">Datenschutz</h2>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Informationen zur Verarbeitung personenbezogener Daten finden Sie in unserer{' '}
          <a href="/privacy" className="text-primary underline underline-offset-2">Datenschutzerklärung</a>.
        </p>
      </section>

      <div className="mt-12 pt-6 border-t border-outline-variant/20 flex gap-5">
        <a href="/" className="text-xs text-on-surface-variant/50 hover:text-on-surface-variant transition-colors">
          ← Zurück zu Greenplot
        </a>
        <a href="/privacy" className="text-xs text-on-surface-variant/50 hover:text-on-surface-variant transition-colors">
          Datenschutz
        </a>
      </div>
    </main>
  )
}
