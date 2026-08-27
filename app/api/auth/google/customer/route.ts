import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY!;

function crearAuthClient() {
  return createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function crearAdminClient() {
  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

async function obtenerUsuario(
  request: NextRequest
) {
  const authorization =
    request.headers.get("authorization") || "";

  const accessToken =
    authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

  if (!accessToken) {
    return {
      user: null,
      error: "Unauthorized.",
    };
  }

  const authClient =
    crearAuthClient();

  const {
    data,
    error,
  } =
    await authClient.auth.getUser(
      accessToken
    );

  if (
    error ||
    !data.user
  ) {
    return {
      user: null,
      error: "Unauthorized.",
    };
  }

  return {
    user: data.user,
    error: null,
  };
}

function obtenerNombre(
  metadata: Record<string, unknown>
) {
  const candidatos = [
    metadata.full_name,
    metadata.name,
    metadata.display_name,
  ];

  for (
    const candidato of candidatos
  ) {
    if (
      typeof candidato === "string" &&
      candidato.trim()
    ) {
      return candidato.trim();
    }
  }

  return "RELYDO customer";
}

function obtenerAvatar(
  metadata: Record<string, unknown>
) {
  const candidatos = [
    metadata.avatar_url,
    metadata.picture,
  ];

  for (
    const candidato of candidatos
  ) {
    if (
      typeof candidato === "string" &&
      candidato.trim()
    ) {
      return candidato.trim();
    }
  }

  return null;
}

function perfilCompleto(
  profile: {
    phone?: string | null;
    address_line1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    zip_code?: string | null;
  }
) {
  const postal =
    profile.zip ||
    profile.zip_code;

  return Boolean(
    profile.phone?.trim() &&
      profile.address_line1?.trim() &&
      profile.city?.trim() &&
      profile.state?.trim() &&
      postal?.trim()
  );
}

/*
  POST

  Se ejecuta después de que Google autentica al usuario.

  - valida el usuario;
  - protege cuentas provider/admin;
  - crea el perfil customer si no existe;
  - determina si falta completar información.
*/

export async function POST(
  request: NextRequest
) {
  try {
    if (
      !supabaseUrl ||
      !supabasePublishableKey ||
      !supabaseSecretKey
    ) {
      return NextResponse.json(
        {
          error:
            "Google customer authentication is not configured.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      user,
      error: userError,
    } =
      await obtenerUsuario(
        request
      );

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            userError ||
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const admin =
      crearAdminClient();

    const {
      data: existingProfile,
      error: profileReadError,
    } =
      await admin
        .from("profiles")
        .select(`
          id,
          role,
          full_name,
          email,
          phone,
          avatar_url,
          address_line1,
          address_line2,
          city,
          state,
          zip,
          zip_code
        `)
        .eq(
          "id",
          user.id
        )
        .maybeSingle();

    if (profileReadError) {
      throw profileReadError;
    }

    /*
      Nunca convertimos silenciosamente
      un provider/admin en customer.
    */

    if (
      existingProfile?.role &&
      existingProfile.role !== "customer"
    ) {
      return NextResponse.json(
        {
          error:
            "This Google account belongs to a different RELYDO account type.",
        },
        {
          status: 403,
        }
      );
    }

    const metadata =
      (user.user_metadata || {}) as Record<
        string,
        unknown
      >;

    const nombre =
      obtenerNombre(metadata);

    const avatar =
      obtenerAvatar(metadata);

    const email =
      user.email || null;

    /*
      Si Google creó Auth pero todavía no existe
      public.profiles, lo creamos como customer.
    */

    if (!existingProfile) {
      const {
        error: insertError,
      } =
        await admin
          .from("profiles")
          .insert({
            id: user.id,
            role: "customer",
            full_name: nombre,
            email,
            avatar_url: avatar,
          });

      if (insertError) {
        throw insertError;
      }
    } else {
      const updates: Record<
        string,
        unknown
      > = {};

      /*
        Rellenamos identidad solamente
        si esos campos están vacíos.
      */

      if (
        !existingProfile.full_name ||
        existingProfile.full_name ===
          "Deleted user"
      ) {
        updates.full_name =
          nombre;
      }

      if (
        !existingProfile.email &&
        email
      ) {
        updates.email =
          email;
      }

      if (
        !existingProfile.avatar_url &&
        avatar
      ) {
        updates.avatar_url =
          avatar;
      }

      if (
        Object.keys(updates).length >
        0
      ) {
        const {
          error: updateError,
        } =
          await admin
            .from("profiles")
            .update(updates)
            .eq(
              "id",
              user.id
            );

        if (updateError) {
          throw updateError;
        }
      }
    }

    /*
      Volvemos a leer el perfil final.
    */

    const {
      data: finalProfile,
      error: finalProfileError,
    } =
      await admin
        .from("profiles")
        .select(`
          id,
          role,
          full_name,
          email,
          phone,
          avatar_url,
          address_line1,
          address_line2,
          city,
          state,
          zip,
          zip_code
        `)
        .eq(
          "id",
          user.id
        )
        .single();

    if (finalProfileError) {
      throw finalProfileError;
    }

    return NextResponse.json({
      ok: true,

      needsProfileCompletion:
        !perfilCompleto(
          finalProfile
        ),

      profile: {
        full_name:
          finalProfile.full_name,

        email:
          finalProfile.email,

        phone:
          finalProfile.phone,

        address_line1:
          finalProfile.address_line1,

        address_line2:
          finalProfile.address_line2,

        city:
          finalProfile.city,

        state:
          finalProfile.state,

        zip:
          finalProfile.zip ||
          finalProfile.zip_code ||
          "",
      },
    });
  } catch (error) {
    console.error(
      "Google customer auth preparation failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "We could not prepare the RELYDO customer profile.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
  PATCH

  Guarda teléfono/dirección que Google
  no proporciona.
*/

export async function PATCH(
  request: NextRequest
) {
  try {
    if (
      !supabaseUrl ||
      !supabasePublishableKey ||
      !supabaseSecretKey
    ) {
      return NextResponse.json(
        {
          error:
            "Google customer authentication is not configured.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      user,
      error: userError,
    } =
      await obtenerUsuario(
        request
      );

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            userError ||
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const phone =
      String(
        body?.phone || ""
      ).trim();

    const addressLine1 =
      String(
        body?.address_line1 || ""
      ).trim();

    const addressLine2 =
      String(
        body?.address_line2 || ""
      ).trim();

    const city =
      String(
        body?.city || ""
      ).trim();

    const state =
      String(
        body?.state || ""
      )
        .trim()
        .toUpperCase()
        .slice(0, 2);

    const zip =
      String(
        body?.zip || ""
      ).trim();

    if (
      !phone ||
      !addressLine1 ||
      !city ||
      !state ||
      !zip
    ) {
      return NextResponse.json(
        {
          error:
            "Complete all required customer profile fields.",
        },
        {
          status: 400,
        }
      );
    }

    const admin =
      crearAdminClient();

    const {
      data: profile,
      error: profileError,
    } =
      await admin
        .from("profiles")
        .select(`
          id,
          role
        `)
        .eq(
          "id",
          user.id
        )
        .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (
      !profile ||
      profile.role !== "customer"
    ) {
      return NextResponse.json(
        {
          error:
            "This account is not a RELYDO customer account.",
        },
        {
          status: 403,
        }
      );
    }

    const {
      error: updateError,
    } =
      await admin
        .from("profiles")
        .update({
          phone,

          address_line1:
            addressLine1,

          address_line2:
            addressLine2 || null,

          city,
          state,

          zip,
          zip_code: zip,
        })
        .eq(
          "id",
          user.id
        );

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "Google customer profile completion failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "We could not complete the customer profile.",
      },
      {
        status: 500,
      }
    );
  }
}