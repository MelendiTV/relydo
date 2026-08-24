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
    host === "admin.relydo.co" ||
    host.startsWith(
      "admin.relydo.co:"
    );

  // ======================================================
  // SUBDOMINIO ADMIN
  // ======================================================

  if (esAdminSubdomain) {
    /*
      Cuando alguien entra simplemente a:

      https://admin.relydo.co

      lo enviamos al login administrativo.
    */

    if (pathname === "/") {
      const url =
        request.nextUrl.clone();

      url.pathname =
        "/login-admin";

      return NextResponse.redirect(
        url
      );
    }

    /*
      Permitimos únicamente las rutas necesarias
      para el sistema administrativo.

      También permitimos recursos internos de Next,
      imágenes, favicon y APIs para que la aplicación
      funcione correctamente.
    */

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

    /*
      Si estando en admin.relydo.co intentan entrar
      a una página pública de cliente/profesional,
      regresamos al acceso administrativo.
    */

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

  // ======================================================
  // DOMINIO NORMAL
  // ======================================================

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
      Ignoramos archivos estáticos comunes para evitar
      ejecutar middleware innecesariamente.
    */

    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};