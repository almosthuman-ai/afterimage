// Keys are 0..255, matching the existing RGB/HSV sorting channels.
export function ultimateToneKey(r: number, g: number, b: number, channel: number) {
  if (channel === 6) return 255 - Math.hypot(255 - r, 255 - g, 255 - b) / Math.sqrt(3);
  if (channel === 7) return 255 - Math.hypot(r, g, b) / Math.sqrt(3);
  if (channel === 8) return 255 - (Math.max(r, g, b) - Math.min(r, g, b));
  if (channel === 9) return .2126 * r + .7152 * g + .0722 * b;
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function ultimateToneSelected(r: number, g: number, b: number, territory: string, tolerance: number): boolean | undefined {
  const range = Math.max(0, Math.min(1, tolerance)) * 255;
  if (territory === "white") return ultimateToneKey(r, g, b, 6) >= 255 - range;
  if (territory === "black") return ultimateToneKey(r, g, b, 7) >= 255 - range;
  if (territory === "gray") return Math.max(r, g, b) - Math.min(r, g, b) <= range;
  if (territory === "colorful") return Math.max(r, g, b) - Math.min(r, g, b) >= range;
  if (territory === "midtones") return Math.abs(ultimateToneKey(r, g, b, 9) - 127.5) <= range / 2;
  return undefined;
}
