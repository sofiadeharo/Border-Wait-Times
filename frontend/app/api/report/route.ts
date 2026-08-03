import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Forward the POST request to the backend's user-report endpoint
    const res = await fetch(`${API_URL}/wait-times/user-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward client IP if available for rate limiting on the backend
        'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
        'x-real-ip': request.headers.get('x-real-ip') ?? '',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ detail: data.detail || 'Upstream API error' }, { status: res.status })
    }

    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error connecting to backend API for reporting:', error)
    return NextResponse.json({ detail: 'Report submission service unavailable' }, { status: 503 })
  }
}