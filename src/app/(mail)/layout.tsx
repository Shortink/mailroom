import { ComposeProvider } from "@/components/mail/Compose";
import { LiveMail } from "@/components/mail/LiveMail";
import { MobileBar } from "@/components/mail/MobileBar";
import { PaneToolbar } from "@/components/mail/PaneToolbar";
import { Rail } from "@/components/mail/Rail";
import { SearchProvider } from "@/components/mail/SearchField";
import { ShellFrame } from "@/components/mail/ShellFrame";
import { requireUser } from "@/lib/auth/require";
import { findUser } from "@/lib/auth/users";
import { countFailed, listInboxes } from "@/lib/mail/queries";

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export default async function MailLayout({
  children,
  list,
}: {
  children: React.ReactNode;
  list: React.ReactNode;
}) {
  const userId = await requireUser();
  const [rail, user, failed] = await Promise.all([listInboxes(), findUser(userId), countFailed()]);

  const accounts = rail.named.map((inbox) => inbox.address);

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

      <SearchProvider>
        {/* The composer sits at frame level rather than inside the pane, so it
            can still open from the phone inbox where the pane is off screen. */}
        <ComposeProvider accounts={accounts}>
          <MobileBar defaultFrom={accounts[0] ?? ""} />

          <Rail
            {...rail}
            failed={failed}
            user={user?.email ?? ""}
            loadedAt={clock.format(new Date())}
          />

          <div data-slot="list" className="flex min-w-0 flex-none max-md:min-h-0 max-md:flex-1">
            {list}
          </div>

          <main data-slot="pane" className="relative flex min-w-0 flex-1 flex-col max-md:min-h-0">
            <PaneToolbar defaultFrom={accounts[0] ?? ""} />
            {children}
          </main>
        </ComposeProvider>
      </SearchProvider>
    </ShellFrame>
  );
}
