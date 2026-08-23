import React, { Suspense, lazy } from 'react'

/**
 * Loads the markdown renderer on demand.
 *
 * `Markdown.jsx` pulls in react-markdown, remark-gfm and KaTeX, which is
 * roughly 400KB of the bundle. Only the task view and the result modal ever
 * render markdown, so importing it eagerly made every visitor download a
 * LaTeX engine to look at the sign-in form.
 *
 * The fallback is deliberately blank rather than the raw text: showing the
 * unrendered source for a frame and then swapping it for the parsed version
 * flashes `**bold**` and `$O(1)$` at the reader, which is the exact problem
 * this renderer exists to solve.
 */
const Markdown = lazy(() => import('./Markdown'))

export default function LazyMarkdown({ children, className = '' }) {
  return (
    <Suspense fallback={<div className="h-4 w-2/3 animate-pulse rounded bg-base-800" aria-hidden="true" />}>
      <Markdown className={className}>{children}</Markdown>
    </Suspense>
  )
}
