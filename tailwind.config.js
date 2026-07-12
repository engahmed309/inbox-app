/** @type {import('tailwindcss').Config} */
function withOpacity(varName) {
  return ({ opacityValue }) => opacityValue === undefined
    ? `rgb(var(${varName}))`
    : `rgb(var(${varName}) / ${opacityValue})`
}

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: withOpacity('--color-surface'),
          2: withOpacity('--color-surface-2'),
          3: withOpacity('--color-surface-3'),
        },
        fg: {
          DEFAULT: withOpacity('--color-fg'),
          muted: withOpacity('--color-fg-muted'),
          subtle: withOpacity('--color-fg-subtle'),
        },
        brand: {
          DEFAULT: withOpacity('--color-brand'),
          dark: withOpacity('--color-brand-dark'),
          light: withOpacity('--color-brand-light'),
        },
        success: withOpacity('--color-success'),
        warning: withOpacity('--color-warning'),
        danger: withOpacity('--color-danger'),
        follow: withOpacity('--color-follow'),
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
}
