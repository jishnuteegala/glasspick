export interface DesignToken {
  name: string
  label: string
}

export interface TokenGroup {
  title: string
  tokens: readonly DesignToken[]
}

export const colorTokens = [
  { name: "--color-bg", label: "Page background" },
  { name: "--color-surface", label: "Surface" },
  { name: "--color-surface-sunken", label: "Sunken surface" },
  { name: "--color-primary", label: "Primary action" },
  { name: "--color-primary-hover", label: "Primary action hover" },
  { name: "--color-primary-soft", label: "Primary subtle surface" },
  { name: "--color-on-primary", label: "Text on primary" },
  { name: "--color-ink", label: "Primary text" },
  { name: "--color-muted", label: "Secondary text" },
  { name: "--color-line", label: "Subtle border" },
  { name: "--color-line-strong", label: "Control border" },
  { name: "--color-ok", label: "Success text" },
  { name: "--color-warn", label: "Warning text" },
  { name: "--color-fail", label: "Failure text" },
  { name: "--color-info", label: "Information text" },
  { name: "--color-info-line", label: "Information border" },
  { name: "--color-info-bg", label: "Information background" },
  { name: "--color-ok-line", label: "Success border" },
  { name: "--color-ok-bg", label: "Success background" },
  { name: "--color-warn-line", label: "Warning border" },
  { name: "--color-warn-bg", label: "Warning background" },
  { name: "--color-fail-line", label: "Failure border" },
  { name: "--color-fail-bg", label: "Failure background" },
] as const satisfies readonly DesignToken[]

export const typeTokens = [
  { name: "--text-control", label: "Control text" },
] as const satisfies readonly DesignToken[]

export const spacingTokens = [
  { name: "--space-panel", label: "Panel inset" },
  { name: "--space-control-x", label: "Control horizontal inset" },
  { name: "--space-control-y", label: "Control vertical inset" },
] as const satisfies readonly DesignToken[]

export const radiusTokens = [
  { name: "--radius-control", label: "Control corner" },
  { name: "--radius-panel", label: "Panel corner" },
] as const satisfies readonly DesignToken[]

export const controlTokens = [
  { name: "--size-touch-target", label: "Minimum touch target" },
] as const satisfies readonly DesignToken[]

export const elevationTokens = [
  { name: "--shadow-panel", label: "Panel elevation" },
  { name: "--shadow-raised", label: "Raised elevation" },
] as const satisfies readonly DesignToken[]

export const tokenGroups = [
  { title: "Colour", tokens: colorTokens },
  { title: "Type", tokens: typeTokens },
  { title: "Spacing", tokens: spacingTokens },
  { title: "Radii", tokens: radiusTokens },
  { title: "Controls", tokens: controlTokens },
  { title: "Elevation", tokens: elevationTokens },
] as const satisfies readonly TokenGroup[]

export const tokenInventory: string[] = tokenGroups.flatMap((group) => group.tokens.map((token) => token.name))
