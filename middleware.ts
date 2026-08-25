import {
  NextRequest,
  NextResponse,
} from "next/server";

export function middleware(
  request: NextRequest
) {
  const host =
    request.headers
      .get("host")
      ?.toLowerCase() || "";

  const pathname =
    request.nextUrl.pathname;

  const esAdminSubdomain =
    host ===
      "admin.relydo.co" ||
    host.startsWith(
      "admin.relydo.co:"
    );

  if (esAdminSubdomain) {
    if (pathname === "/") {
      const url =
        request.nextUrl.clone();

      url.pathname =
        "/login-admin";

      return NextResponse.redirect(
        url
      );
    }

    const rutaPermitida =
      pathname.startsWith(
        "/login-admin"
      ) ||
      pathname.startsWith(
        "/admin"
      ) ||
      pathname.startsWith(
        "/api/"
      ) ||
      pathname.startsWith(
        "/_next/"
      ) ||
      pathname.startsWith(
        "/icons/"
      ) ||
      pathname.startsWith(
        "/images/"
      ) ||
      pathname ===
        "/favicon.ico" ||
      pathname ===
        "/manifest.json";

    if (!rutaPermitida) {
      const url =
        request.nextUrl.clone();

      url.pathname =
        "/login-admin";

      return NextResponse.redirect(
        url
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};