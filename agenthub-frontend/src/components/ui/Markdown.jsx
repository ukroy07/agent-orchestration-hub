import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

/**
 * Renders an agent's result as markdown instead of printing the raw markup.
 *
 * Agents return markdown by default - headings, fenced code, tables, bold -
 * and showing that as plain text meant readers saw `### Python
 * Implementation` and ```` ```python ```` as literal characters, with code
 * running together in a wall of prose.
 *
 * Every element is styled from the existing Tailwind tokens rather than a
 * prose plugin, so results match the rest of the app instead of arriving with
 * their own typography.
 *
 * Math is rendered with KaTeX, because the agents write complexity bounds in
 * LaTeX (`$O(\alpha(N))$`) constantly and those were showing as literal
 * dollar signs and backslashes.
 *
 * Deliberately NOT enabled: raw HTML. `react-markdown` ignores HTML in the
 * source unless `rehype-raw` is added, and that is the right default here -
 * this text comes from a language model, and rendering whatever tags it emits
 * would turn model output into an injection vector. Note that KaTeX does not
 * reopen that hole: rehype-katex builds its markup from the parsed math tree,
 * it does not pass source HTML through.
 */

const components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 font-display text-base font-semibold text-ink-100 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 font-display text-sm font-semibold text-ink-100 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 font-display text-sm font-semibold text-ink-200 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-3 font-display text-xs font-semibold uppercase tracking-wide text-ink-400 first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-ink-200">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-agent-researcher underline underline-offset-2">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-base-600 pl-3 italic text-ink-400 last:mb-0">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-base-700" />,

  // Fenced blocks arrive as <pre><code>; inline ticks arrive as a bare
  // <code>. react-markdown v9 dropped the `inline` prop that used to
  // distinguish them, so `code` is styled as inline unconditionally and the
  // `pre` wrapper resets that styling for the block case. Checking for a
  // `language-*` class instead would mis-style a fence opened with plain
  // ``` and no language, which is most of them.
  pre: ({ node, children, ...props }) => (
    <pre
      className="mb-3 overflow-x-auto rounded-md border border-base-700 bg-base-950 p-3 text-[13px] leading-relaxed last:mb-0 [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-ink-200"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ node, children, ...props }) => (
    <code
      className="rounded border border-base-700 bg-base-950 px-1 py-0.5 font-mono text-[0.85em] text-agent-writer"
      {...props}
    >
      {children}
    </code>
  ),

  // Tables need to scroll on their own; a wide one must not widen the card.
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-base-700 text-ink-400">{children}</thead>,
  th: ({ children }) => <th className="px-2 py-1.5 font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b border-base-800 px-2 py-1.5 align-top">{children}</td>,
}

/**
 * Money is not math.
 *
 * remark-math reads any `$...$` pair as inline math, so a sentence like
 * "the plan costs $5 and the upgrade is $10" parses "5 and the upgrade is"
 * as a formula and renders it as italic maths variables. Escaping a dollar
 * that is immediately followed by a digit keeps prices as prices - and costs
 * nothing, because the notation the agents actually emit - O(1), alpha,
 * complexity bounds - never opens with a digit.
 */
// The replacement is a function, not a string: `$` is special in a
// replacement pattern ($&, $1 ...), so returning it from a callback is the
// unambiguous way to emit a literal backslash-dollar.
const escapeCurrency = (text) => String(text || '').replace(/\$(?=\d)/g, () => '\\$')

export default function Markdown({ children, className = '' }) {
  return (
    <div className={`text-sm text-ink-300 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          // throwOnError:false is essential here rather than optional - this
          // is model output, so a malformed expression is a matter of time,
          // and the default would take the whole result panel down with it.
          // Invalid math renders in the critic colour instead.
          [rehypeKatex, { throwOnError: false, errorColor: '#F0654D' }],
        ]}
        components={components}
      >
        {escapeCurrency(children)}
      </ReactMarkdown>
    </div>
  )
}
