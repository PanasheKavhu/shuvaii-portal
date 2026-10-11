import "server-only";

import { headers } from "next/headers";
import { addressFrom } from "./address";

/** The caller's network address as the hosting proxy reports it (see addressFrom). */
export async function clientAddress(): Promise<string> {
  return addressFrom(await headers());
}
