"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Only one column fits on a phone, so the frame records which view is current
// and the stylesheet shows the list or the pane accordingly.
const PANE_ROUTES = ["/t/", "/d/", "/settings"];

interface FrameApi {
  paneOpen: boolean;
  railOpen: boolean;
  toggleRail: () => void;
}

const Ctx = createContext<FrameApi>({ paneOpen: false, railOpen: false, toggleRail: () => {} });

export function useFrame() {
  return useContext(Ctx);
}

export function ShellFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const paneOpen = PANE_ROUTES.some((prefix) => path.startsWith(prefix));
  const [railOpen, setRailOpen] = useState(false);

  // The rail is a drawer on a phone, and navigating is what closes it.
  useEffect(() => setRailOpen(false), [path]);

  return (
    <Ctx.Provider value={{ paneOpen, railOpen, toggleRail: () => setRailOpen((open) => !open) }}>
      <div
        data-shell
        data-pane={paneOpen ? "open" : "closed"}
        data-rail={railOpen ? "open" : "closed"}
        className="relative flex h-dvh overflow-hidden bg-bg max-md:flex-col"
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}
