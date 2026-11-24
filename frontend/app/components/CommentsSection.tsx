'use client'

import { useState } from 'react'

interface Comment {
  name: string
  text: string
  postedAt: string
}

// LAYOUT/ACTION: seed comments shown on first load. Replace with a real fetch
// once this is wired to a backend — see the note above `addComment` below.
const SEED_COMMENTS: Comment[] = [
  {
    name: 'Maria G.',
    text: 'This has saved me so much time crossing at BOTA in the mornings!',
    postedAt: 'a few days ago',
  },
  {
    name: 'Carlos R.',
    text: 'Would love to see the pedestrian lanes broken out a bit more clearly.',
    postedAt: 'last week',
  },
]

// LAYOUT: comments card — same `.card` style as the rest of the site.
// ACTION: this is a UI preview only. `comments` lives in local component state, so it
// resets on refresh — nothing is sent to a server. To make it real: POST to a new API
// route backed by a database table, and fetch the list here instead of using SEED_COMMENTS.
export default function CommentsSection() {
  const [comments, setComments] = useState<Comment[]>(SEED_COMMENTS)
  const [name, setName] = useState('')
  const [text, setText] = useState('')

  // ACTION: appends the new comment to local state and clears the textarea.
  const addComment = () => {
    if (!text.trim()) return
    setComments((prev) => [
      ...prev,
      { name: name.trim() || 'Anonymous', text: text.trim(), postedAt: 'just now' },
    ])
    setText('')
  }

  return (
    <div className="card card-pad">
      <h2 className="section-title mb-1">
        Comments
      </h2>
      <p className="text-xs text-ink-3 mb-4">
        Preview only for now — comments aren&apos;t saved yet.
      </p>

      <ul className="space-y-3 mb-5">
        {comments.map((comment, i) => (
          <li key={i} className="rounded-lg bg-surface-muted p-3">
            <p className="text-sm font-medium text-ink">
              {comment.name}
              <span className="ml-2 text-xs font-normal text-ink-3">
                {comment.postedAt}
              </span>
            </p>
            <p className="text-sm text-ink-2 mt-1">{comment.text}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="field mt-0"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          className="field mt-0"
        />
        <button
          onClick={addComment}
          className="btn btn-primary"
        >
          Post comment
        </button>
      </div>
    </div>
  )
}
