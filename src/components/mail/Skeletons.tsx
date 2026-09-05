function Bar({ width, height = 9 }: { width: string; height?: number }) {
  return <span className="shimmer block rounded" style={{ width, height }} />;
}

export function ListSkeleton() {
  return (
    <div className="flex w-full flex-none flex-col border-r border-line bg-panel backdrop-blur-[22px] md:w-[374px]">
      <div className="flex-none border-b border-line px-4 pt-4 pb-3">
        <Bar width="42%" height={14} />
        <div className="mt-3">
          <Bar width="100%" height={32} />
        </div>
      </div>

      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-line2 px-4 py-[13px]">
          <span className="shimmer size-[30px] flex-none rounded-full" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
            <Bar width="52%" height={10} />
            <Bar width="82%" />
            <Bar width="66%" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function PaneSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-5 px-10 pt-8">
      <Bar width="74%" height={22} />

      <div className="flex items-center gap-3">
        <span className="shimmer size-[30px] flex-none rounded-full" />
        <span className="flex flex-col gap-1.5">
          <Bar width="140px" height={10} />
          <Bar width="90px" height={9} />
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <Bar width="96%" />
        <Bar width="92%" />
        <Bar width="97%" />
        <Bar width="61%" />
      </div>

      <Bar width="100%" height={74} />
    </div>
  );
}
