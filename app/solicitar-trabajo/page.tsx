"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  useLanguage,
} from "@/app/components/LanguageProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type ProfesionalElegido = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
};

type FotoSubida = {
  request_id: string;
  file_url: string;
};

type FotoSeleccionada = {
  id: string;
  file: File;
};

const TIPOS_IMAGEN_PERMITIDOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function VistaPreviaFoto({
  file,
  alt,
}: {
  file: File;
  alt: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelado = false;
    let bitmap: ImageBitmap | null = null;

    async function dibujar() {
      try {
        bitmap = await createImageBitmap(file);

        if (cancelado || !canvasRef.current) {
          return;
        }

        const canvas = canvasRef.current;
        const contexto = canvas.getContext("2d");

        if (!contexto) {
          return;
        }

        const ancho = 480;
        const alto = 320;

        canvas.width = ancho;
        canvas.height = alto;

        const escala = Math.max(
          ancho / bitmap.width,
          alto / bitmap.height
        );

        const anchoDibujo = bitmap.width * escala;
        const altoDibujo = bitmap.height * escala;
        const x = (ancho - anchoDibujo) / 2;
        const y = (alto - altoDibujo) / 2;

        contexto.clearRect(0, 0, ancho, alto);
        contexto.drawImage(
          bitmap,
          x,
          y,
          anchoDibujo,
          altoDibujo
        );
      } catch (error) {
        console.warn(
          "No se pudo generar la vista previa de la imagen:",
          error
        );
      } finally {
        bitmap?.close();
        bitmap = null;
      }
    }

    void dibujar();

    return () => {
      cancelado = true;
      bitmap?.close();
    };
  }, [file]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      className="h-36 w-full object-cover"
    />
  );
}

function nombreOficio(
  trade: string | null,
  language: "es" | "en"
) {
  const oficiosEs: Record<string, string> = {
    plumbing: "Plomería",
    electrical: "Electricidad",
    hvac: "HVAC / Aire acondicionado",
    carpentry: "Carpintería",
    painting: "Pintura",
    landscaping: "Jardinería",
    cleaning: "Limpieza",
    moving: "Mudanzas",
    handyman: "Handyman",
    "appliance-repair":
      "Reparación de electrodomésticos",
    other: "Otros servicios",
  };

  const oficiosEn: Record<string, string> = {
    plumbing: "Plumbing",
    electrical: "Electrical",
    hvac: "HVAC / Air conditioning",
    carpentry: "Carpentry",
    painting: "Painting",
    landscaping: "Landscaping",
    cleaning: "Cleaning",
    moving: "Moving",
    handyman: "Handyman",
    "appliance-repair":
      "Appliance repair",
    other: "Other services",
  };

  if (!trade) {
    return language === "es"
      ? "Profesional"
      : "Professional";
  }

  const oficios =
    language === "es"
      ? oficiosEs
      : oficiosEn;

  return oficios[trade] || trade;
}

