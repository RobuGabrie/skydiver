"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface MockModeContextValue {
  isMockMode: boolean
  toggleMockMode: () => void
}

const MockModeContext = createContext<MockModeContextValue>({
  isMockMode: false,
  toggleMockMode: () => {},
})

export function MockModeProvider({ children }: { children: ReactNode }) {
  const [isMockMode, setIsMockMode] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("skydiver-mock-mode")
    if (stored === "true") setIsMockMode(true)
  }, [])

  function toggleMockMode() {
    setIsMockMode(prev => {
      const next = !prev
      localStorage.setItem("skydiver-mock-mode", String(next))
      return next
    })
  }

  return (
    <MockModeContext.Provider value={{ isMockMode, toggleMockMode }}>
      {children}
    </MockModeContext.Provider>
  )
}

export function useMockMode() {
  return useContext(MockModeContext)
}
