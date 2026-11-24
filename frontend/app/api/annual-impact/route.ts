import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

// Proxies the backend's annual compound-loss calculation (BOTA passenger vehicles).
export async function GET(request: NextRequest) {
  const { search } = new URL(request.url)
  try {
    const res = await fetch(`${API_URL}/economic-impact/annual${search}`, { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ detail: data.detail || 'Upstream API error' }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error connecting to backend API:', error)
    return NextResponse.json({ detail: 'Annual impact service unavailable' }, { status: 503 })
  }
}
