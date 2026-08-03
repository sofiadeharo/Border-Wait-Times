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

// LAYOUT: comments card — same low-opacity white treatment as the rest of the blog page.
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
    <div className="rounded-lg border border-white/40 dark:border-white/10 bg-white/40 dark:bg-white/10 backdrop-blur-md p-5">
      <h2 className="text-lg font-medium text-blackberry-cream dark:text-almond-cream mb-1">
        Comments
      </h2>
      <p className="text-xs text-blackberry-cream/50 dark:text-almond-cream/50 mb-4">
        Preview only for now — comments aren&apos;t saved yet.
      </p>

      <ul className="space-y-3 mb-5">
        {comments.map((comment, i) => (
          <li key={i} className="rounded-md bg-white/40 dark:bg-white/5 p-3">
            <p className="text-sm font-medium text-blackberry-cream dark:text-almond-cream">
              {comment.name}
              <span className="ml-2 text-xs font-normal text-blackberry-cream/50 dark:text-almond-cream/50">
                {comment.postedAt}
              </span>
            </p>
            <p className="text-sm text-blackberry-cream/80 dark:text-almond-cream/80 mt-1">{comment.text}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="w-full rounded border border-blackberry-cream/20 dark:border-almond-cream/20 bg-white/50 dark:bg-white/10 p-2 text-sm text-blackberry-cream dark:text-almond-cream placeholder:text-blackberry-cream/40 dark:placeholder:text-almond-cream/40"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          className="w-full rounded border border-blackberry-cream/20 dark:border-almond-cream/20 bg-white/50 dark:bg-white/10 p-2 text-sm text-blackberry-cream dark:text-almond-cream placeholder:text-blackberry-cream/40 dark:placeholder:text-almond-cream/40"
        />
        <button
          onClick={addComment}
          className="rounded bg-blackberry-cream dark:bg-white text-white dark:text-blackberry-cream text-sm font-medium px-4 py-2"
        >
          Post comment
        </button>
      </div>
    </div>
  )
}
