import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-purple': '#8A2BE2', // A vibrant purple
        'brand-blue': '#00BFFF',   // A bright, electric blue
        'brand-pink': '#FF00FF',   // A neon fuchsia/magenta
        'dark-bg': '#0C0C1E',      // A very deep, near-black blue/purple
        'light-text': '#E0E0FF',   // A very light lavender for text
        'accent-glow': 'rgba(138, 43, 226, 0.5)', // Glow effect for purple
      },
      fontFamily: {
        // You might want to add a cool, modern font here later
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'bounce-in': 'bounce-in 0.5s ease-out',
        'fade-in': 'fade-in 0.3s ease-in-out',
        'ticking': 'ticking 1.5s infinite',
      },
      keyframes: {
        'bounce-in': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '70%': { transform: 'scale(1.05)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'ticking': {
            '0%, 100%': { transform: 'scale(1)' },
            '50%': { transform: 'scale(1.1)' },
        }
      },
    },
  },
  plugins: [],
};
export default config;
