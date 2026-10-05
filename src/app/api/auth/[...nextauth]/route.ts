import { handlers } from "@/lib/auth";
import { withLinkRefusalPage } from "@/lib/auth/link-refusal";

// Both methods: Auth.js runs the OAuth callback on GET and on POST. The
// wrapper only chooses the page a refused account link ends on; the refusal
// itself is decided in src/lib/auth/link-gate.ts.
export const GET = withLinkRefusalPage(handlers.GET);
export const POST = withLinkRefusalPage(handlers.POST);
