import { ThreadList } from "@/components/mail/ThreadList";

// Opening a thread keeps whatever list you came from; this is what a full page
// load onto a thread URL falls back to.
export default function ThreadPageList() {
  return <ThreadList />;
}
