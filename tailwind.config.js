/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0d1117',
        surface: '#161b22',
        'surface-hover': '#1c2128',
        border: '#30363d',
        'border-light': '#484f58',
        primary: '#7c3aed',
        'primary-hover': '#6d28d9',
        'primary-muted': '#7c3aed20',
        accent: '#58a6ff',
        success: '#3fb950',
        warning: '#d29922',
        danger: '#f85149',
        'text-primary': '#e6edf3',
        'text-secondary': '#8b949e',
        'text-muted': '#6e7681',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
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
          '0%': { boxShadow: '0 0 5px #7c3aed40' },
          '100%': { boxShadow: '0 0 20px #7c3aed60' },
        },
      },
    },
  },
  plugins: [],
};
