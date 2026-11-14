/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Figtree", "system-ui", "-apple-system", "Segoe UI", "sans-serif"] },
      colors: {
        ink: "#14211F", porcelain: "#F2F4F1", paper: "#FBFCFA", moss: "#2F5D50",
        mossdark: "#234639", brass: "#8A6414", brick: "#A63D2F", line: "#D3D9D1", mute: "#55635F",
      },
    },
  },
  plugins: [],
};
