import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const res = await fetch('http://localhost:4001/health', { cache: 'no-store' })
    const text = await res.text()
    return new NextResponse(text, { status: res.status })
  } catch (err) {
    return new NextResponse('proxy error', { status: 502 })
  }
}
