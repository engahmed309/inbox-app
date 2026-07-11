/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#0F172A', 2: '#1E293B', 3: '#334155' },
        brand: { DEFAULT: '#3B82F6', dark: '#2563EB', light: '#60A5FA' },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        follow: '#8B5CF6',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
}
