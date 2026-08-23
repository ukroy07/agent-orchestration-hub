/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Base surfaces - a blue-tinted near-black, not pure black. Reads as
        // an instrument panel rather than "dark mode toggle default".
        base: {
          950: '#0B0E14',
          900: '#12161F',
          800: '#1A1F2B',
          700: '#252B3A',
          600: '#323A4D',
        },
        ink: {
          100: '#E8EAF0',
          300: '#B8BFCF',
          400: '#8891A6',
          600: '#5B6479',
        },
        // Every agent gets its own signal color, like status lights on a
        // control panel - deliberately NOT one generic accent color.
        agent: {
          researcher: '#4FD1E8',
          writer: '#F0B84D',
          critic: '#F0654D',
          coder: '#9D7BF5',
          human: '#4ADE9E',
        },
        trust: {
          DEFAULT: '#4ADE9E',
          warn: '#F0B84D',
          danger: '#F0654D',
        },
        // Chart fills. Same hues as agent.* above - researcher is still cyan,
        // critic still red - but re-stepped into the OKLCH dark-mode
        // lightness band (L 0.48-0.67). The agent.* colors are tuned to be
        // thin bright marks on near-black: as large filled areas they glare,
        // and their lightness spread pushes them out of band. These steps
        // keep hue identity while passing the categorical-palette checks
        // (CVD separation dE 16.0 deutan, normal-vision 21.1, chroma floor,
        // in-band lightness) against the base-900 chart surface. Two of them
        // land just under 3:1 contrast, which is why every chart mark here
        // carries a visible label or a table row rather than relying on
        // colour alone. Don't hand-tweak these without re-validating.
        chart: {
          researcher: '#0B9EB3',
          writer: '#BC8804',
          critic: '#B12812',
          coder: '#6943B8',
          trust: '#00AA71',
          grid: '#252B3A',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(79, 209, 232, 0.25), 0 0 24px -4px rgba(79, 209, 232, 0.35)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 currentColor' },
          '70%': { boxShadow: '0 0 0 8px transparent' },
          '100%': { boxShadow: '0 0 0 0 transparent' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
