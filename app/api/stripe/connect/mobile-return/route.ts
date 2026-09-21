import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const appUrl =
    "relydopromobile://settings?stripe=return";

  return new NextResponse(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    />
    <title>RELYDO Pro</title>
  </head>
  <body>
    <p>Returning to RELYDO Pro...</p>

    <script>
      window.location.replace(${JSON.stringify(appUrl)});
    </script>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}