// The list stays mounted while a thread is open, so the last list it drew is
// the one the thread was opened from.
let current = "/";

export function rememberList(href: string) {
  current = href;
}

export function listToReturnTo() {
  return current;
}
