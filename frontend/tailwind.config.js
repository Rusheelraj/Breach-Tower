/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontSize: {
        xs:   ["0.9375rem",  { lineHeight: "1.375rem" }], // 15px
        sm:   ["1.0625rem",  { lineHeight: "1.625rem" }], // 17px
        base: ["1.1875rem",  { lineHeight: "1.75rem"  }], // 19px
        lg:   ["1.3125rem",  { lineHeight: "2rem"     }], // 21px
        xl:   ["1.5rem",     { lineHeight: "2.125rem" }], // 24px
        "2xl":["1.75rem",    { lineHeight: "2.375rem" }], // 28px
      },
    },
  },
  plugins: [],
};
