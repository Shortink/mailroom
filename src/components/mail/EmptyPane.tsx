export function EmptyPane({ note }: { note?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
      <span className="size-11 rotate-45 rounded-xl border border-line" />
      <p className="text-[15px] font-semibold">No message selected</p>
      <p className="max-w-[42ch] text-[13px] text-ink3">
        {note ?? "Pick a thread on the left, or clear the unread filter."}
      </p>
    </div>
  );
}
