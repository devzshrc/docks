import { NextResponse, type NextRequest } from "next/server";
/** Existing bookmarks keep their path and query on the canonical host. */
export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname === "app.devzshrc.in") {
    const target = request.nextUrl.clone();
    target.protocol = "https:";
    target.hostname = "docks.devzshrc.in";
    target.port = "";
    return NextResponse.redirect(target, 308);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
