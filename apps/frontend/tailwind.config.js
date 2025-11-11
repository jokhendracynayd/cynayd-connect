/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"General Sans"', '"Inter"', 'ui-sans-serif', 'system-ui', '-apple-system'],
        body: ['"Inter"', 'ui-sans-serif', 'system-ui', '-apple-system'],
      },
    },
  },
  plugins: [],
}

