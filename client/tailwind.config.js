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
      },
      fontFamily: {
        'brand': 'var(--font-brand)',
      },
      screens: {
        '3xl': '1920px',  // Full HD
        '4xl': '2560px',  // 2K / QHD
        '5xl': '3440px',  // Ultrawide
        '6xl': '3840px',  // 4K / UHD
      }
    }
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}

