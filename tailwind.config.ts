import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
    theme: {
          extend: {
                  colors: {
                            'brand-green': '#1A4D2E',
                            'brand-teal': '#2E4F4F',
                            'brand-offwhite': '#F9F9F7',
                  },
                  fontFamily: {
                            sans: ['var(--font-sans)', 'sans-serif'],
                            serif: ['var(--font-serif)', 'serif'],
                  },
          },
    },
    plugins: [],
};

export default config;
