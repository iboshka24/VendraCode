/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#171819',
        surface: '#202123',
        'surface-hover': '#28292b',
        bgdeep: '#131415',
        bgtitle: '#171819',
        bgside: '#141516',
        border: '#2a2b2d',
        'border-light': '#3b3d40',
        primary: '#a5b8ac',
        'primary-hover': '#b8c8be',
        'primary-muted': '#a5b8ac20',
        pop: '#f2f2f2',
        popfg: '#131415',
        chip: '#1e1e1e',
        accent: '#94b9a3',
        success: '#94b9a3',
        warning: '#e0a336',
        danger: '#e5484d',
        'text-primary': '#e8e7e3',
        'text-secondary': '#a0a2a3',
        'text-muted': '#767a7d',
        'text-hint': '#5c6063',
        'u-alice': '#f06595',
        'u-bob': '#4dabf7',
        'u-chen': '#94b9a3',
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
