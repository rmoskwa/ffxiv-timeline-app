// Mirrors JobIcon. Icon key = mit name lowercased with spaces → underscores
// (e.g., "Shadowed Vigil" → "shadowed_vigil"). The PNGs in src/assets/mits/
// were downloaded from the FFXIV wiki and follow that same convention.
const iconModules = import.meta.glob<{ default: string }>("../assets/mits/*.png", { eager: true });

const ICONS: Record<string, string> = {};
for (const [path, mod] of Object.entries(iconModules)) {
  const filename = path.split("/").pop();
  if (!filename) continue;
  ICONS[filename.replace(".png", "")] = mod.default;
}

function iconKey(mitName: string): string {
  return mitName.toLowerCase().replace(/\s+/g, "_");
}

interface MitIconProps {
  name: string;
  size?: number;
  title?: string;
}

export function MitIcon({ name, size = 20, title }: MitIconProps) {
  const src = ICONS[iconKey(name)];
  if (!src) {
    return (
      <span
        role="img"
        className="mit-icon mit-icon--missing"
        style={{ width: size, height: size }}
        title={title ?? name}
        aria-label={title ?? name}
      />
    );
  }
  return (
    <img
      src={src}
      alt={title ?? name}
      title={title ?? name}
      width={size}
      height={size}
      className="mit-icon"
      draggable={false}
    />
  );
}
