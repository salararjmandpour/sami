const fs = require("fs");

const outputPath = "assets/css/tailwind.css";
const bannerPattern = /\/\*! tailwindcss v[\d.]+ \| MIT License \| https:\/\/tailwindcss\.com\*\//g;
const css = fs.readFileSync(outputPath, "utf8").replace(bannerPattern, "");

fs.writeFileSync(outputPath, css);
