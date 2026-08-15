import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#10263B",
        paper: "#F3F0E8",
        signal: "#FF5C35",
        clearance: "#14906C",
        fog: "#D5DDE0",
      },
      boxShadow: {
        panel: "0 24px 70px rgba(16, 38, 59, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
