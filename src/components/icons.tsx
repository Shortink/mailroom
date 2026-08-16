type Props = { className?: string };

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function EnvelopeIcon({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="1.75" y="3.75" width="12.5" height="9" rx="1.5" />
      <path d="M2.2 5.2 8 9l5.8-3.8" />
    </svg>
  );
}

export function SearchIcon({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2 14 14" />
    </svg>
  );
}

export function PenIcon({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M11.2 2.8l2 2L6 12l-2.6.6L4 10z" />
    </svg>
  );
}

export function ClipIcon({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M10.5 5.5 5.9 10.1a1.8 1.8 0 002.5 2.5l4.6-4.6a3.1 3.1 0 00-4.4-4.4L3.9 8.3" />
    </svg>
  );
}

export function ChevronIcon({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

export function BackIcon({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M10 4 6 8l4 4" />
    </svg>
  );
}

export function DocIcon({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
    </svg>
  );
}
