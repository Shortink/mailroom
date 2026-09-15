import { cookies } from "next/headers";

// Read on the server so the rail renders at its chosen width on the first
// paint. Kept in a cookie rather than local storage for the same reason.
export async function railCollapsed() {
  return (await cookies()).get("rail")?.value === "closed";
}
