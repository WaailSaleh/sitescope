/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      colors: {
        terminal: {
          bg: '#0a0a0a',
          surface: '#111111',
          border: '#1e1e1e',
          green: '#00ff88',
          amber: '#ffb800',
          red: '#ff4455',
          blue: '#4488ff',
          dim: '#3a3a3a',
          muted: '#666666',
          text: '#c8c8c8',
        }
      },
      animation: {
        'scan-line': 'scanLine 2s linear infinite',
        'blink': 'blink 1s step-end infinite',
        'pulse-green': 'pulseGreen 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        blink: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0 },
        },
        pulseGreen: {
          '0%, 100%': { boxShadow: '0 0 4px #00ff88' },
          '50%': { boxShadow: '0 0 16px #00ff88, 0 0 32px #00ff8844' },
        },
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        slideUp: {
          from: { opacity: 0, transform: 'translateY(12px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
