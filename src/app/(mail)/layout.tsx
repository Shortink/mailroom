import { ComposeProvider } from "@/components/mail/Compose";
import { LiveMail } from "@/components/mail/LiveMail";
import { MobileBar } from "@/components/mail/MobileBar";
import { PaneToolbar } from "@/components/mail/PaneToolbar";
import { Rail } from "@/components/mail/Rail";
import { SearchProvider } from "@/components/mail/SearchField";
import { ShellFrame } from "@/components/mail/ShellFrame";
import { Zone } from "@/components/mail/Zone";
import { railCollapsed } from "@/lib/chrome";
import { requireViewer } from "@/lib/auth/require";
import { findUser } from "@/lib/auth/users";
import { formatClock } from "@/lib/format";
import { countFailed, listInboxes, listSwitcher } from "@/lib/mail/queries";
import { readerZone } from "@/lib/zone";

export default async function MailLayout({
  children,
  list,
}: {
  children: React.ReactNode;
  list: React.ReactNode;
}) {
  const viewer = await requireViewer();
  const [rail, switcher, user, failed] = await Promise.all([
    listInboxes(viewer),
    listSwitcher(viewer),
    findUser(viewer.userId),
    countFailed(viewer.view),
  ]);
  const [zone, collapsed] = await Promise.all([readerZone(), railCollapsed()]);

  // Compose picks from the addresses in the current view, and a one-address
  // view only sends from that address.
  const accounts = viewer.choice ? [viewer.choice] : rail.named.map((inbox) => inbox.address);
  const defaultFrom = accounts[0] ?? "";

  return (
    <ShellFrame>
      {/* Two soft glows sit behind the glass panels and never take pointer events. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-[520px] w-[760px] rounded-full blur-[120px]"
        style={{ background: "var(--glow-a)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -bottom-40 h-[520px] w-[640px] rounded-full blur-[130px]"
        style={{ background: "var(--glow-b)" }}
      />

      <LiveMail />
      <Zone current={zone} />

      <SearchProvider>
        {/* The composer sits at frame level rather than inside the pane, so it
            can still open from the phone inbox where the pane is off screen. */}
        <ComposeProvider accounts={accounts} locked={viewer.choice !== null}>
          <MobileBar defaultFrom={defaultFrom} />

          <Rail
            {...rail}
            failed={failed}
            user={user?.email ?? ""}
            loadedAt={formatClock(new Date(), zone)}
            collapsed={collapsed}
            switcher={switcher}
            choice={viewer.choice}
            owner={viewer.role === "owner"}
          />

          <div data-slot="list" className="flex min-w-0 flex-none max-md:min-h-0 max-md:flex-1">
            {list}
          </div>

          <main data-slot="pane" className="relative flex min-w-0 flex-1 flex-col max-md:min-h-0">
            <PaneToolbar defaultFrom={defaultFrom} />
            {children}
          </main>
        </ComposeProvider>
      </SearchProvider>
    </ShellFrame>
  );
}
