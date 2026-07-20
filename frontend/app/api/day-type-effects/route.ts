import { NextResponse } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/day-type-effects`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Upstream API error')
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }
}
