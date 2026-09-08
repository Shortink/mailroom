interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  error?: string;
}

export function AuthShell({ title, subtitle, children, error }: Props) {
  return (
    <>
      <div className="mb-[22px] flex items-center gap-2.5 text-sm font-semibold">
        <span
          className="size-[22px] rotate-45 rounded-[6px]"
          style={{ background: "var(--brand)" }}
        />
        Mailroom
      </div>

      <h1 className="mb-1 text-lg font-semibold tracking-[-0.015em]">{title}</h1>
      {subtitle && <p className="mb-5 text-[13px] text-ink3">{subtitle}</p>}

      {error && (
        <p className="mb-3 rounded-md border border-line px-2.5 py-2 text-xs text-err">
          {error}
        </p>
      )}

      {children}
    </>
  );
}

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  mono,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  mono?: boolean;
}) {
  return (
    <label className="mb-[11px] block">
      <span className="mb-[5px] block text-xs font-medium text-ink2">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className={`h-8 w-full rounded-md border border-line bg-bg px-2.5 text-[13px] text-ink outline-none focus:border-accent ${
          mono ? "font-mono tracking-[0.32em]" : ""
        }`}
      />
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="mt-1.5 h-8 w-full rounded-md bg-accent text-[13px] font-semibold text-btn-ink"
    >
      {children}
    </button>
  );
}
