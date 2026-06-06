'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

export type Overlay = 'graph' | 'voice' | null

interface OverlayContextType {
  overlay: Overlay
  setOverlay: (o: Overlay) => void
}

const OverlayContext = createContext<OverlayContextType>({
  overlay: null,
  setOverlay: () => {},
})

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<Overlay>(null)
  return (
    <OverlayContext.Provider value={{ overlay, setOverlay }}>
      {children}
    </OverlayContext.Provider>
  )
}

export function useOverlay() {
  return useContext(OverlayContext)
}
