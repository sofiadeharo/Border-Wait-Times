import { NextResponse } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/predict/bota-wait-time`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Upstream API error')
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Prediction unavailable' }, { status: 503 })
  }
}
