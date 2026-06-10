'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Deterministic architecture-diagram renderer.
 *
 * The LLM generates Mermaid code (real text — always spelled correctly),
 * mermaid.js renders it to SVG client-side. Replaces BFL raster diagrams
 * for PRDs, where diffusion models garble labels and structure.
 */
export default function MermaidDiagram({ code, id }: { code: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'neutral',
          themeVariables: {
            primaryColor: '#eafaf0',
            primaryBorderColor: '#15803d',
            primaryTextColor: '#16150f',
            secondaryColor: '#f6f4ef',
            tertiaryColor: '#ffffff',
            lineColor: '#5f5d54',
            fontFamily: 'Sora, system-ui, sans-serif',
            fontSize: '13px',
          },
          flowchart: { curve: 'basis', padding: 12 },
        })
        const { svg } = await mermaid.render(`mmd-${id.replace(/[^a-zA-Z0-9]/g, '')}`, code)
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg
          const el = ref.current.querySelector('svg')
          if (el) { el.style.maxWidth = '100%'; el.style.height = 'auto' }
        }
      } catch {
        if (!cancelled) setError(true)
      }
    })()
    return () => { cancelled = true }
  }, [code, id])

  if (error) {
    return (
      <pre style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--ink-2)', background: 'var(--surface-sunk)', borderRadius: 12, padding: 14, overflowX: 'auto' }}>
        {code}
      </pre>
    )
  }
  return <div ref={ref} style={{ overflowX: 'auto', display: 'flex', justifyContent: 'center', padding: '8px 0' }} />
}
