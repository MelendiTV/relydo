import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProviderZip = {
  id: string;
  zip: string | null;
};

type Coordenadas = {
  lat: number;
  lon: number;
};

function normalizarZip(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{5})(?:-\d{4})?$/);
  return match ? match[1] : "";
}

async function coordenadasZip(
  zip: string
): Promise<Coordenadas | null> {
  try {
    const response = await fetch(
      `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "force-cache",
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const place = data?.places?.[0];

    const lat = Number(place?.latitude);
    const lon = Number(place?.longitude);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return null;
    }

    return { lat, lon };
  } catch (error) {
    console.error(
      "No se pudo geocodificar ZIP:",
      zip,
      error
    );
    return null;
  }
}

function millasEntre(
  a: Coordenadas,
  b: Coordenadas
) {
  const radioTierraMillas = 3958.7613;
  const rad = (grados: number) =>
    (grados * Math.PI) / 180;

  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);

  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    radioTierraMillas *
    Math.asin(Math.sqrt(h))
  );
}

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    const customerZip =
      normalizarZip(body?.customerZip);

    const providerZips = Array.isArray(
      body?.providerZips
    )
      ? (body.providerZips as ProviderZip[])
      : [];

    if (!customerZip) {
      return NextResponse.json(
        { error: "Invalid customer ZIP." },
        { status: 400 }
      );
    }

    if (providerZips.length > 200) {
      return NextResponse.json(
        { error: "Too many providers." },
        { status: 400 }
      );
    }

    const customerCoords =
      await coordenadasZip(customerZip);

    if (!customerCoords) {
      return NextResponse.json(
        { error: "Customer ZIP could not be geocoded." },
        { status: 422 }
      );
    }

    const uniqueZips = [
      ...new Set(
        providerZips
          .map((item) =>
            normalizarZip(item?.zip)
          )
          .filter(Boolean)
      ),
    ];

    const zipCoords = new Map<
      string,
      Coordenadas | null
    >();

    await Promise.all(
      uniqueZips.map(async (zip) => {
        zipCoords.set(
          zip,
          await coordenadasZip(zip)
        );
      })
    );

    const distances: Record<
      string,
      number | null
    > = {};

    for (const provider of providerZips) {
      if (!provider?.id) continue;

      const zip = normalizarZip(
        provider.zip
      );

      const coords = zip
        ? zipCoords.get(zip)
        : null;

      distances[provider.id] = coords
        ? Number(
            millasEntre(
              customerCoords,
              coords
            ).toFixed(2)
          )
        : null;
    }

    return NextResponse.json({
      ok: true,
      distances,
    });
  } catch (error) {
    console.error(
      "ZIP distance calculation failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "We could not calculate service distance.",
      },
      { status: 500 }
    );
  }
}
