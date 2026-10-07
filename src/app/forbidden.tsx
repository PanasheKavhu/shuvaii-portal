import { NotAllowed } from "@/components/not-allowed";

/** Rendered with HTTP 403 when a page calls forbidden() (US-1.8). */
export default function Forbidden() {
  return <NotAllowed />;
}
