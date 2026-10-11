/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        office: {
          bg: '#070B14',
          card: 'rgba(255, 255, 255, 0.04)',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.07)',
          cyan: '#22D3EE',
          violet: '#8B5CF6',
          success: '#34D399',
          warn: '#FBBF24',
          danger: '#F43F5E',
          muted: '#94A3B8',
          text: '#F8FAFC',
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
        'glow-cyan': '0 0 15px -3px rgba(34, 211, 238, 0.4)',
        'glow-violet': '0 0 15px -3px rgba(139, 92, 246, 0.4)',
        'glow-warn': '0 0 15px -3px rgba(251, 191, 36, 0.4)',
        'glow-danger': '0 0 15px -3px rgba(244, 63, 94, 0.4)',
      },
    },
  },
  plugins: [],
};
