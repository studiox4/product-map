import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/shared/src/**/*.ts',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Schibsted Grotesk"', 'sans-serif'],
        sans: ['"Schibsted Grotesk"', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--pm-shadow-card)',
        'card-hover': 'var(--pm-shadow-card-hover)',
        'sm-card': 'var(--pm-shadow-sm)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        ink: 'var(--pm-ink)',
        'body-ink': 'var(--pm-body)',
        'muted-ink': 'var(--pm-muted)',
        action: {
          DEFAULT: 'var(--pm-action)',
          soft: 'var(--pm-action-soft)',
        },
        sage: {
          DEFAULT: 'var(--pm-sage)',
          soft: 'var(--pm-sage-soft)',
        },
        warm: {
          DEFAULT: 'var(--pm-warm)',
          soft: 'var(--pm-warm-soft)',
        },
        cool: {
          DEFAULT: 'var(--pm-cool)',
          soft: 'var(--pm-cool-soft)',
        },
        surface: 'rgb(var(--pm-surface-rgb) / <alpha-value>)',
        wash: 'var(--pm-wash)',
        inset: 'var(--pm-inset)',
        panel: 'var(--pm-panel)',
        line: {
          DEFAULT: 'var(--pm-line)',
          strong: 'var(--pm-line-strong)',
          dash: 'var(--pm-dash)',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
    },
  },
  plugins: [animate],
} satisfies Config;
