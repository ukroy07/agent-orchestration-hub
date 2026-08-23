import React from 'react'
import { Github, Instagram, Linkedin } from 'lucide-react'
import { APP_NAME, APP_VERSION, DEVELOPER } from '../../constants/app'

/**
 * Global footer: copyright, who built it, and the running version.
 *
 * lucide-react has no LeetCode glyph, so that one is inlined below from
 * simple-icons (the icon artwork is CC0). GitHub and LinkedIn come from
 * lucide like every other icon in the app, rather than being inlined for
 * symmetry - one source of truth per icon beats matching styles by hand.
 */
function LeetCodeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z" />
    </svg>
  )
}

function ProfileLink({ href, label, children }) {
  return (
    <a
      href={href}
      target="_blank"
      // noreferrer as well as noopener: without it the destination gets this
      // app's URL in its Referer header, and on a self-hosted deploy that is
      // an internal hostname leaking outward.
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-base-700 text-ink-400 transition-colors hover:border-agent-researcher/40 hover:text-agent-researcher"
    >
      {children}
    </a>
  )
}

export default function Footer() {
  // Computed per render rather than hardcoded - a literal year is wrong on
  // 1 January and nobody notices for months.
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-base-700 bg-base-950">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-5 text-sm sm:flex-row sm:justify-between sm:gap-6 sm:px-6">
        {/* 1 - copyright */}
        <p className="order-3 text-ink-600 sm:order-1">
          © {year} {APP_NAME}. All rights reserved.
        </p>

        {/* 2 - developer profile */}
        <div className="order-1 flex items-center gap-3 sm:order-2">
          <span className="text-ink-400">
            {/* The heart carries the word, so it needs a label rather than
                aria-hidden - hiding it would have a screen reader announce
                "Built with by ukroy07". */}
            Built with{' '}
            <span role="img" aria-label="love" className="text-agent-critic">❤️</span>{' '}
            by <span className="text-ink-100">{DEVELOPER.handle}</span>
          </span>
          <div className="flex items-center gap-2">
            <ProfileLink href={DEVELOPER.github} label="GitHub profile">
              <Github className="h-4 w-4" aria-hidden="true" />
            </ProfileLink>
            <ProfileLink href={DEVELOPER.linkedin} label="LinkedIn profile">
              <Linkedin className="h-4 w-4" aria-hidden="true" />
            </ProfileLink>
            <ProfileLink href={DEVELOPER.leetcode} label="LeetCode profile">
              <LeetCodeIcon className="h-4 w-4" />
            </ProfileLink>
            <ProfileLink href={DEVELOPER.instagram} label="Instagram profile">
              <Instagram className="h-4 w-4" aria-hidden="true" />
            </ProfileLink>
          </div>
        </div>

        {/* 3 - version */}
        <p className="order-2 font-mono text-xs text-ink-600 sm:order-3">v{APP_VERSION}</p>
      </div>
    </footer>
  )
}
