"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { SearchIcon } from "@/components/icons";
import { SearchOverlay } from "./SearchOverlay";

interface SearchApi {
  open: () => void;
}

const Ctx = createContext<SearchApi | null>(null);

// The overlay is rendered up here rather than beside the button, because the
// list column carries a backdrop-filter and that makes it the containing block
// for any fixed-position child.
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);

  return (
    <Ctx.Provider value={{ open: show }}>
      {children}
      {open && <SearchOverlay onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

export function SearchField() {
  const search = useContext(Ctx);

  return (
    <button
      type="button"
      onClick={() => search?.open()}
      className="mt-3 flex w-full items-center gap-2 rounded-[10px] bg-chip px-2.5 py-2 text-left text-[12.5px] text-ink3 transition-colors hover:bg-hover"
    >
      <SearchIcon className="size-3.5 flex-none" />
      Search all addresses
    </button>
  );
}
