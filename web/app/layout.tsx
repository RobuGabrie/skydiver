import type { Metadata } from "next"
import "./globals.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { MockModeProvider } from "@/lib/mock-context"

export const metadata: Metadata = {
  title: "Skydiver Monitor",
  description: "Real-time skydiver monitoring and AI safety analytics",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning />
      <body className="min-h-full bg-background">
        <ThemeProvider>
          <MockModeProvider>
          <TooltipProvider>
            <div className="flex h-screen overflow-hidden">
              <AppSidebar />
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </div>
          </TooltipProvider>
          </MockModeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
