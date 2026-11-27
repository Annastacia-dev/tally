import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { BASE_PATH } from "@/lib/base-path";

// Under a base path (e.g. /tally), Next.js hands route handlers a URL without
// it, while Auth.js expects its routes at /tally/api/auth. Put it back.
function withBasePath(handler: (req: NextRequest) => Promise<Response>) {
  return (req: NextRequest) => {
    if (!BASE_PATH) return handler(req);
    const url = new URL(req.url);
    if (!url.pathname.startsWith(`${BASE_PATH}/`)) url.pathname = `${BASE_PATH}${url.pathname}`;
    return handler(new NextRequest(url, req));
  };
}

export const GET = withBasePath(handlers.GET);
export const POST = withBasePath(handlers.POST);
