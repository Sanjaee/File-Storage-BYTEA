import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { ToastProvider } from "@/components/ui/toast"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "PostgreSQL BYTEA File Storage | Intelligent Compression Engine",
  description:
    "Full-stack file storage system storing raw binaries directly in PostgreSQL BYTEA with Zstandard text compression, WebP image optimization, and SHA-256 deduplication.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark antialiased`}
    >
      <body className="min-h-screen bg-slate-950 text-slate-50 selection:bg-blue-600 selection:text-white flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
