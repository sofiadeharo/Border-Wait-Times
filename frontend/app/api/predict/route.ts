import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export async function GET(request: NextRequest) {
  // Extract the search parameters from the incoming request URL.
  // This will be something like "?date=2023-10-27&hour=14&es_ready_lane=0"
  const { search } = new URL(request.url)

  try {
    // Forward the request and its query parameters to the backend /predict endpoint.
    const res = await fetch(`${API_URL}/predict${search}`, {
      cache: 'no-store', // Predictions should not be cached.
    })

    // If the backend API returns an error, forward the error message and status.
    if (!res.ok) {
      const errorData = await res.json()
      return NextResponse.json(
        { detail: errorData.detail || 'Upstream API error' },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error connecting to backend API:', error)
    return NextResponse.json({ detail: 'Prediction service unavailable' }, { status: 503 })
  }
}
