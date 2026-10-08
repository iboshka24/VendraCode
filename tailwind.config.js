/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#141414',
        surface: '#1b1b1b',
        'surface-hover': '#232323',
        bgdeep: '#0a0a0a',
        bgside: '#0e0e0e',
        border: '#272727',
        'border-light': '#3a3a3a',
        primary: '#7c3aed',
        'primary-hover': '#6d28d9',
        'primary-muted': '#7c3aed20',
        pop: '#f2f2f2',
        popfg: '#0a0a0a',
        chip: '#1e1e1e',
        accent: '#38d9a9',
        success: '#37d39b',
        warning: '#e0a336',
        danger: '#e5484d',
        'text-primary': '#ececec',
        'text-secondary': '#a0a0a0',
        'text-muted': '#6b6b6b',
        'text-hint': '#4a4a4a',
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
