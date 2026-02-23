import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  return proxy(req, params)
}
export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  return proxy(req, params)
}
export async function PUT(req: Request, { params }: { params: { path: string[] } }) {
  return proxy(req, params)
}
export async function DELETE(req: Request, { params }: { params: { path: string[] } }) {
  return proxy(req, params)
}

async function proxy(req: Request, params: { path: string[] }) {
  try {
    const path = params.path.join('/')
    const url = `http://localhost:4001/${path}`
    const init: RequestInit = {
      method: req.method,
      headers: Object.fromEntries(req.headers),
      body: ['GET','HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
      // no-cache to ensure fresh
      cache: 'no-store' as RequestCache,
    }
    const res = await fetch(url, init)
    const body = await res.arrayBuffer()
    const headers = new Headers(res.headers)
    // strip hop-by-hop headers
    headers.delete('transfer-encoding')
    return new NextResponse(Buffer.from(body), { status: res.status, headers })
  } catch (err) {
    return new NextResponse('proxy error', { status: 502 })
  }
}
