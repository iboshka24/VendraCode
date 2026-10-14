/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#101014',
        surface: '#18181f',
        'surface-hover': '#22222c',
        bgdeep: '#0c0c10',
        bgside: '#0c0c10',
        border: '#2a2a36',
        'border-light': '#3e3e4e',
        primary: '#7c3aed',
        'primary-hover': '#6d28d9',
        'primary-muted': '#7c3aed20',
        pop: '#f2f2f2',
        popfg: '#0a0a0a',
        chip: '#1e1e1e',
        accent: '#3ee0a8',
        success: '#3ee0a8',
        warning: '#e0a336',
        danger: '#e5484d',
        'text-primary': '#f4f4f8',
        'text-secondary': '#b7b7c6',
        'text-muted': '#8a8a9c',
        'text-hint': '#5c5c70',
        'u-alice': '#f06595',
        'u-bob': '#4dabf7',
        'u-chen': '#38d9a9',
        'u-mina': '#ffa94d',
        'u-devon': '#b197fc',
      },
      fontFamily: {
        sans: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'sans-serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', '"Fira Code"', 'Menlo', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'pop-in': 'popIn 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.25)',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(55,211,155,0.2)' },
          '100%': { boxShadow: '0 0 16px rgba(55,211,155,0.5)' },
        },
        popIn: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
