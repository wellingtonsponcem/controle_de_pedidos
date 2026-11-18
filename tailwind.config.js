/** Tailwind do catálogo público (index.html). Gere o CSS com: npm run build:css */
module.exports = {
  content: ['./index.html', './privacidade.html', './assets/js/catalogo-publico.js'],

  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "on-secondary": "#ffffff",
        "on-background": "#201b11",
        "on-tertiary-fixed": "#001e2d",
        "tertiary-fixed-dim": "#82cfff",
        "surface-variant": "#ede1d1",
        "surface-container": "#f8ecdc",
        "primary-fixed": "#ffdead",
        "on-tertiary-container": "#004b6a",
        "primary-container": "#eda70b",
        "on-tertiary": "#ffffff",
        "on-secondary-fixed": "#271900",
        "surface-tint": "#7f5700",
        "primary": "#7f5700",
        "inverse-primary": "#ffba3a",
        "secondary": "#775925",
        "surface-container-high": "#f3e6d7",
        "on-secondary-container": "#795c27",
        "on-surface-variant": "#514533",
        "on-primary": "#ffffff",
        "tertiary-container": "#3ebfff",
        "on-primary-fixed": "#281900",
        "on-error": "#ffffff",
        "primary-fixed-dim": "#ffba3a",
        "error-container": "#ffdad6",
        "background": "#fff8f3",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#fef2e2",
        "on-surface": "#201b11",
        "surface-dim": "#e4d8c9",
        "secondary-container": "#ffd797",
        "outline-variant": "#d5c4ad",
        "secondary-fixed-dim": "#e8c182",
        "surface": "#fff8f3",
        "inverse-surface": "#362f25",
        "tertiary-fixed": "#c6e7ff",
        "secondary-fixed": "#ffdeab",
        "surface-container-highest": "#ede1d1",
        "error": "#ba1a1a",
        "on-error-container": "#93000a",
        "outline": "#837561",
        "surface-bright": "#fff8f3",
        "on-tertiary-fixed-variant": "#004c6b",
        "on-primary-fixed-variant": "#604100",
        "tertiary": "#00658d",
        "on-secondary-fixed-variant": "#5d420f",
        "on-primary-container": "#5f4000",
        "inverse-on-surface": "#fbefdf"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "2xl": "1rem",
        "full": "9999px"
      },
      spacing: {
        "xl": "64px",
        "sm": "12px",
        "xs": "4px",
        "margin-mobile": "16px",
        "gutter": "20px",
        "margin-desktop": "40px",
        "lg": "48px",
        "md": "24px",
        "base": "8px"
      },
      fontFamily: {
        "headline-xl": ["Epilogue", "sans-serif"],
        "headline-lg": ["Epilogue", "sans-serif"],
        "headline-md": ["Epilogue", "sans-serif"],
        "body-md": ["Plus Jakarta Sans", "sans-serif"],
        "body-lg": ["Plus Jakarta Sans", "sans-serif"],
        "label-bold": ["Plus Jakarta Sans", "sans-serif"],
        "price-display": ["Epilogue", "sans-serif"]
      }
    }
  }
,
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')]
};
