function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function applyAccentColor(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  const [h, s, l] = hexToHsl(hex);
  const sat = Math.min(s, 90);
  const root = document.documentElement;
  root.style.setProperty("--color-primary", hex);
  // Use dark text on light accent colors so button labels remain readable
  root.style.setProperty("--color-primary-foreground", l > 60 ? "#1A1917" : "#ffffff");
  root.style.setProperty("--color-primary-50", `hsl(${h}, ${sat}%, 97%)`);
  root.style.setProperty("--color-primary-100", `hsl(${h}, ${sat}%, 93%)`);
  root.style.setProperty("--color-primary-200", `hsl(${h}, ${sat}%, 87%)`);
  root.style.setProperty("--color-primary-300", `hsl(${h}, ${sat}%, 78%)`);
  root.style.setProperty("--color-primary-500", hex);
  root.style.setProperty("--color-primary-600", `hsl(${h}, ${sat}%, 44%)`);
  root.style.setProperty("--color-primary-700", `hsl(${h}, ${sat}%, 37%)`);
}