function SolicitarTrabajoContenido() {
  const router = useRouter();

  const searchParams =
    useSearchParams();

  const { language } =
    useLanguage();

  const profesionalId =
    searchParams.get("profesional");

  const [enviado, setEnviado] =
    useState(false);

  const [enviando, setEnviando] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    cargandoProfesional,
    setCargandoProfesional,
  ] = useState(false);

  const [
    profesional,
    setProfesional,
  ] =
    useState<ProfesionalElegido | null>(
      null
    );

  const [
    cantidadFotos,
    setCantidadFotos,
  ] = useState(0);

  const [
    fotosSeleccionadas,
    setFotosSeleccionadas,
  ] = useState<FotoSeleccionada[]>([]);

  const text =
    language === "es"
      ? {
          volver: "Volver",
          titulo: "Solicitar trabajo",
          descripcion:
            "Cuéntanos qué necesitas y encontraremos profesionales que puedan ayudarte.",
          verificandoProfesional:
            "Verificando profesional seleccionado...",
          profesionalPreferido:
            "Profesional preferido",
          profesionalRelydo:
            "Profesional RELYDO",
          profesionalVerificado:
            "Profesional verificado por RELYDO",
          tipoServicio:
            "Tipo de servicio *",
          seleccionarServicio:
            "Selecciona un servicio",
          problema:
            "¿Qué problema tienes? *",
          problemaPlaceholder:
            "Ej: Tengo una fuga debajo del fregadero",
          describir:
            "Describe el trabajo *",
          describirPlaceholder:
            "Explica con más detalle qué está pasando...",
          fotosProblema:
            "Fotos del problema",
          fotosAyuda:
            "Puedes agregar una o varias fotos, hasta un máximo de 5.",
          seleccionarFotos:
            "Seleccionar fotos",
          agregarFotos:
            "Agregar más fotos",
          fotosFormato:
            "JPG, PNG, WEBP u otra imagen compatible · Máximo 10 MB por foto",
          foto: "Foto",
          agregarMasAyuda:
            "Puedes volver a pulsar “Agregar más fotos” y seleccionar otras. Las anteriores no se perderán.",
          maxFotosSeleccionadas:
            "Has seleccionado el máximo de 5 fotos.",
          nombre: "Nombre *",
          nombrePlaceholder:
            "Tu nombre",
          telefono: "Teléfono *",
          email: "Email *",
          direccion: "Dirección *",
          ciudad: "Ciudad *",
          estado: "Estado *",
          zip: "ZIP *",
          fechaPreferida:
            "Fecha preferida",
          horaPreferida:
            "Hora preferida",
          solicitudPreferidaAntes:
            "Esta solicitud se registrará con",
          solicitudPreferidaDespues:
            "como tu profesional preferido.",
          esteProfesional:
            "este profesional",
          solicitudAbierta:
            "Esta solicitud quedará abierta para que profesionales verificados puedan revisarla y enviarte sus ofertas.",
          enviarSolicitud:
            "Enviar solicitud",
          creandoSolicitud:
            "Creando solicitud",
          ySubiendo:
            "y subiendo",
          fotoSingular:
            "foto",
          fotoPlural:
            "fotos",
          solicitudEnviada:
            "Solicitud enviada",
          enviadaCon:
            "Tu solicitud fue enviada con",
          profesionalSeleccionado:
            "el profesional seleccionado",
          comoPreferido:
            "como profesional preferido.",
          recibida:
            "Hemos recibido tu solicitud.",
          profesionalesOfertas:
            "Profesionales verificados podrán revisar el trabajo y enviarte sus ofertas.",
          unaFotoSubida:
            "1 foto fue subida correctamente.",
          fotosSubidas:
            "fotos fueron subidas correctamente.",
          verSolicitudes:
            "Ver mis solicitudes",
          cargando:
            "Cargando...",
          todosObligatorios:
            "Completa todos los campos obligatorios.",
          fechaPasada:
            "La fecha preferida no puede ser anterior a hoy.",
          profesionalInvalido:
            "El profesional seleccionado no es válido o ya no está disponible.",
          verificarProfesionalError:
            "No pudimos verificar el profesional seleccionado.",
          profesionalNoDisponible:
            "El profesional seleccionado ya no está disponible o no está verificado.",
          noImagen:
            "no es una imagen válida.",
          supera10Mb:
            "supera el límite de 10 MB.",
          maxCinco:
            "Puedes seleccionar un máximo de 5 fotos.",
          agregarFotosError:
            "No se pudieron agregar las fotos.",
          solicitudFotoUploadError:
            "La solicitud fue creada, pero hubo un problema subiendo",
          fotosAsociarError:
            "Las fotos se subieron, pero no se pudieron asociar a la solicitud",
          cuentaError:
            "No pudimos verificar tu cuenta",
          servicioError:
            "No pudimos identificar el servicio seleccionado.",
          crearError:
            "No se pudo crear la solicitud.",
          inesperado:
            "Ocurrió un error inesperado.",
          servicios: {
            plumbing: "Plomería",
            electrical: "Electricidad",
            painting: "Pintura",
            landscaping: "Jardinería",
            cleaning: "Limpieza",
            hvac: "Aire acondicionado / HVAC",
            carpentry: "Carpintería",
            moving: "Mudanzas",
            applianceRepair:
              "Reparación de electrodomésticos",
            handyman: "Handyman",
            other: "Otros servicios",
          },
        }
      : {
          volver: "Back",
          titulo: "Request a job",
          descripcion:
            "Tell us what you need and we'll find professionals who can help.",
          verificandoProfesional:
            "Verifying selected professional...",
          profesionalPreferido:
            "Preferred professional",
          profesionalRelydo:
            "RELYDO Professional",
          profesionalVerificado:
            "Professional verified by RELYDO",
          tipoServicio:
            "Service type *",
          seleccionarServicio:
            "Select a service",
          problema:
            "What problem do you have? *",
          problemaPlaceholder:
            "Example: I have a leak under the sink",
          describir:
            "Describe the job *",
          describirPlaceholder:
            "Explain in more detail what is happening...",
          fotosProblema:
            "Photos of the problem",
          fotosAyuda:
            "You can add one or more photos, up to a maximum of 5.",
          seleccionarFotos:
            "Select photos",
          agregarFotos:
            "Add more photos",
          fotosFormato:
            "JPG, PNG, WEBP or another compatible image · Maximum 10 MB per photo",
          foto: "Photo",
          agregarMasAyuda:
            "You can tap “Add more photos” again and select more. Your previous photos will not be lost.",
          maxFotosSeleccionadas:
            "You have selected the maximum of 5 photos.",
          nombre: "Name *",
          nombrePlaceholder:
            "Your name",
          telefono: "Phone *",
          email: "Email *",
          direccion: "Address *",
          ciudad: "City *",
          estado: "State *",
          zip: "ZIP *",
          fechaPreferida:
            "Preferred date",
          horaPreferida:
            "Preferred time",
          solicitudPreferidaAntes:
            "This request will be created with",
          solicitudPreferidaDespues:
            "as your preferred professional.",
          esteProfesional:
            "this professional",
          solicitudAbierta:
            "This request will remain open so verified professionals can review it and send you offers.",
          enviarSolicitud:
            "Submit request",
          creandoSolicitud:
            "Creating request",
          ySubiendo:
            "and uploading",
          fotoSingular:
            "photo",
          fotoPlural:
            "photos",
          solicitudEnviada:
            "Request submitted",
          enviadaCon:
            "Your request was sent with",
          profesionalSeleccionado:
            "the selected professional",
          comoPreferido:
            "as your preferred professional.",
          recibida:
            "We received your request.",
          profesionalesOfertas:
            "Verified professionals can review the job and send you offers.",
          unaFotoSubida:
            "1 photo was uploaded successfully.",
          fotosSubidas:
            "photos were uploaded successfully.",
          verSolicitudes:
            "View my requests",
          cargando:
            "Loading...",
          todosObligatorios:
            "Complete all required fields.",
          fechaPasada:
            "The preferred date cannot be earlier than today.",
          profesionalInvalido:
            "The selected professional is invalid or no longer available.",
          verificarProfesionalError:
            "We could not verify the selected professional.",
          profesionalNoDisponible:
            "The selected professional is no longer available or is not verified.",
          noImagen:
            "is not a valid image.",
          supera10Mb:
            "exceeds the 10 MB limit.",
          maxCinco:
            "You can select a maximum of 5 photos.",
          agregarFotosError:
            "The photos could not be added.",
          solicitudFotoUploadError:
            "The request was created, but there was a problem uploading",
          fotosAsociarError:
            "The photos were uploaded, but could not be linked to the request",
          cuentaError:
            "We could not verify your account",
          servicioError:
            "We could not identify the selected service.",
          crearError:
            "The request could not be created.",
          inesperado:
            "An unexpected error occurred.",
          servicios: {
            plumbing: "Plumbing",
            electrical: "Electrical",
            painting: "Painting",
            landscaping: "Landscaping",
            cleaning: "Cleaning",
            hvac: "Air conditioning / HVAC",
            carpentry: "Carpentry",
            moving: "Moving",
            applianceRepair:
              "Appliance repair",
            handyman: "Handyman",
            other: "Other services",
          },
        };

  useEffect(() => {
    if (profesionalId) {
      cargarProfesional(
        profesionalId
      );
    } else {
      setProfesional(null);
    }
  }, [profesionalId]);

  async function cargarProfesional(
    userId: string
  ) {
    setCargandoProfesional(true);
    setError("");

    const {
      data,
      error: profesionalError,
    } = await supabase
      .from("provider_profiles")
      .select(`
        user_id,
        business_name,
        trade
      `)
      .eq(
        "user_id",
        userId
      )
      .eq(
        "verification_status",
        "verified"
      )
      .eq(
        "verified",
        true
      )
      .eq(
        "active",
        true
      )
      .maybeSingle();

    if (profesionalError) {
      console.error(
        "Error cargando profesional:",
        profesionalError
      );

      setError(
        text.verificarProfesionalError
      );

      setProfesional(null);
      setCargandoProfesional(false);

      return;
    }

    if (!data) {
      setError(
        text.profesionalNoDisponible
      );

      setProfesional(null);
      setCargandoProfesional(false);

      return;
    }

    setProfesional(data);
    setCargandoProfesional(false);
  }

  /*
    VALIDAR UNA FOTO
  */

  function validarFoto(
    file: File
  ) {
    const MAX_SIZE =
      10 * 1024 * 1024;

    if (
      !Object.prototype.hasOwnProperty.call(
        TIPOS_IMAGEN_PERMITIDOS,
        file.type
      )
    ) {
      throw new Error(
        `"${file.name}" ${text.noImagen}`
      );
    }

    if (
      file.size >
      MAX_SIZE
    ) {
      throw new Error(
        `"${file.name}" ${text.supera10Mb}`
      );
    }
  }

  /*
    AGREGAR FOTOS

    Permite:
    - escoger varias a la vez
    - agregar una después de otra
    - máximo 5
  */

  async function agregarFotos(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const nuevas =
      Array.from(
        event.target.files || []
      );

    if (
      nuevas.length === 0
    ) {
      return;
    }

    setError("");

    try {
      nuevas.forEach(
        validarFoto
      );

      await Promise.all(
        nuevas.map(async (file) => {
          try {
            const bitmap =
              await createImageBitmap(file);

            bitmap.close();
          } catch {
            throw new Error(
              `"${file.name}" ${text.noImagen}`
            );
          }
        })
      );

      setFotosSeleccionadas(
        (actuales) => {
          const unicas =
            nuevas.filter(
              (file) =>
                !actuales.some(
                  (actual) =>
                    actual.file.name ===
                      file.name &&
                    actual.file.size ===
                      file.size &&
                    actual.file.lastModified ===
                      file.lastModified
                )
            );

          const disponibles =
            Math.max(
              0,
              5 - actuales.length
            );

          const permitidas =
            unicas.slice(
              0,
              disponibles
            );

          if (
            unicas.length >
            disponibles
          ) {
            setError(
              text.maxCinco
            );
          }

          const nuevasSeleccionadas =
            permitidas.map(
              (file) => ({
                id:
                  crypto.randomUUID(),
                file,
              })
            );

          return [
            ...actuales,
            ...nuevasSeleccionadas,
          ];
        }
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : text.agregarFotosError
      );
    } finally {
      /*
        IMPORTANTE:
        permite volver a abrir el selector
        y agregar más imágenes sin reemplazar
        las anteriores.
      */
      event.target.value =
        "";
    }
  }

  function eliminarFoto(
    id: string
  ) {
    setFotosSeleccionadas(
      (actuales) =>
        actuales.filter(
          (item) =>
            item.id !== id
        )
    );
  }

  function limpiarFotos() {
    setFotosSeleccionadas([]);
  }

  function validarFotos(
    files: File[]
  ) {
    const MAX_FOTOS = 5;

    if (
      files.length >
      MAX_FOTOS
    ) {
      throw new Error(
        text.maxCinco
      );
    }

    files.forEach(
      validarFoto
    );
  }

  async function subirFotos(
    requestId: string,
    files: File[]
  ) {
    if (
      files.length === 0
    ) {
      return;
    }

    const fotosParaGuardar:
      FotoSubida[] = [];

    const archivosSubidos:
      string[] = [];

    try {
      for (const file of files) {
        const extension =
          TIPOS_IMAGEN_PERMITIDOS[
            file.type
          ];

        if (!extension) {
          throw new Error(
            `"${file.name}" ${text.noImagen}`
          );
        }

        const nombreArchivo =
          `${crypto.randomUUID()}.${extension}`;

        const filePath =
          `${requestId}/${nombreArchivo}`;

        const {
          error: uploadError,
        } =
          await supabase.storage
            .from("request-photos")
            .upload(
              filePath,
              file,
              {
                cacheControl:
                  "3600",

                upsert: false,

                contentType:
                  file.type,
              }
            );

        if (uploadError) {
          console.error(
            "Error subiendo foto de solicitud:",
            uploadError
          );

          throw new Error(
            `${text.solicitudFotoUploadError} "${file.name}".`
          );
        }

        archivosSubidos.push(
          filePath
        );

        const {
          data:
            publicUrlData,
        } =
          supabase.storage
            .from("request-photos")
            .getPublicUrl(
              filePath
            );

        fotosParaGuardar.push(
          {
            request_id:
              requestId,

            file_url:
              publicUrlData.publicUrl,
          }
        );
      }

      const {
        error: photosError,
      } = await supabase
        .from("request_photos")
        .insert(
          fotosParaGuardar
        );

      if (photosError) {
        console.error(
          "Error asociando fotos a la solicitud:",
          photosError
        );

        throw new Error(
          text.fotosAsociarError
        );
      }
    } catch (error) {
      /*
        Si falla cualquier upload posterior o falla
        la asociación en request_photos, eliminamos
        del bucket todos los objetos que sí alcanzaron
        a subirse en este intento. Así no quedan
        archivos huérfanos.
      */
      if (
        archivosSubidos.length >
        0
      ) {
        const {
          error: cleanupError,
        } =
          await supabase.storage
            .from("request-photos")
            .remove(
              archivosSubidos
            );

        if (cleanupError) {
          console.error(
            "Error limpiando fotos huérfanas:",
            cleanupError
          );
        }
      }

      throw error;
    }
  }

  function obtenerReturnUrl() {
    return profesionalId
      ? `/solicitar-trabajo?profesional=${profesionalId}`
      : "/solicitar-trabajo";
  }

  function irALoginCliente() {
    const returnUrl =
      obtenerReturnUrl();

    window.location.href =
      `/login-cliente?redirect=${encodeURIComponent(
        returnUrl
      )}`;
  }

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setEnviando(true);
    setError("");

    const form =
      e.currentTarget;

    const formData =
      new FormData(form);

    const serviceSlug =
      String(
        formData.get(
          "service"
        ) || ""
      ).trim();

    const title =
      String(
        formData.get(
          "title"
        ) || ""
      ).trim();

    const description =
      String(
        formData.get(
          "description"
        ) || ""
      ).trim();

    const customerName =
      String(
        formData.get(
          "customer_name"
        ) || ""
      ).trim();

    const customerPhone =
      String(
        formData.get(
          "customer_phone"
        ) || ""
      ).trim();

    const customerEmail =
      String(
        formData.get(
          "customer_email"
        ) || ""
      )
        .trim()
        .toLowerCase();

    const addressLine1 =
      String(
        formData.get(
          "address_line1"
        ) || ""
      ).trim();

    const city =
      String(
        formData.get(
          "city"
        ) || ""
      ).trim();

    const state =
      String(
        formData.get(
          "state"
        ) || ""
      )
        .trim()
        .toUpperCase();

    const zipCode =
      String(
        formData.get(
          "zip_code"
        ) || ""
      ).trim();

    const preferredDate =
      String(
        formData.get(
          "preferred_date"
        ) || ""
      ).trim();

    const preferredTime =
      String(
        formData.get(
          "preferred_time"
        ) || ""
      ).trim();

    const hoyLocal =
      new Date();
    const hoy =
      `${hoyLocal.getFullYear()}-${String(
        hoyLocal.getMonth() + 1
      ).padStart(2, "0")}-${String(
        hoyLocal.getDate()
      ).padStart(2, "0")}`;

    if (
      preferredDate &&
      preferredDate < hoy
    ) {
      setError(
        text.fechaPasada
      );
      setEnviando(false);
      return;
    }

    /*
      AHORA LAS FOTOS VIENEN DEL ESTADO,
      NO DEL INPUT DIRECTAMENTE.
    */

    const fotos =
      fotosSeleccionadas.map(
        (item) =>
          item.file
      );

    if (
      !serviceSlug ||
      !title ||
      !description ||
      !customerName ||
      !customerPhone ||
      !customerEmail ||
      !addressLine1 ||
      !city ||
      !state ||
      !zipCode
    ) {
      setError(
        text.todosObligatorios
      );

      setEnviando(false);

      return;
    }

    if (
      profesionalId &&
      !profesional
    ) {
      setError(
        text.profesionalInvalido
      );

      setEnviando(false);

      return;
    }

    try {
      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !user
      ) {
        irALoginCliente();
        return;
      }

      const {
        data:
          perfilCliente,
        error:
          perfilError,
      } = await supabase
        .from("profiles")
        .select("role")
        .eq(
          "id",
          user.id
        )
        .maybeSingle();

      if (perfilError) {
        console.error(
          "Error cargando perfil del cliente:",
          perfilError
        );

        throw new Error(
          text.cuentaError
        );
      }

      if (!perfilCliente) {
        await supabase.auth.signOut();

        irALoginCliente();

        return;
      }

      if (
        perfilCliente.role !== "customer"
      ) {
        await supabase.auth.signOut();

        irALoginCliente();

        return;
      }

      const customerId =
        user.id;

      validarFotos(
        fotos
      );

      const {
        data: service,
        error:
          serviceError,
      } = await supabase
        .from("services")
        .select("id")
        .eq(
          "slug",
          serviceSlug
        )
        .eq(
          "active",
          true
        )
        .maybeSingle();

      if (
        serviceError ||
        !service
      ) {
        console.error(
          "Error buscando servicio:",
          serviceError
        );

        throw new Error(
          text.servicioError
        );
      }

      const {
        data:
          nuevaSolicitud,
        error:
          insertError,
      } = await supabase
        .from(
          "service_requests"
        )
        .insert({
          customer_id:
            customerId,

          service_id:
            service.id,

          preferred_provider_id:
            profesional?.user_id ||
            null,

          title,

          description,

          customer_name:
            customerName,

          customer_phone:
            customerPhone,

          customer_email:
            customerEmail,

          address_line1:
            addressLine1,

          city,

          state,

          zip_code:
            zipCode,

          preferred_date:
            preferredDate ||
            null,

          preferred_time:
            preferredTime ||
            null,

          status:
            "open",
        })
        .select("id")
        .single();

      if (
        insertError ||
        !nuevaSolicitud
      ) {
        console.error(
          "Error guardando solicitud:",
          insertError
        );

        throw new Error(
          text.crearError
        );
      }

      await subirFotos(
        nuevaSolicitud.id,
        fotos
      );

      /*
        AVISAR A PROFESIONALES POR PUSH

        La solicitud ya quedó creada.
        Si el Push falla, NO cancelamos
        ni dañamos la orden del cliente.
      */

      try {
        const {
          data: {
            session,
          },
        } =
          await supabase.auth.getSession();

        const accessToken =
          session?.access_token;

        if (accessToken) {
          const pushResponse =
            await fetch(
              "/api/push/new-job",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  Authorization:
                    `Bearer ${accessToken}`,
                },

                body:
                  JSON.stringify({
                    requestId:
                      nuevaSolicitud.id,
                  }),
              }
            );

          const pushResult =
            await pushResponse
              .json()
              .catch(() => null);

          if (!pushResponse.ok) {
            console.warn(
              "La solicitud se creó, pero el Push no pudo enviarse:",
              pushResult
            );
          } else {
            console.log(
              "Push nuevo trabajo:",
              pushResult
            );
          }
        } else {
          console.warn(
            "La solicitud se creó, pero no encontramos access token para enviar Push."
          );
        }
      } catch (pushError) {
        console.warn(
          "La solicitud se creó, pero ocurrió un error enviando Push:",
          pushError
        );
      }

      setCantidadFotos(
        fotos.length
      );

      limpiarFotos();

      setEnviado(true);

      form.reset();
    } catch (err) {
      console.error(
        err
      );

      if (
        err instanceof Error
      ) {
        setError(
          err.message
        );
      } else {
        setError(
          text.inesperado
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-6 py-10">

        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-xl">

          <div className="text-6xl">
            ✅
          </div>

          <h1 className="mt-4 text-3xl font-extrabold text-slate-900">
            {text.solicitudEnviada}
          </h1>

          {profesional ? (
            <p className="mt-4 text-slate-600">
              {text.enviadaCon}{" "}
              <strong>
                {profesional.business_name ||
                  text.profesionalSeleccionado}
              </strong>{" "}
              {text.comoPreferido}
            </p>
          ) : (
            <>
              <p className="mt-4 text-slate-600">
                {text.recibida}
              </p>

              <p className="mt-2 text-slate-600">
                {text.profesionalesOfertas}
              </p>
            </>
          )}

          {cantidadFotos >
            0 && (
            <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-800">
              📷{" "}
              {cantidadFotos ===
              1
                ? text.unaFotoSubida
                : `${cantidadFotos} ${text.fotosSubidas}`}
            </div>
          )}

          <a
            href="/mis-solicitudes"
            className="mt-8 inline-block rounded-xl bg-blue-700 px-8 py-3 font-bold text-white hover:bg-blue-800"
          >
            {text.verSolicitudes}
          </a>

        </div>

      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-12">

      <div className="mx-auto max-w-3xl">

        <div className="mb-8">

          <button
            type="button"
            onClick={() => router.back()}
            aria-label={text.volver}
            title={text.volver}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-2xl text-slate-700 shadow-sm transition hover:-translate-x-0.5 hover:border-blue-300 hover:text-blue-700 hover:shadow-md"
          >
            ←
          </button>

        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">

          {/* HEADER */}

          <div className="bg-blue-700 p-8 text-white">

            <div className="text-2xl font-black">
              RELYDO
            </div>

            <h1 className="mt-2 text-4xl font-extrabold">
              {text.titulo}
            </h1>

            <p className="mt-2 text-blue-100">
              {text.descripcion}
            </p>

          </div>

          <div className="p-8">

            {cargandoProfesional && (
              <div className="mb-7 rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <p className="font-bold text-blue-900">
                  {text.verificandoProfesional}
                </p>
              </div>
            )}

            {profesional && (
              <div className="mb-7 rounded-2xl border border-green-200 bg-green-50 p-5">

                <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                  {text.profesionalPreferido}
                </p>

                <h2 className="mt-1 text-xl font-extrabold text-green-900">
                  {profesional.business_name ||
                    text.profesionalRelydo}
                </h2>

                <p className="mt-1 text-green-800">
                  {nombreOficio(
                    profesional.trade,
                    language
                  )}
                </p>

                <p className="mt-3 text-sm text-green-800">
                  ✓ {text.profesionalVerificado}
                </p>

              </div>
            )}

            {error && (
              <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4">
                <p className="font-medium text-red-700">
                  {error}
                </p>
              </div>
            )}

            <form
              onSubmit={
                handleSubmit
              }
              className="space-y-6"
            >

              <div>

                <label className="mb-2 block font-bold text-slate-900">
                  {text.tipoServicio}
                </label>

                <select
                  name="service"
                  required
                  defaultValue={
                    profesional?.trade ||
                    ""
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900"
                >

                  <option
                    value=""
                    disabled
                  >
                    {text.seleccionarServicio}
                  </option>

                  <option value="plumbing">
                    {text.servicios.plumbing}
                  </option>

                  <option value="electrical">
                    {text.servicios.electrical}
                  </option>

                  <option value="painting">
                    {text.servicios.painting}
                  </option>

                  <option value="landscaping">
                    {text.servicios.landscaping}
                  </option>

                  <option value="cleaning">
                    {text.servicios.cleaning}
                  </option>

                  <option value="hvac">
                    {text.servicios.hvac}
                  </option>

                  <option value="carpentry">
                    {text.servicios.carpentry}
                  </option>

                  <option value="moving">
                    {text.servicios.moving}
                  </option>

                  <option value="appliance-repair">
                    {text.servicios.applianceRepair}
                  </option>

                  <option value="handyman">
                    {text.servicios.handyman}
                  </option>

                  <option value="other">
                    {text.servicios.other}
                  </option>

                </select>

              </div>

              <div>

                <label className="mb-2 block font-bold text-slate-900">
                  {text.problema}
                </label>

                <input
                  name="title"
                  type="text"
                  required
                  placeholder={text.problemaPlaceholder}
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900"
                />

              </div>

              <div>

                <label className="mb-2 block font-bold text-slate-900">
                  {text.describir}
                </label>

                <textarea
                  name="description"
                  required
                  rows={5}
                  placeholder={text.describirPlaceholder}
                  className="w-full resize-none rounded-xl border border-slate-300 p-4 text-slate-900"
                />

              </div>

              {/* FOTOS MEJORADAS */}

              <div>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <label className="block font-bold text-slate-900">
                      {text.fotosProblema}
                    </label>

                    <p className="mt-1 text-sm text-slate-500">
                      {text.fotosAyuda}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-sm font-black ${
                      fotosSeleccionadas.length >= 5
                        ? "bg-green-100 text-green-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {fotosSeleccionadas.length}/5
                  </span>
                </div>

                <label
                  className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition ${
                    fotosSeleccionadas.length >= 5
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
                      : "border-blue-300 bg-blue-50/50 hover:border-blue-500 hover:bg-blue-50"
                  }`}
                >
                  <div className="text-4xl">
                    📷
                  </div>

                  <p className="mt-3 font-extrabold text-slate-900">
                    {fotosSeleccionadas.length === 0
                      ? text.seleccionarFotos
                      : text.agregarFotos}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {text.fotosFormato}
                  </p>

                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    disabled={
                      fotosSeleccionadas.length >= 5
                    }
                    onChange={
                      agregarFotos
                    }
                    className="hidden"
                  />
                </label>

                {fotosSeleccionadas.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {fotosSeleccionadas.map(
                      (
                        foto,
                        index
                      ) => (
                        <div
                          key={
                            foto.id
                          }
                          className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                        >
                          <VistaPreviaFoto
                            file={foto.file}
                            alt={`${text.foto} ${
                              index + 1
                            }`}
                          />

                          <div className="absolute inset-x-0 bottom-0 bg-slate-950/70 px-3 py-2 text-xs font-bold text-white">
                            {text.foto}{" "}
                            {index + 1}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              eliminarFoto(
                                foto.id
                              )
                            }
                            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-black text-red-600 shadow-lg transition hover:bg-red-50"
                            aria-label={`Eliminar foto ${
                              index + 1
                            }`}
                          >
                            ×
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}

                {fotosSeleccionadas.length > 0 &&
                  fotosSeleccionadas.length < 5 && (
                    <p className="mt-3 text-sm font-medium text-blue-700">
                      {text.agregarMasAyuda}
                    </p>
                  )}

                {fotosSeleccionadas.length === 5 && (
                  <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">
                    ✓ {text.maxFotosSeleccionadas}
                  </div>
                )}

              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

                <div>

                  <label className="mb-2 block font-bold text-slate-900">
                    {text.nombre}
                  </label>

                  <input
                    name="customer_name"
                    type="text"
                    required
                    placeholder={text.nombrePlaceholder}
                    className="w-full rounded-xl border border-slate-300 p-4 text-slate-900"
                  />

                </div>

                <div>

                  <label className="mb-2 block font-bold text-slate-900">
                    {text.telefono}
                  </label>

                  <input
                    name="customer_phone"
                    type="tel"
                    required
                    placeholder="(702) 555-1234"
                    className="w-full rounded-xl border border-slate-300 p-4 text-slate-900"
                  />

                </div>

              </div>

              <div>

                <label className="mb-2 block font-bold text-slate-900">
                  {text.email}
                </label>

                <input
                  name="customer_email"
                  type="email"
                  required
                  placeholder="tu@email.com"
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900"
                />

              </div>

              <div>

                <label className="mb-2 block font-bold text-slate-900">
                  {text.direccion}
                </label>

                <input
                  name="address_line1"
                  type="text"
                  required
                  placeholder="123 Main St"
                  className="w-full rounded-xl border border-slate-300 p-4 text-slate-900"
                />

              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">

                <div>

                  <label className="mb-2 block font-bold text-slate-900">
                    {text.ciudad}
                  </label>

                  <input
                    name="city"
                    type="text"
                    required
                    placeholder="Las Vegas"
                    className="w-full rounded-xl border border-slate-300 p-4 text-slate-900"
                  />

                </div>

                <div>

                  <label className="mb-2 block font-bold text-slate-900">
                    {text.estado}
                  </label>

                  <input
                    name="state"
                    type="text"
                    required
                    maxLength={2}
                    placeholder="NV"
                    className="w-full rounded-xl border border-slate-300 p-4 text-slate-900"
                  />

                </div>

                <div>

                  <label className="mb-2 block font-bold text-slate-900">
                    {text.zip}
                  </label>

                  <input
                    name="zip_code"
                    type="text"
                    required
                    placeholder="89101"
                    className="w-full rounded-xl border border-slate-300 p-4 text-slate-900"
                  />

                </div>

              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

                <div>

                  <label className="mb-2 block font-bold text-slate-900">
                    {text.fechaPreferida}
                  </label>

                  <input
                    name="preferred_date"
                    type="date"
                    min={(() => {
                      const hoy =
                        new Date();
                      return `${hoy.getFullYear()}-${String(
                        hoy.getMonth() + 1
                      ).padStart(2, "0")}-${String(
                        hoy.getDate()
                      ).padStart(2, "0")}`;
                    })()}
                    className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900"
                  />

                </div>

                <div>

                  <label className="mb-2 block font-bold text-slate-900">
                    {text.horaPreferida}
                  </label>

                  <input
                    name="preferred_time"
                    type="time"
                    className="w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900"
                  />

                </div>

              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">

                {profesional ? (
                  <p className="text-slate-800">
                    {text.solicitudPreferidaAntes}{" "}
                    <strong>
                      {profesional.business_name ||
                        text.esteProfesional}
                    </strong>{" "}
                    {text.solicitudPreferidaDespues}
                  </p>
                ) : (
                  <p className="text-slate-800">
                    {text.solicitudAbierta}
                  </p>
                )}

              </div>

              <button
                type="submit"
                disabled={
                  enviando ||
                  cargandoProfesional
                }
                className="w-full rounded-xl bg-blue-700 py-4 text-lg font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando
                  ? `${text.creandoSolicitud}${
                      fotosSeleccionadas.length > 0
                        ? ` ${text.ySubiendo} ${fotosSeleccionadas.length} ${
                            fotosSeleccionadas.length === 1
                              ? text.fotoSingular
                              : text.fotoPlural
                          }`
                        : ""
                    }...`
                  : text.enviarSolicitud}
              </button>

            </form>

          </div>

        </div>

      </div>

    </main>
  );
}

function SolicitarTrabajoFallback() {
  const { language } =
    useLanguage();

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center">
      <p className="font-bold text-slate-700">
        {language === "es"
          ? "Cargando..."
          : "Loading..."}
      </p>
    </main>
  );
}

export default function SolicitarTrabajo() {
  return (
    <Suspense
      fallback={
        <SolicitarTrabajoFallback />
      }
    >
      <SolicitarTrabajoContenido />
    </Suspense>
  );
}