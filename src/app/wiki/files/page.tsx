'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'

interface WikiFile {
  title: string
  category: string
  summary: string
  filename: string
}

export default function WikiFilesPage() {
  const [files, setFiles] = useState<WikiFile[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/wiki-files')
      .then(r => r.json())
      .then(d => setFiles(d.files || []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [])

  const downloadFile = async (filename: string) => {
    setDownloading(filename)
    try {
      const res = await fetch(`/api/wiki-files/files/${encodeURIComponent(filename)}`)
      const data = await res.json()
      const blob = new Blob([data.content], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Fallback to backend API
      window.open(
        `${process.env.NEXT_PUBLIC_API_URL || 'https://api.greenplot.ink'}/api/v1/wiki-files/${filename}`,
        '_blank'
      )
    }
    setDownloading(null)
  }

  const downloadAll = () => {
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL || 'https://api.greenplot.ink'}/api/v1/wiki-files/all.zip`,
      '_blank'
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto pb-20">
        <section className="px-4 pt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-normal text-on-surface">
                Wiki <span className="text-primary">Files</span>
              </h1>
              <p className="text-sm text-on-surface-variant mt-1">
                Download your knowledge articles as markdown files
              </p>
            </div>
            <Button
              onClick={downloadAll}
              className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold text-sm px-4"
            >
              <span className="material-symbols-outlined text-lg mr-1">download</span>
              Download All (zip)
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
              <p className="mt-2 text-sm">Loading wiki files...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">folder_open</span>
              <p className="mt-4 text-sm">No wiki articles yet</p>
              <p className="text-xs mt-1">Articles will appear here once compiled</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-3 rounded-xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/20 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">
                      {file.title}
                    </p>
                    <p className="text-xs text-on-surface-variant/60 truncate">
                      {file.category} — {file.summary?.slice(0, 80) || 'No summary'}
                    </p>
                  </div>
                  <Button
                    onClick={() => downloadFile(file.filename)}
                    disabled={downloading === file.filename}
                    variant="outline"
                    className="rounded-full text-xs px-3 flex-shrink-0"
                  >
                    {downloading === file.filename ? (
                      <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm">download</span>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  )
}
