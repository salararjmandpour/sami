module.exports = {
  content: [
    "./index.html",
    "./assets/js/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Vazirmatn", "Tahoma", "Arial", "sans-serif"]
      },
      colors: {
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          600: "#059669",
          700: "#047857",
          900: "#064e3b"
        }
      }
    }
  }
};
