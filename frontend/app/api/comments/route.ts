import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('blog_post_slug')
    if (!slug) {
      return NextResponse.json({ error: 'blog_post_slug is required' }, { status: 400 })
    }

    const url = new URL(`${API_URL}/comments`)
    url.searchParams.set('blog_post_slug', slug)

    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) throw new Error('Upstream API error')
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(`${API_URL}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }
}
