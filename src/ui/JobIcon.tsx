import type { JobOrUnset } from "@/domain/types";

// Vite's import.meta.glob bundles all PNGs at build time. The map key is the
// filename minus extension, uppercased, so it matches the Job enum.
const iconModules = import.meta.glob<{ default: string }>("../assets/jobs/*.png", { eager: true });

const ICONS: Partial<Record<JobOrUnset, string>> = {};
for (const [path, mod] of Object.entries(iconModules)) {
  const filename = path.split("/").pop();
  if (!filename) continue;
  const key = filename.replace(".png", "").toUpperCase() as JobOrUnset;
  ICONS[key] = mod.default;
}

interface JobIconProps {
  job: JobOrUnset;
  size?: number;
  title?: string;
}

export function JobIcon({ job, size = 24, title }: JobIconProps) {
  if (job === "unset") {
    return (
      <span
        role="img"
        className="job-icon job-icon--unset"
        style={{ width: size, height: size }}
        title={title ?? "Unset"}
        aria-label={title ?? "Unset"}
      />
    );
  }
  const src = ICONS[job];
  if (!src) {
    return (
      <span className="job-icon job-icon--missing" style={{ width: size, height: size }}>
        {job}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={title ?? job}
      title={title ?? job}
      width={size}
      height={size}
      className="job-icon"
      draggable={false}
    />
  );
}
