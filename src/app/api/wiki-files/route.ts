import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

/**
 * List all wiki markdown files.
 */
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    message: 'Wiki downloads',
    endpoints: {
      files: '/api/wiki-files/files',
      download: '/api/wiki-files/files/{filename}.md',
      'download_all': '/api/wiki-files/files/download.zip',
    },
  })
}
