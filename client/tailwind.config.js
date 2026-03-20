/** @type {import('tailwindcss').Config} */

function withOpacityValue(variable) {
  return ({ opacityValue }) => {
    if (opacityValue === undefined) {
      return `rgb(var(${variable}))`;
    }
    return `rgba(var(${variable}), ${opacityValue})`;
  };
}

export default {
    darkMode: ["class"],
    content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
        'brand':  withOpacityValue('--color-brand'),
        'brand-muted': withOpacityValue('--color-brand-muted'),
        'brand-subtle': withOpacityValue('--color-brand-subtle'),
        'destructive': withOpacityValue('--color-destructive'),
        'warning': withOpacityValue('--color-warning'),
        'success': withOpacityValue('--color-success'),
        'neutral': withOpacityValue('--color-neutral'),
        'surface': withOpacityValue('--color-surface'),
        'surface-elevated': withOpacityValue('--color-surface-elevated'),
      },
      fontFamily: {
        'brand': 'var(--font-brand)',
        'body': 'var(--font-body)',
      },
      screens: {
        '3xl': '1920px',
        '4xl': '2560px',
        '5xl': '3440px',
        '6xl': '3840px',
      },
      keyframes: {
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'fade-up': 'fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    }
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}
