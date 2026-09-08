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

function icon(path: React.ReactNode) {
  return function Icon({ className }: Props) {
    return (
      <svg {...base} className={className} aria-hidden>
        {path}
      </svg>
    );
  };
}

export const InboxIcon = icon(
  <>
    <path d="M8 2.5v7" />
    <path d="M5.2 6.9 8 9.7l2.8-2.8" />
    <path d="M2.5 10.5v1.8c0 .7.6 1.2 1.2 1.2h8.6c.6 0 1.2-.5 1.2-1.2v-1.8" />
  </>,
);

export const SendIcon = icon(
  <>
    <path d="M8 13.5v-7" />
    <path d="M5.2 9.1 8 6.3l2.8 2.8" />
    <path d="M2.5 3.7V2.5h11v1.2" />
  </>,
);

export const DraftIcon = icon(<path d="M11.2 2.8l2 2L6 12l-2.6.6L4 10z" />);

export const ArchiveIcon = icon(
  <>
    <rect x="2" y="2.75" width="12" height="3" rx="1" />
    <path d="M3.2 5.75v6.5c0 .6.5 1 1 1h7.6c.5 0 1-.4 1-1v-6.5" />
    <path d="M6.4 8.4h3.2" />
  </>,
);

export const SearchIcon = icon(
  <>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.2 10.2 14 14" />
  </>,
);

export const MoreIcon = icon(
  <>
    <circle cx="3.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </>,
);

export const CheckIcon = icon(<path d="M3.5 8.4 6.4 11.2 12.5 4.8" />);

export const CloseIcon = icon(
  <>
    <path d="M4 4l8 8" />
    <path d="M12 4l-8 8" />
  </>,
);

export const BackIcon = icon(<path d="M10 4 6 8l4 4" />);

export const ChevronIcon = icon(<path d="M6 4l4 4-4 4" />);

export const ChevronDownIcon = icon(<path d="M4 6.2 8 10l4-3.8" />);

export const ClipIcon = icon(
  <path d="M10.5 5.5 5.9 10.1a1.8 1.8 0 002.5 2.5l4.6-4.6a3.1 3.1 0 00-4.4-4.4L3.9 8.3" />,
);

export const DocIcon = icon(
  <>
    <path d="M4 2h5l3 3v9H4z" />
    <path d="M9 2v3h3" />
  </>,
);

export const PlusIcon = icon(
  <>
    <path d="M8 3.5v9" />
    <path d="M3.5 8h9" />
  </>,
);

export const ExpandIcon = icon(
  <>
    <path d="M9.5 3.5h3v3" />
    <path d="M6.5 12.5h-3v-3" />
    <path d="M12.5 3.5 9 7" />
    <path d="M3.5 12.5 7 9" />
  </>,
);

export const MinimiseIcon = icon(<path d="M4 8h8" />);

export const SettingsIcon = icon(
  <>
    <path d="M2.5 5h11M2.5 11h11" />
    <circle cx="6" cy="5" r="1.7" />
    <circle cx="10" cy="11" r="1.7" />
  </>,
);
