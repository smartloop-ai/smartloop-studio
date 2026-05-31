import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  important: "#app",
  theme: {
    extend: {
      borderColor: {
        DEFAULT: "var(--sl-border-subtle)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        sl: {
          bg: {
            base: "var(--sl-bg-base)",
            "surface-1": "var(--sl-bg-surface-1)",
            "surface-2": "var(--sl-bg-surface-2)",
            "surface-3": "var(--sl-bg-surface-3)",
            input: "var(--sl-bg-input)",
            elevated: "var(--sl-bg-elevated)",
          },
          brand: {
            DEFAULT: "var(--sl-brand-primary)",
            primary: "var(--sl-brand-primary)",
            hover: "var(--sl-brand-hover)",
            active: "var(--sl-brand-active)",
            light: "var(--sl-brand-light)",
          },
          text: {
            primary: "var(--sl-text-primary)",
            secondary: "var(--sl-text-secondary)",
            tertiary: "var(--sl-text-tertiary)",
            muted: "var(--sl-text-muted)",
            disabled: "var(--sl-text-disabled)",
            faint: "var(--sl-text-faint)",
          },
          status: {
            error: "var(--sl-status-error)",
            success: "var(--sl-status-success)",
            online: "var(--sl-status-online)",
            warning: "var(--sl-status-warning)",
            info: "var(--sl-status-info)",
            purple: "var(--sl-status-purple)",
          },
          border: {
            subtle: "var(--sl-border-subtle)",
            DEFAULT: "var(--sl-border-default)",
            hover: "var(--sl-border-hover)",
            code: "var(--sl-border-code)",
          },
        },
      },
    },
  },
  plugins: [],
};
export default config;
