import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUser } from "../../../lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleGeocodingResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
    formatted_address?: string;
  }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validCoordinate(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export async function POST(request: NextRequest) {
  try {
    /*
      SECURITY:
      This endpoint uses RELYDO's server-side Google Maps key.
      Only authenticated RELYDO users may use it.
    */
    const { user, error: authError } =
      await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error(
        "GOOGLE_MAPS_API_KEY is not configured."
      );

      return NextResponse.json(
        {
          error:
            "Geocoding service is not configured.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const addressLine1 = clean(
      body?.addressLine1
    );
    const addressLine2 = clean(
      body?.addressLine2
    );
    const city = clean(body?.city);
    const state = clean(body?.state);
    const zipCode = clean(body?.zipCode);

    if (
      !addressLine1 ||
      !city ||
      !state ||
      !/^\d{5}$/.test(zipCode)
    ) {
      return NextResponse.json(
        {
          error:
            "A valid U.S. address is required.",
        },
        { status: 400 }
      );
    }

    const address = [
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      "USA",
    ]
      .filter(Boolean)
      .join(", ");

    const url = new URL(
      "https://maps.googleapis.com/maps/api/geocode/json"
    );

    url.searchParams.set(
      "address",
      address
    );
    url.searchParams.set(
      "components",
      "country:US"
    );
    url.searchParams.set(
      "key",
      apiKey
    );

    const response = await fetch(
      url.toString(),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error(
        "Google Geocoding HTTP error:",
        response.status
      );

      return NextResponse.json(
        {
          error:
            "Geocoding service is temporarily unavailable.",
        },
        { status: 502 }
      );
    }

    const data =
      (await response.json()) as GoogleGeocodingResponse;

    if (data.status === "ZERO_RESULTS") {
      return NextResponse.json(
        {
          error:
            "Address could not be located.",
        },
        { status: 422 }
      );
    }

    if (data.status !== "OK") {
      console.error(
        "Google Geocoding error:",
        data.status,
        data.error_message || ""
      );

      return NextResponse.json(
        {
          error:
            "Address could not be geocoded.",
        },
        { status: 502 }
      );
    }

    const result = data.results?.[0];

    const lat = Number(
      result?.geometry?.location?.lat
    );

    const lng = Number(
      result?.geometry?.location?.lng
    );

    if (!validCoordinate(lat, lng)) {
      return NextResponse.json(
        {
          error:
            "Geocoding returned invalid coordinates.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      latitude: lat,
      longitude: lng,
      formattedAddress:
        result?.formatted_address || null,
    });
  } catch (error) {
    console.error(
      "Google geocoding failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "We could not geocode this address.",
      },
      { status: 500 }
    );
  }
}