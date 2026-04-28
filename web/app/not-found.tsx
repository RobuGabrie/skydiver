import React from "react"

export default function NotFound() {
  return (
    <main style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: 24}}>
      <h1 style={{fontSize: 48, margin: 0}}>404</h1>
      <p style={{fontSize: 18, color: "#666", marginTop: 8}}>Page not found.</p>
    </main>
  )
}
