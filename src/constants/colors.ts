/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases
    text: "#0f172a",
    tint: "#7c3aed",

    // Core surfaces
    background: "#f8fafc", // slate-50
    foreground: "#0f172a", // slate-900

    // Cards / elevated surfaces
    card: "#ffffff",
    cardForeground: "#0f172a",

    // Primary action color (buttons, active states)
    primary: "#7c3aed", // violet-600
    primaryForeground: "#ffffff",

    // Secondary action color
    secondary: "#1e293b", // slate-800
    secondaryForeground: "#ffffff",

    // Muted / subdued elements
    muted: "#f1f5f9", // slate-100
    mutedForeground: "#64748b", // slate-500

    // Accent highlights (badges, selected items)
    accent: "#14b8a6", // teal-500
    accentForeground: "#ffffff",

    // Destructive actions
    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    // Borders and outlines
    border: "#e2e8f0", // slate-200
    input: "#e2e8f0",
  },

  dark: {
    text: "#f8fafc",
    tint: "#a78bfa",

    background: "#0f172a",
    foreground: "#f8fafc",

    card: "#1e293b",
    cardForeground: "#f8fafc",

    primary: "#a78bfa",
    primaryForeground: "#0f172a",

    secondary: "#f1f5f9",
    secondaryForeground: "#0f172a",

    muted: "#1e293b",
    mutedForeground: "#94a3b8",

    accent: "#2dd4bf",
    accentForeground: "#0f172a",

    destructive: "#f87171",
    destructiveForeground: "#ffffff",

    border: "#334155",
    input: "#334155",
  },

  // Border radius
  radius: 16, // premium high-rounded corners
};

export default colors;
