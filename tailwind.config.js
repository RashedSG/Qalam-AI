/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      spacing: {
        13: '3.25rem',
      },
      colors: {
        // هوية قلم — Navy / Beige / White / Soft Gray / Gold accent
        navy: {
          50: '#EEF2F7',
          100: '#D6E0EC',
          200: '#AEC1D8',
          300: '#7F9BBD',
          400: '#4F729C',
          500: '#2C5182',
          600: '#1D3C66',
          700: '#16304F',
          800: '#11253D',
          900: '#0C1B2C',
          950: '#07111C',
        },
        beige: {
          50: '#FCFAF6',
          100: '#F7F2E9',
          200: '#EFE6D6',
          300: '#E2D4BC',
          400: '#D2BE9C',
          500: '#BFA47B',
        },
        gold: {
          400: '#D8BC85',
          500: '#C9A45C',
          600: '#AC8942',
        },
        ink: {
          DEFAULT: '#11253D',
          muted: '#5A6B80',
        },
      },
      /*
       * ⚠️ الخط الأساسي يُجلب من Google وقت التشغيل. وشبكات الجهات الحكومية
       *    تحجب النطاقات الخارجية كثيرًا — فيسقط الخط في العرض نفسه. البدائل
       *    أدناه عربية صريحة (Noto وSegoe وTahoma) لا `system-ui` وحدها،
       *    فيبقى النص مقروءًا ومتناسقًا بدل أن يقع على خط بلا عربية لائقة.
       *
       *    والحل الجذري استضافة الخط ذاتيًّا — راجع docs/operations.md.
       */
      fontFamily: {
        sans: [
          '"IBM Plex Sans Arabic"', '"Noto Sans Arabic"', '"Segoe UI"', 'Tahoma',
          '"Inter"', 'system-ui', '-apple-system', 'sans-serif',
        ],
        display: [
          '"IBM Plex Sans Arabic"', '"Noto Sans Arabic"', '"Segoe UI"', 'Tahoma',
          '"Inter"', 'system-ui', 'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(17, 37, 61, 0.04), 0 8px 24px -12px rgba(17, 37, 61, 0.14)',
        lift: '0 2px 4px rgba(17, 37, 61, 0.06), 0 16px 40px -16px rgba(17, 37, 61, 0.24)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
