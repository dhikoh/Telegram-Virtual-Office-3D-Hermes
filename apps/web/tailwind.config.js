/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        office: {
          // Tahap 2 — light neumorphic system (docs/DESIGN_DIRECTION.md §7.1).
          // Panels share the page tone and are separated by dual shadows, not borders.
          surface: '#EEF2F7', // page ground
          panel: '#EEF2F7', // raised panel (same tone as surface — neumorphism)
          elevated: '#F5F9FD', // modal / floating sheet
          inset: '#E4EBF4', // pressed well, code block, active track
          hover: '#E7EDF5', // subtle interactive fill
          border: '#D6DEEA', // hairline for dividers and defined edges
          card: 'rgba(255, 255, 255, 0.55)', // legacy token, kept so old classnames compile
          accent: '#F59E0B', // primary CTA fill (was office-cyan)
          'accent-ink': '#92400E', // accent as TEXT on the light ground (contrast ≥ 4.5:1)
          'on-violet': '#FFFFFF', // ink for the violet DEMO badge
          'on-accent': '#1F2937', // text on top of accent
          violet: '#7C5CFC',
          success: '#15803D',
          warn: '#B45309',
          danger: '#DC2626',
          muted: '#64748B',
          text: '#1F2937',
          // Legacy aliases — a missed rename degrades to the new palette instead
          // of silently losing its colour. See the sweep in Tahap 2.
          bg: '#EEF2F7',
          cyan: '#F59E0B',
          border: '#D6DEEA',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        // Neumorphism: light from top-left, shadow to bottom-right.
        'nu-raised':
          '-6px -6px 12px rgba(255, 255, 255, 0.9), 6px 6px 14px rgba(163, 177, 198, 0.42)',
        'nu-raised-lg':
          '-8px -8px 18px rgba(255, 255, 255, 0.95), 10px 10px 24px rgba(163, 177, 198, 0.5)',
        'nu-inset':
          'inset 3px 3px 7px rgba(163, 177, 198, 0.5), inset -3px -3px 7px rgba(255, 255, 255, 0.95)',
        'nu-flat':
          '-3px -3px 6px rgba(255, 255, 255, 0.85), 3px 3px 8px rgba(163, 177, 198, 0.35)',
        // Legacy neon tokens kept so any missed reference still compiles.
        'glow-cyan': '0 0 15px -3px rgba(34, 211, 238, 0.4)',
        'glow-violet': '0 0 15px -3px rgba(139, 92, 246, 0.4)',
        'glow-warn': '0 0 15px -3px rgba(251, 191, 36, 0.4)',
        'glow-danger': '0 0 15px -3px rgba(244, 63, 94, 0.4)',
      },
    },
  },
  plugins: [],
};
