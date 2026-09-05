"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useLanguage } from "@/app/components/LanguageProvider";
import NotificationsBell from "@/app/components/NotificationsBell";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Solicitud = {
  id: string;
  title: string;
  description: string;
  city: string;
  state: string;
  zip_code: string;
  preferred_date: string | null;
  preferred_time: string | null;
  preferred_provider_id: string | null;
  status: string;
  job_stage: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  completion_review_status: "pending" | "approved" | null;
  submitted_for_review_at: string | null;
  completion_approved_at: string | null;
};

type Oferta = {
  id: string;
  request_id: string;
  professional_id: string;
  price: number;
  arrival_minutes: number | null;
  estimated_job_minutes: number | null;
  message: string | null;
  status: string;
  created_at: string;
};

type Profesional = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
  years_experience: number | null;
  average_rating: number | null;
  completed_jobs: number | null;
  verified: boolean | null;
};

type OfertaConProfesional = Oferta & {
  profesional: Profesional | null;
};

type Review = {
  id: string;
  job_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type JobClaim = {
  id: string;
  request_id: string;
  customer_id: string;
  provider_id: string;
  reason: string;
  description: string | null;
  status: string;
  resolution_type: string | null;
  resolution_notes: string | null;
  provider_award_amount: number | null;
  customer_refund_amount: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentSettings = {
  id: string;
  provider_commission_percent: number;
  customer_service_fee_percent: number;
  customer_cancel_on_the_way_percent: number;
  customer_cancel_arrived_percent: number;
  cancellation_provider_percent: number;
  currency: string;
  active: boolean;
};

type PaymentCalculation = {
  id: string;
  request_id: string;
  offer_id: string | null;
  customer_id: string;
  provider_id: string;
  job_amount: number;
  customer_fee_percent: number;
  customer_fee_amount: number;
  customer_total_amount: number;
  provider_commission_percent: number;
  provider_commission_amount: number;
  provider_net_amount: number;
  platform_revenue_amount: number;
  refunded_amount: number | null;
  refunded_at: string | null;
  released_at: string | null;
  currency: string;
  status: string;
};

type ChangeOrder = {
  id: string;
  request_id: string;
  provider_id: string;
  customer_id: string;
  reason: string;
  description: string | null;
  original_amount: number;
  additional_amount: number;
  new_total_amount: number;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  accepted_at: string | null;
  rejected_at: string | null;
  payment_status: "unpaid" | "paid" | string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  additional_customer_fee_percent: number | null;
  additional_customer_fee_amount: number | null;
  additional_customer_total_amount: number | null;
  additional_provider_commission_percent: number | null;
  additional_provider_commission_amount: number | null;
  additional_provider_net_amount: number | null;
  additional_platform_revenue_amount: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type CompletionEvidence = {
  id: string;
  request_id: string;
  provider_id: string;
  file_type: "image" | "video";
  file_path: string;
  file_url: string | null;
  created_at: string;
  signed_url: string | null;
};

type RequestPhoto = {
  id: string;
  request_id: string;
  file_url: string;
  created_at: string;
  signed_url: string | null;
};

type PreferredProvider = {
  user_id: string;
  business_name: string | null;
  trade: string | null;
  verified: boolean | null;
};

type JobMessage = {
  id: string;
  request_id: string;
  sender_id: string;
  sender_role: "customer" | "provider" | "admin";
  message: string;
  read_at: string | null;
  created_at: string;
};

const DETAIL_TRANSLATIONS_EN: Record<string, string> = {
  "Cargando solicitud...": "Loading request...",
  "No se pudo abrir la solicitud": "Could not open the request",
  "Volver a mis solicitudes": "Back to my requests",
  "← Volver a mis solicitudes": "← Back to my requests",
  "📍 Ubicación": "📍 Location",
  "📅 Fecha preferida": "📅 Preferred date",
  "🕐 Hora preferida": "🕐 Preferred time",
  "📷 Fotos de la solicitud": "📷 Request photos",
  "Fotos que adjuntaste al crear esta solicitud.": "Photos you attached when creating this request.",
  "Foto de la solicitud": "Request photo",
  "⭐ Profesional preferido": "⭐ Preferred professional",
  "Esta solicitud fue creada con este profesional como preferido.": "This request was created with this professional as preferred.",
  "Profesional verificado": "Verified professional",
  "Buscando un nuevo profesional": "Looking for a new professional",
  "El profesional anterior ya no está disponible": "The previous professional is no longer available",
  "Tu solicitud volvió a publicarse automáticamente para que otros profesionales puedan enviarte nuevos presupuestos. No necesitas crear otra solicitud.": "Your request was automatically republished so other professionals can send you new offers. You do not need to create another request.",
  "Esperando nuevos presupuestos": "Waiting for new offers",
  "Cuando otro profesional compatible envíe una oferta, aparecerá automáticamente en esta página.": "When another compatible professional sends an offer, it will automatically appear on this page.",
  "Seguimiento en vivo": "Live tracking",
  "Resultado financiero": "Financial result",
  "Reembolso al cliente": "Customer refund",
  "Compensación al profesional": "Professional compensation",
  "Nota de resolución": "Resolution note",
  "¿Ya no necesitas el servicio?": "No longer need the service?",
  "Puedes cancelar esta solicitud": "You can cancel this request",
  "La cancelación dejará de estar disponible cuando el profesional haya iniciado el trabajo.": "Cancellation will no longer be available once the professional has started the job.",
  "Cancelar solicitud": "Cancel request",
  "¿Por qué deseas cancelar?": "Why do you want to cancel?",
  "Selecciona un motivo": "Select a reason",
  "Ya no necesito el servicio": "I no longer need the service",
  "Encontré otra solución": "I found another solution",
  "Cambió mi horario": "My schedule changed",
  "El precio no me conviene": "The price does not work for me",
  "Otro motivo": "Other reason",
  "Resumen de la cancelación": "Cancellation summary",
  "Cancelación sin penalidad": "Cancellation without penalty",
  "Esta solicitud todavía no tiene un trabajo pagado en progreso.": "This request does not yet have a paid job in progress.",
  "Total pagado": "Total paid",
  "No encontramos el pago de este trabajo. Actualiza la página antes de cancelar.": "We could not find the payment for this job. Refresh the page before cancelling.",
  "Volver": "Back",
  "Trabajo iniciado": "Job started",
  "La cancelación automática ya no está disponible": "Automatic cancellation is no longer available",
  "El profesional ya comenzó el servicio. Si existe un problema con el trabajo, deberá gestionarse mediante el sistema de reclamos de RELYDO.": "The professional has already started the service. If there is a problem with the job, it must be handled through RELYDO's claims system.",
  "⚠️ Iniciar reclamo": "⚠️ Start claim",
  "💰 Cambio de presupuesto solicitado": "💰 Budget change requested",
  "El profesional solicita un monto adicional": "The professional is requesting an additional amount",
  "Revisa el motivo y los nuevos montos antes de aceptar o rechazar.": "Review the reason and new amounts before accepting or rejecting.",
  "Total anterior": "Previous total",
  "Adicional solicitado": "Additional amount requested",
  "Nuevo total propuesto": "New proposed total",
  "Motivo": "Reason",
  "Explicación del profesional": "Professional's explanation",
  "✓ Cambio pagado": "✓ Change paid",
  "Tu aprobación quedó registrada. Para completar el cambio, paga ahora el monto adicional mediante Stripe.": "Your approval was recorded. To complete the change, pay the additional amount through Stripe now.",
  "El cambio fue rechazado. El presupuesto anterior permanece sin cambios.": "The change was rejected. The previous budget remains unchanged.",
  "✓ Profesional contratado": "✓ Professional hired",
  "Resumen de pago": "Payment summary",
  "Presupuesto del profesional": "Professional's price",
  "Total del cliente": "Customer total",
  "Describe qué ocurrió y qué parte del servicio tuvo el problema...": "Describe what happened and which part of the service had the problem...",
  "Estado del pago": "Payment status",
  "El pago fue procesado y liberado de acuerdo con el flujo de RELYDO.": "The payment was processed and released according to RELYDO's payment flow.",
  "RELYDO procesó el reembolso correspondiente a este trabajo.": "RELYDO processed the refund for this job.",
  "RELYDO procesó un reembolso parcial para este trabajo.": "RELYDO processed a partial refund for this job.",
  "Llegada estimada": "Estimated arrival",
  "Duración estimada": "Estimated duration",
  "Valoración": "Rating",
  "Ver perfil del profesional": "View professional profile",
  "🔁 Contratar de nuevo": "🔁 Hire again",
  "🔒 Comunicación protegida": "🔒 Protected communication",
  "Chat con": "Chat with",
  "● En tiempo real": "● Live",
  "Conectando...": "Connecting...",
  "Los números de teléfono personales permanecen privados.": "Personal phone numbers remain private.",
  "Cargando conversación...": "Loading conversation...",
  "Todavía no hay mensajes": "There are no messages yet",
  "Usa este chat para coordinar el servicio sin compartir tu número personal.": "Use this chat to coordinate the service without sharing your personal phone number.",
  "⏳ El chat permanecerá abierto hasta 12 horas después de que se completó el trabajo.": "⏳ The chat will remain open for up to 12 hours after the job is completed.",
  "🔒 RELYDO mantiene privados los teléfonos del cliente y del profesional. No compartas datos personales o formas de pago externas en el chat.": "🔒 RELYDO keeps customer and professional phone numbers private. Do not share personal information or external payment methods in the chat.",
  "🔒 Chat bloqueado": "🔒 Chat locked",
  "📸 Evidencia del trabajo terminado": "📸 Completed job evidence",
  "Fotos y videos registrados por el profesional": "Photos and videos recorded by the professional",
  "Esta evidencia fue registrada por el profesional al finalizar el servicio y queda asociada a este trabajo para tu protección y la del profesional.": "This evidence was recorded by the professional when the service was completed and remains attached to this job for your protection and the professional's.",
  "No pudimos abrir este archivo de evidencia.": "We could not open this evidence file.",
  "Registrado": "Recorded",
  "🔒 Esta evidencia forma parte del registro del trabajo y no puede ser modificada desde esta pantalla.": "🔒 This evidence is part of the job record and cannot be modified from this screen.",
  "Gracias por tu calificación": "Thank you for your rating",
  "Ya calificaste este trabajo.": "You already rated this job.",
  "Tu calificación": "Your rating",
  "Tu comentario": "Your comment",
  "Trabajo completado": "Job completed",
  "Calificar profesional": "Rate professional",
  "¿Cómo fue tu experiencia con": "How was your experience with",
  "Selecciona de 1 a 5 estrellas.": "Select from 1 to 5 stars.",
  "Tu calificación *": "Your rating *",
  "Comentario": "Comment",
  "⚠️ Problema reportado": "⚠️ Problem reported",
  "Tu reclamo quedó registrado": "Your claim was recorded",
  "RELYDO conserva este reporte asociado al trabajo.": "RELYDO keeps this report associated with the job.",
  "Descripción": "Description",
  "✅ Reclamo resuelto": "✅ Claim resolved",
  "Resolución de RELYDO": "RELYDO resolution",
  "Este trabajo está cerrado.": "This job is closed.",
  "No se pueden abrir nuevos reclamos después de que el trabajo ha sido cancelado.": "New claims cannot be opened after the job has been cancelled.",
  "¿Hubo un problema con el servicio?": "Was there a problem with the service?",
  "Reportar un problema": "Report a problem",
  "Usa esta opción si el trabajo quedó incompleto, hubo daños, un cobro adicional u otro problema importante.": "Use this option if the job was incomplete, there was damage, an additional charge, or another significant problem.",
  "⚠️ Reportar problema": "⚠️ Report problem",
  "Abrir reclamo": "Open claim",
  "Cuéntanos qué ocurrió": "Tell us what happened",
  "Motivo del reclamo *": "Claim reason *",
  "Trabajo incompleto": "Incomplete job",
  "Calidad del trabajo": "Quality of work",
  "Daños durante el servicio": "Damage during service",
  "Cobro adicional no acordado": "Unapproved additional charge",
  "Conducta del profesional": "Professional conduct",
  "Otro problema": "Other problem",
  "Explica el problema *": "Explain the problem *",
  "Fotos o videos": "Photos or videos",
  "Opcional. Puedes adjuntar hasta 10 fotos y 2 videos como evidencia.": "Optional. You can attach up to 10 photos and 2 videos as evidence.",
  "📎 Adjuntar archivos": "📎 Attach files",
  "Formatos permitidos": "Allowed formats",
  "Fotos: JPG, PNG, WEBP · Videos: MP4, WEBM, MOV · Máximo 50 MB por archivo.": "Photos: JPG, PNG, WEBP · Videos: MP4, WEBM, MOV · Maximum 50 MB per file.",
  "Quitar": "Remove",
  "Explicación de la evidencia *": "Evidence explanation *",
  "Describe qué muestran las fotos o videos y qué debe considerar RELYDO al revisar tu reclamo.": "Describe what the photos or videos show and what RELYDO should consider when reviewing your claim.",
  "Cancelar": "Cancel",
  "Presupuestos recibidos": "Offers received",
  "Compara precio, tiempo de llegada, experiencia y valoración antes de elegir.": "Compare price, arrival time, experience, and rating before choosing.",
  "Todavía no tienes presupuestos": "You do not have any offers yet",
  "Cuando un profesional envíe un presupuesto aparecerá aquí.": "When a professional sends an offer, it will appear here.",
  "Profesional": "Professional",
  "✓ Contratado": "✓ Hired",
  "No seleccionada": "Not selected",
  "✓ Verificado": "✓ Verified",
  "Presupuesto": "Price",
  "🚗 Puede llegar": "🚗 Can arrive",
  "⏱️ Duración": "⏱️ Duration",
  "⭐ Valoración": "⭐ Rating",
  "🛠️ Experiencia": "🛠️ Experience",
  "Trabajos completados en RELYDO": "Jobs completed on RELYDO",
  "Mensaje del profesional": "Professional's message",
  "Sin mensaje adicional.": "No additional message.",
  "Contratando profesional...": "Hiring professional...",
  "Tú": "You",
  "Escribe un mensaje...": "Write a message...",
  "Enviar": "Send",
  "🎥 Video": "🎥 Video",
  "📷 Foto": "📷 Photo",
  "Cuéntanos cómo fue el servicio...": "Tell us how the service went...",
  "Enviando calificación...": "Sending rating...",
  "Enviar reseña": "Submit review",
  "En revisión": "Under review",
  "Enviando reclamo...": "Sending claim...",
  "Enviar reclamo": "Submit claim",
  "Abierta": "Open",
  "Trabajo en progreso": "Job in progress",
  "Completada": "Completed",
  "Cancelada": "Cancelled",
  "No indicado": "Not specified",
  "Pago retenido por RELYDO": "Payment held by RELYDO",
  "Pago completado": "Payment completed",
  "Reembolsado": "Refunded",
  "Reembolso parcial": "Partial refund",
  "Pago confirmado": "Payment confirmed",
  "Pago cancelado": "Payment cancelled",
  "El profesional inició el trabajo": "The professional started the job",
  "El profesional ya llegó": "The professional has arrived",
  "El profesional va en camino": "The professional is on the way",
  "Profesional contratado": "Professional hired",
  "El profesional marcó el servicio como terminado.": "The professional marked the service as completed.",
  "El profesional ya comenzó a realizar el servicio.": "The professional has started performing the service.",
  "El profesional indicó que ya se encuentra en el lugar.": "The professional indicated that they are at the location.",
  "El profesional indicó que va rumbo a la dirección del servicio.": "The professional indicated that they are on the way to the service address.",
  "Has contratado a un profesional para realizar este trabajo.": "You hired a professional to perform this job.",
  "Plomería": "Plumbing",
  "Electricidad": "Electrical",
  "HVAC / Aire acondicionado": "HVAC / Air conditioning",
  "Carpintería": "Carpentry",
  "Pintura": "Painting",
  "Jardinería": "Landscaping",
  "Limpieza": "Cleaning",
  "Mudanzas": "Moving",
  "Otros servicios": "Other services",
  "Profesional RELYDO": "RELYDO Professional",
  "Va rumbo a tu ubicación": "On the way to your location",
  "Llegó": "Arrived",
  "Ya se encuentra en el lugar": "Already at the location",
  "El servicio está en proceso": "The service is in progress",
  "Completado": "Completed",
  "Trabajo terminado": "Job finished",
  "Actualizando en vivo": "Updating live",
  "Solicitud cancelada": "Request cancelled",
  "Este trabajo fue cancelado": "This job was cancelled",
  "Decisión": "Decision",
  "Cambio de presupuesto": "Budget change",
  "El problema es mayor de lo esperado": "The problem is bigger than expected",
  "Se necesita trabajo adicional": "Additional work is needed",
  "Se necesitan materiales adicionales": "Additional materials are needed",
  "Procesando...": "Processing...",
  "✕ Rechazar cambio": "✕ Reject change",
  "✓ Cambio de presupuesto aceptado": "✓ Budget change accepted",
  "✕ Cambio de presupuesto rechazado": "✕ Budget change rejected",
  "Cambio de presupuesto cancelado": "Budget change cancelled",
  "¿Confirmas que aceptas el cambio de presupuesto?": "Do you confirm that you accept the budget change?",
  "Adicional": "Additional",
  "Nuevo total": "New total",
  "Al aceptar, continuarás al pago seguro de Stripe para pagar el monto adicional y la tarifa de servicio de RELYDO.": "By accepting, you will continue to Stripe secure checkout to pay the additional amount and RELYDO service fee.",
  "¿Confirmas que deseas rechazar este cambio de presupuesto?": "Do you confirm that you want to reject this budget change?",
  "Cambio de presupuesto aceptado. Ahora te enviaremos al pago seguro de Stripe para cobrar solamente el monto adicional y la tarifa de servicio correspondiente.": "Budget change accepted. We will now send you to Stripe secure checkout to charge only the additional amount and the corresponding service fee.",
  "¿Confirmas la cancelación?": "Do you confirm the cancellation?",
  "Penalidad": "Cancellation fee",
  "Esta acción no se puede deshacer.": "This action cannot be undone.",
  "Solicitud cancelada correctamente. Se procesó un reembolso de": "Request cancelled successfully. A refund was processed for",
  "Abriendo pago seguro...": "Opening secure payment...",
  "Evidencia del trabajo terminado": "Completed job evidence",
  "El pago adicional fue cancelado. Tu aprobación sigue registrada y puedes intentar pagarlo nuevamente.": "The additional payment was cancelled. Your approval is still recorded and you can try paying again.",
  "Confirmando tu pago adicional con Stripe...": "Confirming your additional payment with Stripe...",
  "No pudimos confirmar el pago adicional.": "We could not confirm the additional payment.",
  "No encontramos esta solicitud o no tienes permiso para verla.": "We could not find this request or you do not have permission to view it.",
  "No pudimos cargar las tarifas de RELYDO": "We could not load RELYDO's fees",
  "No pudimos cargar los presupuestos": "We could not load the offers",
  "Ocurrió un error inesperado.": "An unexpected error occurred.",
  "Esta solicitud ya tiene un profesional contratado.": "This request already has a hired professional.",
  "Este presupuesto ya no está disponible.": "This offer is no longer available.",
  "No pudimos cargar la configuración de pagos de RELYDO. Actualiza la página e inténtalo nuevamente.": "We could not load RELYDO's payment settings. Refresh the page and try again.",
  "Debes aceptar el cambio de presupuesto antes de pagarlo.": "You must accept the budget change before paying it.",
  "No pudimos verificar tu sesión de cliente.": "We could not verify your customer session.",
  "No pudimos iniciar el pago adicional.": "We could not start the additional payment.",
  "Stripe no devolvió la dirección del checkout adicional.": "Stripe did not return the additional checkout URL.",
  "Este cambio de presupuesto ya fue respondido.": "This budget change has already been answered.",
  "Este cambio de presupuesto ya fue respondido o cambió de estado.": "This budget change has already been answered or its status changed.",
  "Cambio de presupuesto rechazado. El precio anterior permanece sin cambios.": "Budget change rejected. The previous price remains unchanged.",
  "No se pudo registrar tu decisión.": "We could not save your decision.",
  "El trabajo ya fue iniciado. No puede cancelarse automáticamente; cualquier problema debe gestionarse mediante el sistema de reclamos.": "The job has already started. It cannot be cancelled automatically; any issue must be handled through the claims system.",
  "Esta solicitud ya no puede cancelarse automáticamente.": "This request can no longer be cancelled automatically.",
  "Selecciona un motivo para cancelar la solicitud.": "Select a reason for cancelling the request.",
  "¿Confirmas que deseas cancelar esta solicitud? Esta acción no se puede deshacer.": "Are you sure you want to cancel this request? This action cannot be undone.",
  "No se pudo cancelar la solicitud.": "We could not cancel the request.",
  "La solicitud fue cancelada correctamente.": "The request was cancelled successfully.",
  "Este trabajo todavía no puede ser calificado.": "This job cannot be rated yet.",
  "No pudimos identificar al profesional contratado.": "We could not identify the hired professional.",
  "Debes iniciar sesión para enviar una reseña.": "You must sign in to submit a review.",
  "Ya enviaste una reseña para este trabajo.": "You already submitted a review for this job.",
  "Gracias. Tu calificación fue enviada correctamente.": "Thank you. Your rating was submitted successfully.",
  "No se pudo enviar la reseña.": "We could not submit the review.",
  "Puedes adjuntar un máximo de 10 fotos por reclamo.": "You can attach up to 10 photos per claim.",
  "Puedes adjuntar un máximo de 2 videos por reclamo.": "You can attach up to 2 videos per claim.",
  "Este trabajo todavía no puede reportarse.": "This job cannot be reported yet.",
  "Ya reportaste un problema para este trabajo.": "You already reported a problem for this job.",
  "Selecciona el motivo del reclamo.": "Select the reason for the claim.",
  "Explica brevemente qué ocurrió con el trabajo.": "Briefly explain what happened with the job.",
  "Debes iniciar sesión para reportar un problema.": "You must sign in to report a problem.",
  "Ya existe un reclamo para este trabajo.": "A claim already exists for this job.",
  "Tu reporte fue registrado correctamente.": "Your report was submitted successfully.",
  "No se pudo enviar el reclamo.": "We could not submit the claim.",
  "Chat bloqueado porque existe un reclamo activo. A partir de este momento RELYDO Admin gestiona el caso.": "Chat is locked because there is an active claim. From this point on, RELYDO Admin manages the case.",
  "El trabajo está completado y el chat ya está cerrado.": "The job is completed and the chat is now closed.",
  "El período de 12 horas después de completar el trabajo terminó. El historial permanece disponible.": "The 12-hour period after job completion has ended. The chat history remains available.",
  "Este trabajo fue cancelado. El chat está cerrado.": "This job was cancelled. The chat is closed.",
  "El chat estará disponible cuando el trabajo esté contratado.": "Chat will be available once a professional is hired.",
  "No se pudo enviar el mensaje.": "We could not send the message.",
  "Trabajo cancelado por resolución de RELYDO": "Job cancelled by RELYDO resolution",
  "RELYDO cerró este trabajo después de resolver el reclamo. El servicio ya no continuará.": "RELYDO closed this job after resolving the claim. The service will not continue.",
  "Esta solicitud ya no está activa.": "This request is no longer active.",
  "Cancelando solicitud...": "Cancelling request...",
  "Confirmar cancelación": "Confirm cancellation",
  "Este resumen incluye": "This summary includes",
  "cambio": "change",
  "cambios": "changes",
  "de presupuesto pagado": "paid budget change",
  "de presupuesto pagados": "paid budget changes",
  "por un total adicional de": "for an additional total of",
  "el profesional": "the professional",
  "este profesional": "this professional",
  "Ejemplo: Estas fotos muestran la parte del trabajo que quedó incompleta y el daño que encontré después del servicio...": "Example: These photos show the part of the job that was left incomplete and the damage I found after the service...",
  "presupuesto disponible": "offer available",
  "presupuestos disponibles": "offers available",
  "Contratado": "Hired",
  "En camino": "On the way",
  "Has seleccionado este presupuesto por": "You selected this offer for",
  "Tarifa de servicio RELYDO": "RELYDO service fee",
  "Revisar y continuar": "Review and continue",
  "Contratar por": "Hire for",
  "Detalles de la solicitud": "Request details",
  "Pagado": "Paid",
  "Trabajo listo para revisión": "Job ready for review",
  "El profesional terminó el servicio y envió la evidencia final. Revísala antes de aprobar el trabajo.": "The professional finished the service and submitted the final evidence. Review it before approving the job.",
  "✓ Aprobar trabajo": "✓ Approve job",
  "Aprobando trabajo...": "Approving job...",
  "Revisa la evidencia final que aparece debajo. Si todo está correcto, aprueba el trabajo. Si existe un problema, utiliza el sistema de reclamos.": "Review the final evidence below. If everything is correct, approve the job. If there is a problem, use the claims system.",
  "¿Confirmas que el trabajo fue realizado correctamente y deseas aprobarlo como completado?": "Do you confirm the job was completed correctly and want to approve it as completed?",
  "Trabajo aprobado correctamente.": "Job approved successfully.",
  "No se pudo aprobar el trabajo.": "The job could not be approved.",
  "Este trabajo no está pendiente de tu aprobación.": "This job is not waiting for your approval.",
  "No puedes aprobar el trabajo mientras exista un reclamo activo.": "You cannot approve the job while there is an active claim.",
  "Pendiente de tu aprobación": "Waiting for your approval",
};

function detailText(language: "es" | "en", spanish: string) {
  return language === "en"
    ? DETAIL_TRANSLATIONS_EN[spanish] || spanish
    : spanish;
}

function nombreOficio(
  trade: string | null
) {
  const oficios: Record<
    string,
    string
  > = {
    plumbing: "Plomería",
    electrical: "Electricidad",
    hvac: "HVAC / Aire acondicionado",
    carpentry: "Carpintería",
    painting: "Pintura",
    landscaping: "Jardinería",
    cleaning: "Limpieza",
    moving: "Mudanzas",
    other: "Otros servicios",
  };

  if (!trade) {
    return "Profesional";
  }

  return oficios[trade] || trade;
}

function nombreEstadoSolicitud(
  status: string
) {
  if (status === "open") {
    return "Abierta";
  }

  if (status === "in_progress") {
    return "Trabajo en progreso";
  }

  if (status === "completed") {
    return "Completada";
  }

  if (status === "cancelled") {
    return "Cancelada";
  }

  return status;
}

function mostrarMinutos(
  minutos: number | null,
  language: "es" | "en" = "es"
) {
  if (
    minutos === null ||
    minutos === undefined
  ) {
    return language === "en" ? "Not specified" : "No indicado";
  }

  if (minutos < 60) {
    return `${minutos} min`;
  }

  const horas =
    Math.floor(
      minutos / 60
    );

  const restantes =
    minutos % 60;

  if (restantes === 0) {
    return `${horas} ${
      horas === 1
        ? language === "en" ? "hour" : "hora"
        : language === "en" ? "hours" : "horas"
    }`;
  }

  return `${horas} h ${restantes} min`;
}

function numeroEtapa(
  status: string,
  jobStage: string | null,
  completionReviewStatus: "pending" | "approved" | null
) {
  if (status === "completed") {
    return 6;
  }

  if (completionReviewStatus === "pending") {
    return 5;
  }

  if (jobStage === "working") {
    return 4;
  }

  if (jobStage === "arrived") {
    return 3;
  }

  if (jobStage === "on_the_way") {
    return 2;
  }

  return 1;
}

function tituloEtapa(
  status: string,
  jobStage: string | null,
  completionReviewStatus: "pending" | "approved" | null
) {
  if (status === "completed") {
    return "Trabajo completado";
  }

  if (completionReviewStatus === "pending") {
    return "Trabajo listo para revisión";
  }

  if (jobStage === "working") {
    return "El profesional inició el trabajo";
  }

  if (jobStage === "arrived") {
    return "El profesional ya llegó";
  }

  if (jobStage === "on_the_way") {
    return "El profesional va en camino";
  }

  return "Profesional contratado";
}

function textoEtapa(
  status: string,
  jobStage: string | null,
  completionReviewStatus: "pending" | "approved" | null
) {
  if (status === "completed") {
    return "El profesional marcó el servicio como terminado.";
  }

  if (completionReviewStatus === "pending") {
    return "El profesional terminó el servicio y envió la evidencia final. Revísala antes de aprobar el trabajo.";
  }

  if (jobStage === "working") {
    return "El profesional ya comenzó a realizar el servicio.";
  }

  if (jobStage === "arrived") {
    return "El profesional indicó que ya se encuentra en el lugar.";
  }

  if (jobStage === "on_the_way") {
    return "El profesional indicó que va rumbo a la dirección del servicio.";
  }

  return "Has contratado a un profesional para realizar este trabajo.";
}


function redondearDinero(
  valor: number
) {
  return Math.round(
    (valor + Number.EPSILON) * 100
  ) / 100;
}

function calcularMontosPago(
  precio: number,
  settings: PaymentSettings | null
) {
  const jobAmount = redondearDinero(Number(precio) || 0);
  const customerFeePercent = Number(settings?.customer_service_fee_percent || 0);
  const providerCommissionPercent = Number(settings?.provider_commission_percent || 0);
  const customerFeeAmount = redondearDinero(jobAmount * (customerFeePercent / 100));
  const customerTotalAmount = redondearDinero(jobAmount + customerFeeAmount);
  const providerCommissionAmount = redondearDinero(jobAmount * (providerCommissionPercent / 100));
  const providerNetAmount = redondearDinero(jobAmount - providerCommissionAmount);
  const platformRevenueAmount = redondearDinero(customerFeeAmount + providerCommissionAmount);

  return {
    jobAmount, customerFeePercent, customerFeeAmount, customerTotalAmount,
    providerCommissionPercent, providerCommissionAmount, providerNetAmount, platformRevenueAmount,
  };
}

function nombreEstadoPagoCliente(
  status: string
) {
  if (status === "ready_for_payout") {
    return "Pago retenido por RELYDO";
  }

  if (status === "paid_out") {
    return "Pago completado";
  }

  if (status === "refunded") {
    return "Reembolsado";
  }

  if (status === "partially_refunded") {
    return "Reembolso parcial";
  }

  if (status === "paid") {
    return "Pago confirmado";
  }

  if (status === "cancelled") {
    return "Pago cancelado";
  }

  return status;
}

function calcularCancelacionCliente(
  solicitud: Solicitud,
  payment: PaymentCalculation | null,
  settings: PaymentSettings | null
) {
  const totalPagado = redondearDinero(
    Number(payment?.customer_total_amount || 0)
  );

  const precioTrabajo = redondearDinero(
    Number(payment?.job_amount || 0)
  );

  const serviceFee = redondearDinero(
    Number(
      payment?.customer_fee_amount ??
        Math.max(0, totalPagado - precioTrabajo)
    )
  );

  // Debe coincidir exactamente con /api/customer/cancel-job.
  let penalidadPercent = 0;
  let porcentajeProTrabajo = 0;
  let porcentajeRelydoEtapa = 0;

  if (
    solicitud.status === "in_progress" &&
    !solicitud.job_stage
  ) {
    penalidadPercent = 5;
    porcentajeProTrabajo = 0;
    porcentajeRelydoEtapa = 5;
  }

  if (
    solicitud.status === "in_progress" &&
    solicitud.job_stage === "on_the_way"
  ) {
    penalidadPercent = 12.5;
    porcentajeProTrabajo = 5.5;
    porcentajeRelydoEtapa = 7;
  }

  if (
    solicitud.status === "in_progress" &&
    solicitud.job_stage === "arrived"
  ) {
    penalidadPercent = 23.5;
    porcentajeProTrabajo = 12;
    porcentajeRelydoEtapa = 11.5;
  }

  const penalidad = redondearDinero(
    precioTrabajo * (penalidadPercent / 100)
  );

  const profesional = redondearDinero(
    precioTrabajo * (porcentajeProTrabajo / 100)
  );

  const relydoEtapa = redondearDinero(
    precioTrabajo * (porcentajeRelydoEtapa / 100)
  );

  const relydo = redondearDinero(
    serviceFee + relydoEtapa
  );

  // El service fee original no se reembolsa. El reembolso sale
  // únicamente del precio del trabajo, igual que en el servidor.
  const reembolso = redondearDinero(
    Math.max(0, precioTrabajo - penalidad)
  );

  return {
    totalPagado,
    precioTrabajo,
    serviceFee,
    penalidadPercent,
    penalidad,
    profesional,
    relydo,
    reembolso,
  };
}


function formatearHoraChat(
  fecha: string,
  language: "es" | "en" = "es"
) {
  return new Intl.DateTimeFormat(
    language === "en" ? "en-US" : "es-US",
    {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    }
  ).format(
    new Date(fecha)
  );
}

export default function MisSolicitudDetallePage() {
  const { language } = useLanguage();
  const T = (spanish: string) => detailText(language, spanish);

  const params =
    useParams<{
      id: string;
    }>();

  const router =
    useRouter();

  const id =
    params.id;

  const [
    solicitud,
    setSolicitud,
  ] =
    useState<Solicitud | null>(
      null
    );

  const [
    ofertas,
    setOfertas,
  ] =
    useState<OfertaConProfesional[]>(
      []
    );

  const [
    review,
    setReview,
  ] =
    useState<Review | null>(
      null
    );

  const [
    rating,
    setRating,
  ] =
    useState(0);

  const [
    comentario,
    setComentario,
  ] =
    useState("");

  const [
    cargando,
    setCargando,
  ] =
    useState(true);

  const [
    enviandoReview,
    setEnviandoReview,
  ] =
    useState(false);

  const [
    aprobandoFinalizacion,
    setAprobandoFinalizacion,
  ] = useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    mensaje,
    setMensaje,
  ] =
    useState("");

  const [
    aceptandoId,
    setAceptandoId,
  ] =
    useState<string | null>(
      null
    );

  const [
    cancelando,
    setCancelando,
  ] =
    useState(false);

  const [
    mostrarCancelacion,
    setMostrarCancelacion,
  ] =
    useState(false);

  const [
    motivoCancelacion,
    setMotivoCancelacion,
  ] =
    useState("");

  const [
    realtimeConectado,
    setRealtimeConectado,
  ] =
    useState(false);
  const [
    paymentSettings,
    setPaymentSettings,
  ] = useState<PaymentSettings | null>(null);

  const [
    payment,
    setPayment,
  ] = useState<PaymentCalculation | null>(null);

  const [
    changeOrders,
    setChangeOrders,
  ] = useState<ChangeOrder[]>([]);

  const [
    respondiendoChangeOrderId,
    setRespondiendoChangeOrderId,
  ] = useState<string | null>(null);

  const [
    pagandoChangeOrderId,
    setPagandoChangeOrderId,
  ] = useState<string | null>(null);

  const [
    verificandoPagoChangeOrder,
    setVerificandoPagoChangeOrder,
  ] = useState(false);

  const [
    claim,
    setClaim,
  ] = useState<JobClaim | null>(null);

  const [
    mostrarReclamo,
    setMostrarReclamo,
  ] = useState(false);

  const [
    motivoReclamo,
    setMotivoReclamo,
  ] = useState("");

  const [
    descripcionReclamo,
    setDescripcionReclamo,
  ] = useState("");

  const [
    enviandoReclamo,
    setEnviandoReclamo,
  ] = useState(false);

  const [
    evidenciasReclamo,
    setEvidenciasReclamo,
  ] = useState<File[]>([]);

  const [
    explicacionEvidenciaCliente,
    setExplicacionEvidenciaCliente,
  ] = useState("");

  const [
    evidenciasFinales,
    setEvidenciasFinales,
  ] = useState<CompletionEvidence[]>([]);

  const [
    fotosSolicitud,
    setFotosSolicitud,
  ] = useState<RequestPhoto[]>([]);

  const [
    visorFotoIndex,
    setVisorFotoIndex,
  ] = useState<number | null>(null);

  const [
    profesionalPreferido,
    setProfesionalPreferido,
  ] = useState<PreferredProvider | null>(null);

  const [
    usuarioChatId,
    setUsuarioChatId,
  ] = useState<string | null>(null);

  const [
    mensajesChat,
    setMensajesChat,
  ] = useState<JobMessage[]>([]);

  const [
    mensajeChat,
    setMensajeChat,
  ] = useState("");

  const [
    cargandoChat,
    setCargandoChat,
  ] = useState(true);

  const [
    enviandoMensajeChat,
    setEnviandoMensajeChat,
  ] = useState(false);

  const [
    chatRealtimeConectado,
    setChatRealtimeConectado,
  ] = useState(false);

  const finalChatRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const recargaDetalleTimerRef =
    useRef<number | null>(null);

  const [
    ahoraChat,
    setAhoraChat,
  ] = useState(
    Date.now()
  );

  function programarRecargaDetalle(
    delay = 300
  ) {
    if (recargaDetalleTimerRef.current !== null) {
      window.clearTimeout(
        recargaDetalleTimerRef.current
      );
    }

    recargaDetalleTimerRef.current =
      window.setTimeout(
        () => {
          recargaDetalleTimerRef.current = null;
          cargarDetalle(false);
        },
        delay
      );
  }

  /*
    CARGA INICIAL
  */

  useEffect(() => {
    if (id) {
      cargarDetalle();
    }

    return () => {
      if (recargaDetalleTimerRef.current !== null) {
        window.clearTimeout(
          recargaDetalleTimerRef.current
        );
        recargaDetalleTimerRef.current = null;
      }
    };
  }, [id]);

  /*
    CHAT PRIVADO RELYDO
  */

  useEffect(() => {
    if (!id || !usuarioChatId) {
      return;
    }

    let activo = true;

    async function iniciarChat() {
      setCargandoChat(true);

      try {
        const {
          data,
          error: mensajesError,
        } = await supabase
          .from("job_messages")
          .select(`
            id,
            request_id,
            sender_id,
            sender_role,
            message,
            read_at,
            created_at
          `)
          .eq("request_id", id)
          .order("created_at", {
            ascending: true,
          });

        if (mensajesError) {
          console.error(
            "Error cargando chat:",
            mensajesError
          );
        } else if (activo) {
          setMensajesChat(
            (data || []) as JobMessage[]
          );
        }
      } finally {
        if (activo) {
          setCargandoChat(false);
        }
      }
    }

    iniciarChat();

    const canalChat =
      supabase
        .channel(
          `chat-cliente-${id}`
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "job_messages",
            filter:
              `request_id=eq.${id}`,
          },
          (payload) => {
            const nuevo =
              payload.new as JobMessage;

            setMensajesChat(
              (actuales) =>
                actuales.some(
                  (item) =>
                    item.id === nuevo.id
                )
                  ? actuales
                  : [
                      ...actuales,
                      nuevo,
                    ]
            );
          }
        )
        .subscribe(
          (status) => {
            setChatRealtimeConectado(
              status === "SUBSCRIBED"
            );
          }
        );

    return () => {
      activo = false;

      supabase.removeChannel(
        canalChat
      );
    };
  }, [id, usuarioChatId]);

  useEffect(() => {
    finalChatRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [mensajesChat.length]);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setAhoraChat(
            Date.now()
          );
        },
        60 * 1000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, []);

  /*
    REALTIME DE LA SOLICITUD
  */

  useEffect(() => {
    if (!id) {
      return;
    }

    const canal =
      supabase
        .channel(
          `seguimiento-trabajo-${id}`
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table:
              "service_requests",
            filter:
              `id=eq.${id}`,
          },
          (payload) => {
            const nuevo =
              payload.new as Partial<Solicitud>;

            setSolicitud(
              (actual) => {
                if (!actual) {
                  return actual;
                }

                return {
                  ...actual,

                  status:
                    nuevo.status !==
                    undefined
                      ? nuevo.status
                      : actual.status,

                  job_stage:
                    nuevo.job_stage !==
                    undefined
                      ? nuevo.job_stage
                      : actual.job_stage,

                  cancellation_reason:
                    nuevo.cancellation_reason !==
                    undefined
                      ? nuevo.cancellation_reason
                      : actual.cancellation_reason,

                  cancelled_at:
                    nuevo.cancelled_at !==
                    undefined
                      ? nuevo.cancelled_at
                      : actual.cancelled_at,

                  completed_at:
                    nuevo.completed_at !==
                    undefined
                      ? nuevo.completed_at
                      : actual.completed_at,

                  completion_review_status:
                    nuevo.completion_review_status !==
                    undefined
                      ? nuevo.completion_review_status
                      : actual.completion_review_status,

                  submitted_for_review_at:
                    nuevo.submitted_for_review_at !==
                    undefined
                      ? nuevo.submitted_for_review_at
                      : actual.submitted_for_review_at,

                  completion_approved_at:
                    nuevo.completion_approved_at !==
                    undefined
                      ? nuevo.completion_approved_at
                      : actual.completion_approved_at,
                };
              }
            );

            if (
              nuevo.status ===
                "open" ||
              nuevo.status ===
                "completed" ||
              nuevo.status ===
                "cancelled" ||
              nuevo.completion_review_status ===
                "pending" ||
              nuevo.completion_review_status ===
                "approved"
            ) {
              programarRecargaDetalle(400);
            }
          }
        )
        .subscribe(
          (status) => {
            if (
              status ===
              "SUBSCRIBED"
            ) {
              setRealtimeConectado(
                true
              );
            } else if (
              status ===
                "CHANNEL_ERROR" ||
              status ===
                "TIMED_OUT" ||
              status ===
                "CLOSED"
            ) {
              setRealtimeConectado(
                false
              );
            }
          }
        );

    return () => {
      supabase.removeChannel(
        canal
      );
    };
  }, [id]);

  /*
    REALTIME DE OFERTAS
  */

  useEffect(() => {
    if (!id) {
      return;
    }

    const canalOfertas =
      supabase
        .channel(
          `presupuestos-cliente-${id}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "offers",
            filter:
              `request_id=eq.${id}`,
          },
          () => {
            programarRecargaDetalle(300);
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        canalOfertas
      );
    };
  }, [id]);

  /*
    REALTIME DE CAMBIOS DE PRESUPUESTO
  */

  useEffect(() => {
    if (!id) {
      return;
    }

    const canalChangeOrders =
      supabase
        .channel(
          `change-orders-cliente-${id}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "change_orders",
            filter:
              `request_id=eq.${id}`,
          },
          () => {
            programarRecargaDetalle(250);
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        canalChangeOrders
      );
    };
  }, [id]);

  /*
    VERIFICAR REGRESO DE STRIPE PARA CHANGE ORDER
  */

  useEffect(() => {
    if (!id) {
      return;
    }

    const params =
      new URLSearchParams(
        window.location.search
      );

    const paymentResult =
      params.get(
        "change_order_payment"
      );

    const sessionId =
      params.get(
        "session_id"
      );

    const changeOrderId =
      params.get(
        "change_order_id"
      );

    if (
      paymentResult ===
        "cancelled"
    ) {
      setMensaje(
        T("El pago adicional fue cancelado. Tu aprobación sigue registrada y puedes intentar pagarlo nuevamente.")
      );

      window.history.replaceState(
        {},
        "",
        `/mis-solicitudes/${id}`
      );

      return;
    }

    if (
      paymentResult !==
        "success" ||
      !sessionId
    ) {
      return;
    }

    let activo = true;

    async function verificar() {
      setVerificandoPagoChangeOrder(
        true
      );
      setError("");
      setMensaje(
        T("Confirmando tu pago adicional con Stripe...")
      );

      try {
        const { data: sessionData } =
          await supabase.auth.getSession();

        if (!sessionData.session?.access_token) {
          throw new Error(T("Tu sesión expiró. Inicia sesión nuevamente."));
        }

        const response =
          await fetch(
            "/api/change-orders/verify-payment",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
                Authorization:
                  `Bearer ${sessionData.session.access_token}`,
              },
              body: JSON.stringify({
                sessionId,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              T("No pudimos confirmar el pago adicional.")
          );
        }

        if (!activo) {
          return;
        }

        await cargarDetalle(
          false
        );

        setMensaje(
          language === "en"
            ? `Additional payment confirmed${
                changeOrderId
                  ? ""
                  : ""
              }. The payment summary now includes the budget change.`
            : `Pago adicional confirmado${
                changeOrderId
                  ? ""
                  : ""
              }. El resumen de pago ya incluye el cambio de presupuesto.`
        );

        window.history.replaceState(
          {},
          "",
          `/mis-solicitudes/${id}`
        );
      } catch (err) {
        console.error(
          "Error verificando pago adicional:",
          err
        );

        if (!activo) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : T("No pudimos confirmar el pago adicional.")
        );
      } finally {
        if (activo) {
          setVerificandoPagoChangeOrder(
            false
          );
        }
      }
    }

    verificar();

    return () => {
      activo = false;
    };
  }, [id]);

  /*
    CARGAR DETALLE
  */


  async function notificarEventoTrabajo(
    event: string,
    extra: Record<string, unknown> = {}
  ) {
    try {
      const {
        data: {
          session,
        },
      } =
        await supabase.auth.getSession();

      const accessToken =
        session?.access_token;

      if (!accessToken) {
        console.warn(
          "RELYDO: no encontramos access token para notificar el evento.",
          event
        );
        return;
      }

      const response =
        await fetch(
          "/api/notifications/job-event",
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
                event,
                requestId: id,
                ...extra,
              }),
          }
        );

      const result =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        console.warn(
          "RELYDO: el evento ocurrió, pero la notificación no pudo enviarse:",
          event,
          result
        );
        return;
      }

      console.log(
        "RELYDO: notificación enviada:",
        event,
        result
      );
    } catch (notificationError) {
      console.warn(
        "RELYDO: error enviando notificación del evento:",
        event,
        notificationError
      );
    }
  }

  async function cargarDetalle(
    mostrarCarga = true
  ) {
    if (mostrarCarga) {
      setCargando(true);
    }

    setError("");

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
        router.replace(
          `/login-cliente?redirect=${encodeURIComponent(
            `/mis-solicitudes/${id}`
          )}`
        );

        return;
      }

      setUsuarioChatId(user.id);

      const { data: accountProfile, error: accountProfileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (accountProfileError || !accountProfile) {
        throw new Error(
          language === "en"
            ? "We could not verify your RELYDO account."
            : "No pudimos verificar tu cuenta de RELYDO."
        );
      }

      if (
        accountProfile.role !== "customer" &&
        accountProfile.role !== "provider"
      ) {
        throw new Error(
          language === "en"
            ? "This account does not have access to customer mode."
            : "Esta cuenta no tiene acceso al modo cliente."
        );
      }

      const {
        data:
          solicitudData,
        error:
          solicitudError,
      } = await supabase
        .from(
          "service_requests"
        )
        .select(`
          id,
          title,
          description,
          city,
          state,
          zip_code,
          preferred_date,
          preferred_time,
          preferred_provider_id,
          status,
          job_stage,
          cancellation_reason,
          cancelled_at,
          completed_at,
          completion_review_status,
          submitted_for_review_at,
          completion_approved_at
        `)
        .eq(
          "id",
          id
        )
        .eq(
          "customer_id",
          user.id
        )
        .maybeSingle();

      if (
        solicitudError ||
        !solicitudData
      ) {
        throw new Error(
          T("No encontramos esta solicitud o no tienes permiso para verla.")
        );
      }

      setSolicitud(
        solicitudData as Solicitud
      );

      /*
        CARGA PARALELA DEL DETALLE
        Una vez validada la solicitud y su ownership, estas consultas son
        independientes. Ejecutarlas juntas evita un waterfall de red.
      */
      const preferredProviderPromise = solicitudData.preferred_provider_id
        ? supabase
            .from("provider_profiles")
            .select("user_id, business_name, trade, verified")
            .eq("user_id", solicitudData.preferred_provider_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const reviewPromise = solicitudData.status === "completed"
        ? supabase
            .from("reviews")
            .select("id, job_id, reviewer_id, reviewee_id, rating, comment, created_at")
            .eq("job_id", id)
            .eq("reviewer_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const [
        preferredProviderResult,
        requestPhotosResult,
        paymentSettingsResult,
        paymentResult,
        completionEvidenceResult,
        changeOrdersResult,
        ofertasResult,
        reviewResult,
        claimResult,
      ] = await Promise.all([
        preferredProviderPromise,
        supabase
          .from("request_photos")
          .select("id, request_id, file_url, created_at")
          .eq("request_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("payment_settings")
          .select(`
            id,
            provider_commission_percent,
            customer_service_fee_percent,
            customer_cancel_on_the_way_percent,
            customer_cancel_arrived_percent,
            cancellation_provider_percent,
            currency,
            active
          `)
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("payments")
          .select(`
            id, request_id, offer_id, customer_id, provider_id,
            job_amount, customer_fee_percent, customer_fee_amount,
            customer_total_amount, provider_commission_percent,
            provider_commission_amount, provider_net_amount,
            platform_revenue_amount, refunded_amount, refunded_at,
            released_at, currency, status
          `)
          .eq("request_id", id)
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("job_completion_evidence")
          .select("id, request_id, provider_id, file_type, file_path, file_url, created_at")
          .eq("request_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("change_orders")
          .select(`
            id, request_id, provider_id, customer_id, reason, description,
            original_amount, additional_amount, new_total_amount, status,
            accepted_at, rejected_at, payment_status, stripe_checkout_session_id,
            stripe_payment_intent_id, additional_customer_fee_percent,
            additional_customer_fee_amount, additional_customer_total_amount,
            additional_provider_commission_percent, additional_provider_commission_amount,
            additional_provider_net_amount, additional_platform_revenue_amount,
            paid_at, created_at, updated_at
          `)
          .eq("request_id", id)
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("offers")
          .select(`
            id, request_id, professional_id, price, arrival_minutes,
            estimated_job_minutes, message, status, created_at
          `)
          .eq("request_id", id)
          .order("price", { ascending: true }),
        reviewPromise,
        supabase
          .from("job_claims")
          .select(`
            id, request_id, customer_id, provider_id, reason, description,
            customer_evidence_note, status, resolution_type, resolution_notes,
            provider_award_amount, customer_refund_amount, resolved_at,
            created_at, updated_at
          `)
          .eq("request_id", id)
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const { data: preferredProviderData, error: preferredProviderError } = preferredProviderResult;
      if (preferredProviderError) {
        console.error("Error cargando profesional preferido:", preferredProviderError);
        setProfesionalPreferido(null);
      } else {
        setProfesionalPreferido(
          preferredProviderData ? (preferredProviderData as PreferredProvider) : null
        );
      }

      const { data: requestPhotosData, error: requestPhotosError } = requestPhotosResult;
      if (requestPhotosError) {
        console.error("Error cargando fotos originales de la solicitud:", requestPhotosError);
        setFotosSolicitud([]);
      } else {
        const fotosBase = (requestPhotosData || []).map((foto) => {
          const marker = "/request-photos/";
          const markerIndex = foto.file_url.indexOf(marker);
          const rawPath = markerIndex >= 0
            ? foto.file_url.slice(markerIndex + marker.length)
            : foto.file_url;
          try {
            return { foto, path: decodeURIComponent(rawPath) };
          } catch {
            return { foto, path: rawPath };
          }
        });

        if (fotosBase.length === 0) {
          setFotosSolicitud([]);
        } else {
          const { data: signedPhotos, error: signedPhotosError } = await supabase.storage
            .from("request-photos")
            .createSignedUrls(fotosBase.map((item) => item.path), 60 * 60);

          if (signedPhotosError) {
            console.error("Error creando URLs seguras para fotos de solicitud:", signedPhotosError);
          }

          setFotosSolicitud(
            fotosBase.map(({ foto }, index) => ({
              ...foto,
              signed_url: signedPhotos?.[index]?.signedUrl || null,
            })) as RequestPhoto[]
          );
        }
      }

      const { data: paymentSettingsData, error: paymentSettingsError } = paymentSettingsResult;
      if (paymentSettingsError) {
        throw new Error(T("No pudimos cargar las tarifas de RELYDO"));
      }
      setPaymentSettings(paymentSettingsData ? (paymentSettingsData as PaymentSettings) : null);

      const { data: paymentData, error: paymentError } = paymentResult;
      if (paymentError) console.error("Error cargando cálculo de pago:", paymentError);
      setPayment(paymentData ? (paymentData as PaymentCalculation) : null);

      const { data: completionEvidenceData, error: completionEvidenceError } = completionEvidenceResult;
      if (completionEvidenceError) {
        console.error("Error cargando evidencia final del profesional:", completionEvidenceError);
        setEvidenciasFinales([]);
      } else {
        const evidenciaBase = (completionEvidenceData || []) as Omit<CompletionEvidence, "signed_url">[];
        if (evidenciaBase.length === 0) {
          setEvidenciasFinales([]);
        } else {
          const { data: signedEvidence, error: signedEvidenceError } = await supabase.storage
            .from("job-completion-evidence")
            .createSignedUrls(evidenciaBase.map((item) => item.file_path), 60 * 60);

          if (signedEvidenceError) {
            console.error("Error creando URLs seguras para evidencia final:", signedEvidenceError);
          }

          setEvidenciasFinales(
            evidenciaBase.map((item, index) => ({
              ...item,
              signed_url: signedEvidence?.[index]?.signedUrl || null,
            }))
          );
        }
      }

      const { data: changeOrdersData, error: changeOrdersError } = changeOrdersResult;
      if (changeOrdersError) {
        console.error("Error cargando cambios de presupuesto:", changeOrdersError);
        setChangeOrders([]);
      } else {
        setChangeOrders((changeOrdersData || []) as ChangeOrder[]);
      }

      const { data: ofertasData, error: ofertasError } = ofertasResult;
      if (ofertasError) {
        throw new Error(T("No pudimos cargar los presupuestos"));
      }

      const ofertasBase = (ofertasData || []) as Oferta[];
      let ofertasCompletas: OfertaConProfesional[] = [];

      if (ofertasBase.length > 0) {
        const professionalIds = [...new Set(ofertasBase.map((oferta) => oferta.professional_id))];
        const { data: profesionalesData, error: profesionalesError } = await supabase
          .from("provider_profiles")
          .select(`
            user_id, business_name, trade, years_experience,
            average_rating, completed_jobs, verified
          `)
          .in("user_id", professionalIds);

        if (profesionalesError) {
          console.error("Error cargando profesionales:", profesionalesError);
        }

        const profesionales = (profesionalesData || []) as Profesional[];
        const profesionalesPorId = new Map(
          profesionales.map((profesional) => [profesional.user_id, profesional])
        );
        ofertasCompletas = ofertasBase.map((oferta) => ({
          ...oferta,
          profesional: profesionalesPorId.get(oferta.professional_id) || null,
        }));
      }
      setOfertas(ofertasCompletas);

      const { data: reviewData, error: reviewError } = reviewResult;
      if (reviewError) console.error("Error cargando reseña:", reviewError);
      if (solicitudData.status === "completed" && reviewData) {
        setReview(reviewData as Review);
        setRating(reviewData.rating);
        setComentario(reviewData.comment || "");
      } else {
        setReview(null);
      }

      const { data: claimData, error: claimError } = claimResult;
      if (claimError) console.error("Error cargando reclamo:", claimError);
      setClaim(claimData ? (claimData as JobClaim) : null);
    } catch (err) {
      console.error(
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("Ocurrió un error inesperado.")
      );
    } finally {
      if (mostrarCarga) {
        setCargando(
          false
        );
      }
    }
  }

  /*
    ACEPTAR OFERTA
  */

  async function aceptarOferta(
    oferta: OfertaConProfesional
  ) {
    if (!solicitud) return;

    if (solicitud.status !== "open") {
      setError(T("Esta solicitud ya tiene un profesional contratado."));
      return;
    }

    if (oferta.status !== "pending") {
      setError(T("Este presupuesto ya no está disponible."));
      return;
    }

    if (!paymentSettings) {
      setError(
        T("No pudimos cargar la configuración de pagos de RELYDO. Actualiza la página e inténtalo nuevamente.")
      );
      return;
    }

    /*
      13.4 — CHECKOUT

      Ya NO aceptamos la oferta desde esta pantalla.
      Primero enviamos al cliente al checkout.
      La oferta se aceptará solamente cuando el flujo
      de pago esté listo/confirmado en la siguiente fase.
    */

    router.push(
      `/checkout/${solicitud.id}?offer=${encodeURIComponent(oferta.id)}`
    );
  }

  /*
    PAGAR CAMBIO DE PRESUPUESTO
  */

  async function pagarCambioPresupuesto(
    changeOrder: ChangeOrder
  ) {
    if (!solicitud) {
      return;
    }

    if (changeOrder.status !== "accepted") {
      setError(
        T("Debes aceptar el cambio de presupuesto antes de pagarlo.")
      );
      return;
    }

    setPagandoChangeOrderId(
      changeOrder.id
    );
    setError("");
    setMensaje("");

    try {
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData.session
      ) {
        throw new Error(
          T("No pudimos verificar tu sesión de cliente.")
        );
      }

      const response =
        await fetch(
          "/api/change-orders/checkout",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({
              changeOrderId:
                changeOrder.id,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            T("No pudimos iniciar el pago adicional.")
        );
      }

      if (!data?.url) {
        throw new Error(
          T("Stripe no devolvió la dirección del checkout adicional.")
        );
      }

      window.location.href =
        data.url;
    } catch (err) {
      console.error(
        "Error iniciando pago de Change Order:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No pudimos iniciar el pago adicional.")
      );

      setPagandoChangeOrderId(
        null
      );
    }
  }

  /*
    RESPONDER CAMBIO DE PRESUPUESTO

    Si el cliente acepta, registramos la aceptación y
    lo enviamos inmediatamente al checkout de Stripe.
  */

  async function responderCambioPresupuesto(
    changeOrder: ChangeOrder,
    decision: "accepted" | "rejected"
  ) {
    if (!solicitud) {
      return;
    }

    if (changeOrder.status !== "pending") {
      setError(
        T("Este cambio de presupuesto ya fue respondido.")
      );
      return;
    }

    const accion =
      decision === "accepted"
        ? "aceptar"
        : "rechazar";

    const confirmar =
      window.confirm(
        decision === "accepted"
          ? `${T("¿Confirmas que aceptas el cambio de presupuesto?")}

${T("Total anterior")}: $${Number(
              changeOrder.original_amount
            ).toFixed(2)}
${T("Adicional")}: $${Number(
              changeOrder.additional_amount
            ).toFixed(2)}
${T("Nuevo total")}: $${Number(
              changeOrder.new_total_amount
            ).toFixed(2)}

${T("Al aceptar, continuarás al pago seguro de Stripe para pagar el monto adicional y la tarifa de servicio de RELYDO.")}`
          : `${T("¿Confirmas que deseas rechazar este cambio de presupuesto?")} $${Number(
              changeOrder.additional_amount
            ).toFixed(2)}`
      );

    if (!confirmar) {
      return;
    }

    setRespondiendoChangeOrderId(
      changeOrder.id
    );
    setError("");
    setMensaje("");

    try {
      const ahoraIso =
        new Date().toISOString();

      const cambios =
        decision === "accepted"
          ? {
              status: "accepted",
              accepted_at: ahoraIso,
              rejected_at: null,
              updated_at: ahoraIso,
            }
          : {
              status: "rejected",
              accepted_at: null,
              rejected_at: ahoraIso,
              updated_at: ahoraIso,
            };

      const {
        data: actualizado,
        error: updateError,
      } = await supabase
        .from("change_orders")
        .update(cambios)
        .eq("id", changeOrder.id)
        .eq("request_id", solicitud.id)
        .eq("status", "pending")
        .select(`
          id,
          request_id,
          provider_id,
          customer_id,
          reason,
          description,
          original_amount,
          additional_amount,
          new_total_amount,
          status,
          accepted_at,
          rejected_at,
          payment_status,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          additional_customer_fee_percent,
          additional_customer_fee_amount,
          additional_customer_total_amount,
          additional_provider_commission_percent,
          additional_provider_commission_amount,
          additional_provider_net_amount,
          additional_platform_revenue_amount,
          paid_at,
          created_at,
          updated_at
        `)
        .maybeSingle();

      if (updateError) {
        throw new Error(
          updateError.message
        );
      }

      if (!actualizado) {
        throw new Error(
          T("Este cambio de presupuesto ya fue respondido o cambió de estado.")
        );
      }

      setChangeOrders(
        (actuales) =>
          actuales.map(
            (item) =>
              item.id ===
              changeOrder.id
                ? (actualizado as ChangeOrder)
                : item
          )
      );

      await notificarEventoTrabajo(
        "change_order_answered",
        {
          changeOrderId:
            changeOrder.id,
        }
      );

      if (
        decision === "accepted"
      ) {
        setMensaje(
          T("Cambio de presupuesto aceptado. Ahora te enviaremos al pago seguro de Stripe para cobrar solamente el monto adicional y la tarifa de servicio correspondiente.")
        );

        await pagarCambioPresupuesto(
          actualizado as ChangeOrder
        );

        return;
      }

      setMensaje(
        T("Cambio de presupuesto rechazado. El precio anterior permanece sin cambios.")
      );
    } catch (err) {
      console.error(
        `Error al ${accion} cambio de presupuesto:`,
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo registrar tu decisión.")
      );

      await cargarDetalle(
        false
      );
    } finally {
      setRespondiendoChangeOrderId(
        null
      );
    }
  }

  /*
    CANCELAR SOLICITUD
  */

  async function cancelarSolicitud() {
    if (!solicitud) {
      return;
    }

    const puedeCancelar =
      solicitud.status === "open" ||
      (
        solicitud.status === "in_progress" &&
        solicitud.job_stage !== "working"
      );

    if (!puedeCancelar) {
      setError(
        solicitud.job_stage === "working"
          ? T("El trabajo ya fue iniciado. No puede cancelarse automáticamente; cualquier problema debe gestionarse mediante el sistema de reclamos.")
          : T("Esta solicitud ya no puede cancelarse automáticamente.")
      );
      return;
    }

    if (!motivoCancelacion.trim()) {
      setError(
        T("Selecciona un motivo para cancelar la solicitud.")
      );
      return;
    }

    const resumen =
      calcularCancelacionCliente(
        solicitud,
        payment,
        paymentSettings
      );

    let textoConfirmacion =
      T("¿Confirmas que deseas cancelar esta solicitud? Esta acción no se puede deshacer.");

    if (
      solicitud.status === "in_progress" &&
      payment
    ) {
      textoConfirmacion =
        `${T("¿Confirmas la cancelación?")}\n\n` +
        `${T("Total pagado")}: $${resumen.totalPagado.toFixed(2)}\n` +
        `${T("Tarifa de servicio RELYDO")}: $${resumen.serviceFee.toFixed(2)}\n` +
        `${T("Penalidad")}: ${resumen.penalidadPercent.toFixed(2)}% = $${resumen.penalidad.toFixed(2)}\n` +
        `${T("Profesional")}: $${resumen.profesional.toFixed(2)}\n` +
        `RELYDO: $${resumen.relydo.toFixed(2)}\n` +
        `${T("Reembolso al cliente")}: $${resumen.reembolso.toFixed(2)}\n\n` +
        T("Esta acción no se puede deshacer.");
    }

    const confirmar =
      window.confirm(
        textoConfirmacion
      );

    if (!confirmar) {
      return;
    }

    setCancelando(true);
    setError("");
    setMensaje("");

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData.session
      ) {
        throw new Error(
          T("No pudimos verificar tu sesión de cliente.")
        );
      }

      const response =
        await fetch(
          "/api/customer/cancel-job",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({
              requestId:
                solicitud.id,
              reason:
                motivoCancelacion.trim(),
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            T("No se pudo cancelar la solicitud.")
        );
      }

      setMostrarCancelacion(false);
      setMotivoCancelacion("");

      if (
        Number(data.customerRefundAmount || 0) > 0 ||
        Number(data.providerAwardAmount || 0) > 0
      ) {
        setMensaje(
          `${T("Solicitud cancelada correctamente. Se procesó un reembolso de")} $${Number(
            data.customerRefundAmount || 0
          ).toFixed(2)}.`
        );
      } else {
        setMensaje(
          T("La solicitud fue cancelada correctamente.")
        );
      }

      await cargarDetalle(false);
    } catch (err) {
      console.error(
        "Error cancelando solicitud:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("Ocurrió un error inesperado.")
      );
    } finally {
      setCancelando(false);
    }
  }

  /*
    APROBAR FINALIZACIÓN DEL TRABAJO
  */

  async function aprobarFinalizacionTrabajo() {
    if (!solicitud) {
      return;
    }

    if (
      solicitud.status !== "in_progress" ||
      solicitud.job_stage !== "working" ||
      solicitud.completion_review_status !== "pending"
    ) {
      setError(
        T("Este trabajo no está pendiente de tu aprobación.")
      );
      return;
    }

    if (claim && claim.status !== "resolved") {
      setError(
        T("No puedes aprobar el trabajo mientras exista un reclamo activo.")
      );
      return;
    }

    if (
      !window.confirm(
        T("¿Confirmas que el trabajo fue realizado correctamente y deseas aprobarlo como completado?")
      )
    ) {
      return;
    }

    setAprobandoFinalizacion(true);
    setError("");
    setMensaje("");

    try {
      const { error: approvalError } =
        await supabase.rpc(
          "approve_job_completion",
          {
            p_request_id: solicitud.id,
          }
        );

      if (approvalError) {
        throw new Error(approvalError.message);
      }

      await notificarEventoTrabajo(
        "job_completion_approved"
      );

      await cargarDetalle(false);
      setMensaje(
        T("Trabajo aprobado correctamente.")
      );
    } catch (err) {
      console.error(
        "Error aprobando finalización del trabajo:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo aprobar el trabajo.")
      );

      await cargarDetalle(false);
    } finally {
      setAprobandoFinalizacion(false);
    }
  }

  /*
    ENVIAR RESEÑA
  */

  async function enviarResena(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      !solicitud ||
      solicitud.status !==
        "completed"
    ) {
      setError(
        T("Este trabajo todavía no puede ser calificado.")
      );

      return;
    }

    if (review) {
      setError(
        T("Ya calificaste este trabajo.")
      );

      return;
    }

    const ofertaSeleccionada =
      ofertas.find(
        (oferta) =>
          oferta.status ===
          "selected"
      );

    if (
      !ofertaSeleccionada
    ) {
      setError(
        T("No pudimos identificar al profesional contratado.")
      );

      return;
    }

    if (
      rating < 1 ||
      rating > 5
    ) {
      setError(
        "Selecciona una calificación de 1 a 5 estrellas."
      );

      return;
    }

    setEnviandoReview(
      true
    );

    setError("");
    setMensaje("");

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
        throw new Error(
          T("Debes iniciar sesión para enviar una reseña.")
        );
      }

      const {
        data:
          existingReview,
        error:
          existingError,
      } = await supabase
        .from("reviews")
        .select("id")
        .eq(
          "job_id",
          solicitud.id
        )
        .eq(
          "reviewer_id",
          user.id
        )
        .maybeSingle();

      if (
        existingError
      ) {
        throw new Error(
          existingError.message
        );
      }

      if (
        existingReview
      ) {
        setError(
          T("Ya enviaste una reseña para este trabajo.")
        );

        await cargarDetalle(
          false
        );

        return;
      }

      const {
        data:
          reviewData,
        error:
          insertError,
      } = await supabase
        .from("reviews")
        .insert({
          job_id:
            solicitud.id,

          reviewer_id:
            user.id,

          reviewee_id:
            ofertaSeleccionada.professional_id,

          rating,

          comment:
            comentario.trim() ||
            null,
        })
        .select(`
          id,
          job_id,
          reviewer_id,
          reviewee_id,
          rating,
          comment,
          created_at
        `)
        .single();

      if (
        insertError
      ) {
        throw new Error(
          insertError.message
        );
      }

      setReview(
        reviewData as Review
      );

      setMensaje(
        T("Gracias. Tu calificación fue enviada correctamente.")
      );
    } catch (err) {
      console.error(
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo enviar la reseña.")
      );
    } finally {
      setEnviandoReview(
        false
      );
    }
  }

  /*
    EVIDENCIA DEL RECLAMO
  */

  function seleccionarEvidenciaReclamo(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const nuevos =
      Array.from(
        event.target.files || []
      );

    if (
      nuevos.length === 0
    ) {
      return;
    }

    const permitidos = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    const invalidos =
      nuevos.filter(
        (file) =>
          !permitidos.includes(
            file.type
          )
      );

    if (
      invalidos.length > 0
    ) {
      setError(
        "Solo puedes adjuntar fotos JPG, PNG o WEBP y videos MP4, WEBM o MOV."
      );
      event.target.value = "";
      return;
    }

    const demasiadoGrandes =
      nuevos.filter(
        (file) =>
          file.size >
          50 * 1024 * 1024
      );

    if (
      demasiadoGrandes.length > 0
    ) {
      setError(
        "Cada foto o video debe pesar 50 MB o menos."
      );
      event.target.value = "";
      return;
    }

    const combinados = [
      ...evidenciasReclamo,
      ...nuevos,
    ];

    const imagenes =
      combinados.filter(
        (file) =>
          file.type.startsWith(
            "image/"
          )
      );

    const videos =
      combinados.filter(
        (file) =>
          file.type.startsWith(
            "video/"
          )
      );

    if (
      imagenes.length > 10
    ) {
      setError(
        T("Puedes adjuntar un máximo de 10 fotos por reclamo.")
      );
      event.target.value = "";
      return;
    }

    if (
      videos.length > 2
    ) {
      setError(
        T("Puedes adjuntar un máximo de 2 videos por reclamo.")
      );
      event.target.value = "";
      return;
    }

    setEvidenciasReclamo(
      combinados
    );

    setError("");
    event.target.value = "";
  }

  function eliminarEvidenciaReclamo(
    index: number
  ) {
    setEvidenciasReclamo(
      (actuales) =>
        actuales.filter(
          (_, i) =>
            i !== index
        )
    );
  }

  async function subirEvidenciasReclamo(
    claimId: string,
    userId: string
  ) {
    if (
      evidenciasReclamo.length ===
      0
    ) {
      return;
    }

    for (
      const [
        index,
        file,
      ] of evidenciasReclamo.entries()
    ) {
      const extension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase() ||
        (file.type.startsWith(
          "video/"
        )
          ? "mp4"
          : "jpg");

      const nombreSeguro =
        file.name
          .replace(
            /[^a-zA-Z0-9._-]/g,
            "-"
          )
          .slice(
            0,
            80
          );

      const ruta =
        `${claimId}/${userId}/${Date.now()}-${index}-${nombreSeguro || `evidencia.${extension}`}`;

      const {
        error:
          uploadError,
      } =
        await supabase.storage
          .from(
            "claim-evidence"
          )
          .upload(
            ruta,
            file,
            {
              cacheControl:
                "3600",
              upsert: false,
              contentType:
                file.type,
            }
          );

      if (
        uploadError
      ) {
        throw new Error(
          `El reclamo fue creado, pero no pudimos subir "${file.name}": ${uploadError.message}`
        );
      }

      const fileType =
        file.type.startsWith(
          "video/"
        )
          ? "video"
          : "image";

      const {
        error:
          evidenceError,
      } =
        await supabase
          .from(
            "claim_evidence"
          )
          .insert({
            claim_id:
              claimId,
            uploaded_by:
              userId,
            uploaded_by_role:
              "customer",
            file_type:
              fileType,
            file_url:
              ruta,
            file_path:
              ruta,
          });

      if (
        evidenceError
      ) {
        await supabase.storage
          .from(
            "claim-evidence"
          )
          .remove([
            ruta,
          ]);

        throw new Error(
          `El reclamo fue creado, pero no pudimos registrar "${file.name}": ${evidenceError.message}`
        );
      }
    }
  }

  /*
    REPORTAR PROBLEMA
  */

  async function enviarReclamo(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    const puedeReportar =
      solicitud &&
      (
        solicitud.status === "completed" ||
        (
          solicitud.status === "in_progress" &&
          solicitud.job_stage === "working"
        )
      );

    if (!puedeReportar) {
      setError(
        T("Este trabajo todavía no puede reportarse.")
      );
      return;
    }

    if (claim) {
      setError(T("Ya reportaste un problema para este trabajo."));
      return;
    }

    const ofertaSeleccionada = ofertas.find(
      (oferta) => oferta.status === "selected"
    );

    if (!ofertaSeleccionada) {
      setError(T("No pudimos identificar al profesional contratado."));
      return;
    }

    if (!motivoReclamo.trim()) {
      setError(T("Selecciona el motivo del reclamo."));
      return;
    }

    if (descripcionReclamo.trim().length < 5) {
      setError(T("Explica brevemente qué ocurrió con el trabajo."));
      return;
    }

    if (
      evidenciasReclamo.length > 0 &&
      explicacionEvidenciaCliente.trim().length < 5
    ) {
      setError(
        "Explica brevemente qué muestran las fotos o videos que adjuntaste."
      );
      return;
    }

    setEnviandoReclamo(true);
    setError("");
    setMensaje("");

    try {
      const { data: { user }, error: userError } =
        await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(T("Debes iniciar sesión para reportar un problema."));
      }

      const { data: existingClaim, error: existingClaimError } =
        await supabase
          .from("job_claims")
          .select("id")
          .eq("request_id", solicitud.id)
          .eq("customer_id", user.id)
          .limit(1)
          .maybeSingle();

      if (existingClaimError) {
        throw new Error(existingClaimError.message);
      }

      if (existingClaim) {
        setError(T("Ya existe un reclamo para este trabajo."));
        setEvidenciasReclamo([]);
        await cargarDetalle(false);
        return;
      }

      const { data: claimData, error: insertClaimError } =
        await supabase
          .from("job_claims")
          .insert({
            request_id: solicitud.id,
            customer_id: user.id,
            provider_id: ofertaSeleccionada.professional_id,
            reason: motivoReclamo.trim(),
            description: descripcionReclamo.trim(),
            customer_evidence_note:
              evidenciasReclamo.length > 0
                ? explicacionEvidenciaCliente.trim()
                : null,
            status: "open",
          })
          .select(`
            id,
            request_id,
            customer_id,
            provider_id,
            reason,
            description,
            status,
            resolution_notes,
            created_at,
            updated_at
          `)
          .single();

      if (insertClaimError) {
        throw new Error(insertClaimError.message);
      }

      await subirEvidenciasReclamo(
        claimData.id,
        user.id
      );

      await notificarEventoTrabajo(
        "claim_created",
        {
          claimId:
            claimData.id,
        }
      );

      setClaim(claimData as JobClaim);
      setMostrarReclamo(false);
      setMotivoReclamo("");
      setDescripcionReclamo("");
      setExplicacionEvidenciaCliente("");
      setEvidenciasReclamo([]);
      setMensaje(
        evidenciasReclamo.length > 0
          ? `Tu reporte fue registrado correctamente con ${evidenciasReclamo.length} archivo${
              evidenciasReclamo.length === 1
                ? ""
                : "s"
            } de evidencia.`
          : T("Tu reporte fue registrado correctamente.")
      );
    } catch (err) {
      console.error("Error enviando reclamo:", err);
      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo enviar el reclamo.")
      );
    } finally {
      setEnviandoReclamo(false);
    }
  }

  const reclamoActivoChat =
    Boolean(
      claim &&
        (
          claim.status === "open" ||
          claim.status === "reviewing" ||
          claim.status === "in_review"
        )
    );

  const chatDentroDe12Horas =
    Boolean(
      solicitud?.status ===
        "completed" &&
        solicitud.completed_at &&
        ahoraChat -
          new Date(
            solicitud.completed_at
          ).getTime() <
          12 * 60 * 60 * 1000
    );

  const chatPuedeEnviar =
    Boolean(
      solicitud &&
        !reclamoActivoChat &&
        (
          solicitud.status ===
            "in_progress" ||
          chatDentroDe12Horas
        )
    );

  function motivoChatBloqueado() {
    if (reclamoActivoChat) {
      return T("Chat bloqueado porque existe un reclamo activo. A partir de este momento RELYDO Admin gestiona el caso.");
    }

    if (
      solicitud?.status ===
        "completed"
    ) {
      if (!solicitud.completed_at) {
        return T("El trabajo está completado y el chat ya está cerrado.");
      }

      return T("El período de 12 horas después de completar el trabajo terminó. El historial permanece disponible.");
    }

    if (
      solicitud?.status ===
        "cancelled"
    ) {
      return T("Este trabajo fue cancelado. El chat está cerrado.");
    }

    return T("El chat estará disponible cuando el trabajo esté contratado.");
  }

  async function enviarMensajeChat() {
    const texto =
      mensajeChat.trim();

    if (
      !texto ||
      !usuarioChatId ||
      !solicitud ||
      !chatPuedeEnviar
    ) {
      return;
    }

    setEnviandoMensajeChat(true);
    setError("");

    try {
      const {
        data,
        error: insertError,
      } = await supabase
        .from("job_messages")
        .insert({
          request_id:
            solicitud.id,
          sender_id:
            usuarioChatId,
          sender_role:
            "customer",
          message:
            texto,
        })
        .select(`
          id,
          request_id,
          sender_id,
          sender_role,
          message,
          read_at,
          created_at
        `)
        .single();

      if (insertError) {
        throw new Error(
          `No se pudo enviar el mensaje: ${insertError.message}`
        );
      }

      setMensajeChat("");

      if (data) {
        const nuevo =
          data as JobMessage;

        setMensajesChat(
          (actuales) =>
            actuales.some(
              (item) =>
                item.id === nuevo.id
            )
              ? actuales
              : [
                  ...actuales,
                  nuevo,
                ]
        );

        void notificarEventoTrabajo("job_message_sent");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : T("No se pudo enviar el mensaje.")
      );
    } finally {
      setEnviandoMensajeChat(false);
    }
  }

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl bg-white px-8 py-7 shadow-lg">
          <p className="font-bold text-slate-700">
            {T("Cargando solicitud...")}
          </p>
        </div>
      </main>
    );
  }

  if (
    error &&
    !solicitud
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl">

          <h1 className="text-2xl font-extrabold text-red-700">
            {T("No se pudo abrir la solicitud")}
          </h1>

          <p className="mt-4 text-slate-600">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/mis-solicitudes"
              )
            }
            className="mt-6 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800"
          >
            {T("Volver a mis solicitudes")}
          </button>

        </div>
      </main>
    );
  }

  if (!solicitud) {
    return null;
  }

  const ofertaSeleccionada =
    ofertas.find(
      (oferta) =>
        oferta.status ===
        "selected"
    );

  const changeOrderPendiente =
    changeOrders.find(
      (changeOrder) =>
        changeOrder.status === "pending"
    ) || null;

  const ultimoChangeOrder =
    changeOrders[0] || null;

  const changeOrdersPagados =
    changeOrders.filter(
      (changeOrder) =>
        changeOrder.status ===
          "accepted" &&
        changeOrder.payment_status ===
          "paid"
    );

  const adicionalesPagados =
    redondearDinero(
      changeOrdersPagados.reduce(
        (total, changeOrder) =>
          total +
          Number(
            changeOrder.additional_amount ||
              0
          ),
        0
      )
    );

  const feesAdicionalesPagados =
    redondearDinero(
      changeOrdersPagados.reduce(
        (total, changeOrder) =>
          total +
          Number(
            changeOrder.additional_customer_fee_amount ||
              0
          ),
        0
      )
    );

  const totalesAdicionalesPagados =
    redondearDinero(
      changeOrdersPagados.reduce(
        (total, changeOrder) =>
          total +
          Number(
            changeOrder.additional_customer_total_amount ||
              0
          ),
        0
      )
    );

  const presupuestoTotalPagado =
    redondearDinero(
      Number(
        payment?.job_amount || 0
      ) +
        adicionalesPagados
    );

  const tarifaClienteTotalPagada =
    redondearDinero(
      Number(
        payment?.customer_fee_amount ||
          0
      ) +
        feesAdicionalesPagados
    );

  const totalClientePagado =
    redondearDinero(
      Number(
        payment?.customer_total_amount ||
          0
      ) +
        totalesAdicionalesPagados
    );

  const ofertasPendientes =
    ofertas.filter(
      (oferta) =>
        oferta.status ===
        "pending"
    ).length;

  const profesionalLiberoTrabajo =
    solicitud.status ===
      "open" &&
    !ofertaSeleccionada &&
    ofertas.some(
      (oferta) =>
        oferta.status ===
        "rejected"
    );

  const etapaActual =
    numeroEtapa(
      solicitud.status,
      solicitud.job_stage,
      solicitud.completion_review_status
    );

  const mostrarSeguimiento =
    solicitud.status ===
      "in_progress" ||
    solicitud.status ===
      "completed";

  const trabajoFinalizadoConReview =
    solicitud.status === "completed" &&
    Boolean(review);

  const panelesCerrados =
    trabajoFinalizadoConReview ||
    solicitud.status === "cancelled";

  const puedeCancelar =
    solicitud.status ===
      "open" ||
    (
      solicitud.status ===
        "in_progress" &&
      solicitud.job_stage !==
        "working"
    );

  const resumenCancelacion =
    calcularCancelacionCliente(
      solicitud,
      payment,
      paymentSettings
    );

  const canceladoPorRelydo =
    solicitud.status === "cancelled" &&
    Boolean(
      solicitud.cancellation_reason
        ?.toLowerCase()
        .includes("reclamo resuelto")
    );

  const reclamoResuelto =
    claim?.status === "resolved";

  const reembolsoReclamo =
    redondearDinero(
      Number(
        claim?.customer_refund_amount || 0
      )
    );

  const compensacionProfesionalReclamo =
    redondearDinero(
      Number(
        claim?.provider_award_amount || 0
      )
    );

  const fotosVisor = [
    ...fotosSolicitud
      .filter((foto) => Boolean(foto.signed_url))
      .map((foto) => ({
        id: `request-${foto.id}`,
        url: foto.signed_url as string,
        alt: T("Foto de la solicitud"),
      })),
    ...evidenciasFinales
      .filter(
        (item) =>
          item.file_type === "image" &&
          Boolean(item.signed_url)
      )
      .map((item) => ({
        id: `evidence-${item.id}`,
        url: item.signed_url as string,
        alt: T("Evidencia del trabajo terminado"),
      })),
  ];

  function abrirVisorFoto(id: string) {
    const index = fotosVisor.findIndex(
      (foto) => foto.id === id
    );

    if (index >= 0) {
      setVisorFotoIndex(index);
    }
  }

  function moverVisorFoto(direccion: -1 | 1) {
    setVisorFotoIndex((actual) => {
      if (actual === null || fotosVisor.length === 0) {
        return actual;
      }

      return (actual + direccion + fotosVisor.length) % fotosVisor.length;
    });
  }

  const etapas = [
    {
      numero: 1,
      icono: "🤝",
      titulo: T("Contratado"),
      descripcion:
        T("Profesional contratado"),
    },
    {
      numero: 2,
      icono: "🚗",
      titulo: T("En camino"),
      descripcion:
        T("Va rumbo a tu ubicación"),
    },
    {
      numero: 3,
      icono: "📍",
      titulo: T("Llegó"),
      descripcion:
        T("Ya se encuentra en el lugar"),
    },
    {
      numero: 4,
      icono: "🛠️",
      titulo:
        T("Trabajo iniciado"),
      descripcion:
        T("El servicio está en proceso"),
    },
    {
      numero: 5,
      icono: "🔎",
      titulo: T("En revisión"),
      descripcion:
        T("Pendiente de tu aprobación"),
    },
    {
      numero: 6,
      icono: "✅",
      titulo: T("Completado"),
      descripcion:
        T("Trabajo terminado"),
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="hidden" aria-hidden="true">
        <NotificationsBell modo="cliente" />
      </div>


      <div className="mx-auto max-w-5xl">

        <button
          type="button"
          onClick={() =>
            router.push(
              "/mis-solicitudes"
            )
          }
          className="font-bold text-blue-700 hover:underline"
        >
          {T("← Volver a mis solicitudes")}
        </button>

        {/* SOLICITUD */}

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="mb-5 px-5 pt-4 font-extrabold text-slate-900">
              <span>{T("Detalles de la solicitud")}</span>
            </div>

          <div className="bg-blue-700 p-8 text-white">

            <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800">
              {T(
                nombreEstadoSolicitud(
                  solicitud.status
                )
              )}
            </span>

            <h1 className="mt-4 text-3xl font-extrabold md:text-4xl">
              {solicitud.title}
            </h1>

            <p className="mt-3 max-w-3xl text-blue-100">
              {solicitud.description}
            </p>

          </div>

          <div className="grid grid-cols-1 gap-4 p-8 md:grid-cols-3">

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">
                {T("📍 Ubicación")}
              </p>

              <p className="mt-1 font-extrabold text-slate-900">
                {solicitud.city},{" "}
                {solicitud.state}{" "}
                {solicitud.zip_code}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">
                {T("📅 Fecha preferida")}
              </p>

              <p className="mt-1 font-extrabold text-slate-900">
                {solicitud.preferred_date ||
                  "Flexible"}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">
                {T("🕐 Hora preferida")}
              </p>

              <p className="mt-1 font-extrabold text-slate-900">
                {solicitud.preferred_time ||
                  "Flexible"}
              </p>
            </div>

          </div>

        </section>

        {/* AVISO SOLO MIENTRAS NO HAYA OFERTAS NUEVAS */}

        {profesionalLiberoTrabajo &&
          ofertasPendientes ===
            0 && (
            <section className="mt-6 rounded-3xl border-2 border-amber-300 bg-amber-50 p-7 shadow-sm">
              <div className="mb-5 font-extrabold text-slate-900">
              <span>{T("Buscando un nuevo profesional")}</span>
            </div>

              <div className="flex items-start gap-4">

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500 text-2xl text-white">
                  ⚠️
                </div>

                <div className="flex-1">

                  <p className="text-sm font-extrabold uppercase tracking-wide text-amber-700">
                    {T("Buscando un nuevo profesional")}
                  </p>

                  <h2 className="mt-2 text-2xl font-extrabold text-amber-950">
                    {T("El profesional anterior ya no está disponible")}
                  </h2>

                  <p className="mt-2 leading-7 text-amber-900">
                    {T("Tu solicitud volvió a publicarse automáticamente para que otros profesionales puedan enviarte nuevos presupuestos. No necesitas crear otra solicitud.")}
                  </p>

                  <div className="mt-5 rounded-2xl border border-amber-200 bg-white p-5">

                    <p className="font-extrabold text-slate-900">
                      {T("Esperando nuevos presupuestos")}
                    </p>

                    <p className="mt-1 text-sm text-slate-600">
                      {T("Cuando otro profesional compatible envíe una oferta, aparecerá automáticamente en esta página.")}
                    </p>

                  </div>

                </div>

              </div>

            </section>
          )}

        {/* SEGUIMIENTO */}

        {mostrarSeguimiento && (
          <details
            key={panelesCerrados ? "seguimiento-cerrado" : "seguimiento-abierto"}
            open={!panelesCerrados}
            className="group mt-6"
          >
            <summary
              className={panelesCerrados
                ? "cursor-pointer list-none rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                : "hidden"}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                    {T("Seguimiento en vivo")}
                  </p>
                  <p className="mt-1 font-extrabold text-slate-950">
                    ✅ {T("Trabajo completado")}
                  </p>
                </div>
                <span className="text-xl text-slate-500 transition group-open:rotate-90">›</span>
              </div>
            </summary>
            <section className={panelesCerrados
              ? "mt-2 rounded-3xl border border-slate-200 bg-white p-7 shadow-xl"
              : "rounded-3xl border border-slate-200 bg-white p-7 shadow-xl"}>
            <div className="mb-5 font-extrabold text-slate-900">
              <span>{T("Seguimiento en vivo")}</span>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

              <div>
                <p className="text-sm font-black uppercase tracking-wide text-blue-700">
                  {T("Seguimiento en vivo")}
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  {T(
                    tituloEtapa(
                      solicitud.status,
                      solicitud.job_stage,
                      solicitud.completion_review_status
                    )
                  )}
                </h2>

                <p className="mt-2 text-slate-600">
                  {T(
                    textoEtapa(
                      solicitud.status,
                      solicitud.job_stage,
                      solicitud.completion_review_status
                    )
                  )}
                </p>
              </div>

              {solicitud.status !==
                "completed" && (
                <div
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${
                    realtimeConectado
                      ? "bg-green-50 text-green-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  <span
                    className={`h-3 w-3 rounded-full ${
                      realtimeConectado
                        ? "bg-green-500"
                        : "bg-amber-500"
                    }`}
                  />

                  {realtimeConectado
                    ? T("Actualizando en vivo")
                    : "Conectando..."}
                </div>
              )}

            </div>

            <div className="mt-9">

              <div className="grid grid-cols-6 gap-1">

                {etapas.map(
                  (etapa) => {
                    const completada =
                      etapa.numero <=
                      etapaActual;

                    const actual =
                      etapa.numero ===
                      etapaActual;

                    return (
                      <div
                        key={
                          etapa.numero
                        }
                        className="relative text-center"
                      >

                        {etapa.numero <
                          6 && (
                            <div
                              className={`absolute left-1/2 top-5 h-1 w-full ${
                                etapa.numero <
                                etapaActual
                                  ? "bg-blue-600"
                                  : "bg-slate-200"
                              }`}
                            />
                          )}

                        <div
                          className={`relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-black ${
                            completada
                              ? "border-blue-700 bg-blue-700 text-white"
                              : "border-slate-300 bg-white text-slate-400"
                          } ${
                            actual &&
                            solicitud.status !==
                              "completed"
                              ? "ring-4 ring-blue-100"
                              : ""
                          }`}
                        >
                          {etapa.numero}
                        </div>

                        <div className="relative z-10 mt-3 text-xl">
                          {etapa.icono}
                        </div>

                        <p
                          className={`mt-1 text-xs font-black sm:text-sm ${
                            completada
                              ? "text-slate-950"
                              : "text-slate-400"
                          }`}
                        >
                          {etapa.titulo}
                        </p>

                        <p className="mt-1 hidden text-xs text-slate-500 md:block">
                          {etapa.descripcion}
                        </p>

                      </div>
                    );
                  }
                )}

              </div>

            </div>

            {solicitud.status === "in_progress" &&
              solicitud.job_stage === "working" &&
              solicitud.completion_review_status === "pending" && (
                <div className="mt-8 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-3xl">
                      <p className="text-sm font-black uppercase tracking-wide text-amber-700">
                        {T("Pendiente de tu aprobación")}
                      </p>

                      <h3 className="mt-2 text-xl font-black text-slate-950">
                        {T("Trabajo listo para revisión")}
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {T("Revisa la evidencia final que aparece debajo. Si todo está correcto, aprueba el trabajo. Si existe un problema, utiliza el sistema de reclamos.")}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={aprobarFinalizacionTrabajo}
                      disabled={
                        aprobandoFinalizacion ||
                        Boolean(claim && claim.status !== "resolved")
                      }
                      className="min-h-14 w-full rounded-2xl bg-emerald-600 px-7 py-4 text-lg font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto lg:min-w-[250px]"
                    >
                      {aprobandoFinalizacion
                        ? T("Aprobando trabajo...")
                        : T("✓ Aprobar trabajo")}
                    </button>
                  </div>
                </div>
              )}

            </section>
          </details>
        )}

        {/* RESEÑA */}

        {solicitud.status ===
          "completed" &&
          ofertaSeleccionada && (
            <section
              className={`mt-6 rounded-3xl border border-slate-200 bg-white shadow-xl ${
                review ? "p-5" : "p-8"
              }`}
            >
              {!review && (
                <div className="mb-5 font-extrabold text-slate-900">
                  <span>{T("Calificar profesional")}</span>
                </div>
              )}

              {review ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-extrabold text-slate-900">
                      ✓ {T("Gracias por tu calificación")}
                    </p>
                    <div className="mt-1 text-xl">
                      {[1, 2, 3, 4, 5].map((estrella) => (
                        <span
                          key={estrella}
                          className={
                            estrella <= review.rating
                              ? "text-yellow-500"
                              : "text-slate-300"
                          }
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-500">
                    {T("Ya calificaste este trabajo.")}
                  </p>
                </div>
              ) : (
                <>

                  <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
                    {T("Trabajo completado")}
                  </p>

                  <h2 className="mt-2 text-3xl font-extrabold text-slate-900">
                    {T("Calificar profesional")}
                  </h2>

                  <p className="mt-2 text-slate-600">
                    {T("¿Cómo fue tu experiencia con")}{" "}
                    <strong>
                      {ofertaSeleccionada.profesional
                        ?.business_name ||
                        T("este profesional")}
                    </strong>
                    ?
                  </p>

                  <form
                    onSubmit={
                      enviarResena
                    }
                    className="mt-7"
                  >

                    <p className="font-bold text-slate-900">
                      {T("Tu calificación *")}
                    </p>

                    <div className="mt-3 flex gap-2">

                      {[1, 2, 3, 4, 5].map(
                        (
                          estrella
                        ) => (
                          <button
                            key={
                              estrella
                            }
                            type="button"
                            onClick={() =>
                              setRating(
                                estrella
                              )
                            }
                            className={`text-5xl transition hover:scale-110 ${
                              estrella <=
                              rating
                                ? "text-yellow-400"
                                : "text-slate-300"
                            }`}
                          >
                            ★
                          </button>
                        )
                      )}

                    </div>

                    <p className="mt-2 text-sm text-slate-500">
                      {rating === 0
                        ? T("Selecciona de 1 a 5 estrellas.")
                        : language === "en"
                        ? `You selected ${rating} ${
                            rating === 1
                              ? "star"
                              : "stars"
                          }.`
                        : `Has seleccionado ${rating} ${
                            rating === 1
                              ? "estrella"
                              : "estrellas"
                          }.`}
                    </p>

                    <div className="mt-7">

                      <label className="mb-2 block font-bold text-slate-900">
                        {T("Comentario")}
                      </label>

                      <textarea
                        value={
                          comentario
                        }
                        onChange={(e) =>
                          setComentario(
                            e.target.value
                          )
                        }
                        rows={5}
                        maxLength={
                          1000
                        }
                        placeholder={T("Cuéntanos cómo fue el servicio...")}
                        className="w-full resize-none rounded-xl border border-slate-300 p-4 text-slate-900"
                      />

                      <p className="mt-2 text-right text-sm text-slate-500">
                        {comentario.length}
                        /1000
                      </p>

                    </div>

                    <button
                      type="submit"
                      disabled={
                        enviandoReview ||
                        rating === 0
                      }
                      className="mt-6 w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {enviandoReview
                        ? T("Enviando calificación...")
                        : T("Enviar reseña")}
                    </button>

                  </form>

                </>
              )}

            </section>
          )}

        {mensaje && (
          <div className="mt-6 rounded-2xl border border-green-300 bg-green-50 p-5 font-bold text-green-800">
            ✅ {mensaje}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-5 font-medium text-red-700">
            {error}
          </div>
        )}

        {/* CANCELACIÓN */}

        {solicitud.status ===
        "cancelled" ? (
          <section className="mt-6 rounded-3xl border-2 border-red-300 bg-red-50 p-7 shadow-sm">
            <div className="mb-5 font-extrabold text-slate-900">
              <span>{T("Solicitud cancelada")}</span>
            </div>

            <div className="flex items-start gap-4">

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-600 text-2xl text-white">
                ✕
              </div>

              <div className="flex-1">

                <p className="text-sm font-extrabold uppercase tracking-wide text-red-700">
                  {canceladoPorRelydo
                    ? T("Resolución de RELYDO")
                    : T("Solicitud cancelada")}
                </p>

                <h2 className="mt-2 text-2xl font-extrabold text-red-900">
                  {canceladoPorRelydo
                    ? "Trabajo cancelado por resolución de RELYDO"
                    : T("Este trabajo fue cancelado")}
                </h2>

                <p className="mt-2 text-red-800">
                  {canceladoPorRelydo
                    ? T("RELYDO cerró este trabajo después de resolver el reclamo. El servicio ya no continuará.")
                    : T("Esta solicitud ya no está activa.")}
                </p>

                {solicitud.cancellation_reason && (
                  <div className="mt-5 rounded-2xl bg-white p-5">

                    <p className="text-sm font-bold text-slate-500">
                      {canceladoPorRelydo
                        ? T("Decisión")
                        : T("Motivo")}
                    </p>

                    <p className="mt-2 font-semibold text-slate-800">
                      {T(solicitud.cancellation_reason)}
                    </p>

                  </div>
                )}

                {canceladoPorRelydo &&
                  reclamoResuelto && (
                    <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
                      <p className="text-sm font-black uppercase tracking-wide text-blue-700">
                        {T("Resultado financiero")}
                      </p>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-white p-4">
                          <p className="text-sm font-bold text-slate-500">
                            {T("Reembolso al cliente")}
                          </p>
                          <p className="mt-1 text-2xl font-black text-blue-800">
                            ${reembolsoReclamo.toFixed(2)}
                          </p>
                        </div>

                        <div className="rounded-xl bg-white p-4">
                          <p className="text-sm font-bold text-slate-500">
                            {T("Compensación al profesional")}
                          </p>
                          <p className="mt-1 text-2xl font-black text-slate-900">
                            ${compensacionProfesionalReclamo.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {claim?.resolution_notes && (
                        <div className="mt-4 rounded-xl bg-white p-4">
                          <p className="text-sm font-bold text-slate-500">
                            {T("Nota de resolución")}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap font-semibold leading-6 text-slate-800">
                            {claim.resolution_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

              </div>

            </div>

          </section>
        ) : solicitud.status === "in_progress" &&
            solicitud.job_stage === "working" ? (
          <section className="mt-6 rounded-3xl border border-amber-300 bg-amber-50 p-7 shadow-sm">
            <p className="text-sm font-black uppercase tracking-wide text-amber-700">
              {T("Trabajo iniciado")}
            </p>
            <h2 className="mt-2 text-xl font-black text-amber-950">
              {T("La cancelación automática ya no está disponible")}
            </h2>
            <p className="mt-2 leading-7 text-amber-900">
              {T("El profesional ya comenzó el servicio. Si existe un problema con el trabajo, deberá gestionarse mediante el sistema de reclamos de RELYDO.")}
            </p>

            <button
              type="button"
              onClick={() => {
                setMostrarReclamo(true);
                setError("");
                setMensaje("");

                window.setTimeout(() => {
                  const reclamos =
                    document.getElementById(
                      "reclamos-cliente"
                    );

                  if (reclamos) {
                    reclamos.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }
                }, 50);
              }}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-5 py-3.5 font-black text-white transition hover:bg-amber-700 sm:w-auto"
            >
              {T("⚠️ Iniciar reclamo")}
            </button>
          </section>
        ) : null}


        {fotosSolicitud.length > 0 && !(
          (solicitud.status === "completed" ||
            (solicitud.status === "in_progress" &&
              solicitud.completion_review_status === "pending")) &&
          evidenciasFinales.length > 0
        ) && (
          <details
            open
            className="group mt-6"
          >
            <summary className="cursor-pointer list-none rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-extrabold text-slate-950">
                    {T("📷 Fotos de la solicitud")}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {T("Fotos que adjuntaste al crear esta solicitud.")}
                  </p>
                </div>
                <span className="text-xl text-slate-500 transition group-open:rotate-90">›</span>
              </div>
            </summary>
            <section className="mt-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-extrabold text-slate-900">
              {T("📷 Fotos de la solicitud")}
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              {T("Fotos que adjuntaste al crear esta solicitud.")}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {fotosSolicitud.map(
                (foto, index) =>
                  foto.signed_url ? (
                    <button
                      key={foto.id}
                      type="button"
                      onClick={() => abrirVisorFoto(`request-${foto.id}`)}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left cursor-zoom-in"
                      aria-label={`${T("Foto de la solicitud")} ${index + 1}`}
                    >
                      <img
                        src={foto.signed_url}
                        alt={`${T("Foto de la solicitud")} ${index + 1}`}
                        className="aspect-square h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    </button>
                  ) : null
              )}
            </div>
          </section>
          </details>
        )}


        {/* CAMBIO DE PRESUPUESTO */}

        {changeOrderPendiente && (
          <section className="mt-6 overflow-hidden rounded-3xl border-2 border-violet-300 bg-white shadow-xl">
            <div className="mb-5 font-extrabold text-slate-900">
              <span>{T("💰 Cambio de presupuesto solicitado")}</span>
            </div>
            <div className="bg-violet-700 px-7 py-5 text-white">
              <p className="text-sm font-black uppercase tracking-wide text-violet-100">
                {T("💰 Cambio de presupuesto solicitado")}
              </p>

              <h2 className="mt-2 text-2xl font-black">
                {T("El profesional solicita un monto adicional")}
              </h2>

              <p className="mt-2 max-w-3xl text-violet-100">
                {T("Revisa el motivo y los nuevos montos antes de aceptar o rechazar.")}
              </p>
            </div>

            <div className="p-7">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-5">
                  <p className="text-sm font-bold text-slate-500">
                    {T("Total anterior")}
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-950">
                    ${Number(
                      changeOrderPendiente.original_amount
                    ).toFixed(2)}
                  </p>
                </div>

                <div className="rounded-2xl bg-violet-50 p-5">
                  <p className="text-sm font-bold text-violet-700">
                    {T("Adicional solicitado")}
                  </p>
                  <p className="mt-1 text-2xl font-black text-violet-700">
                    +${Number(
                      changeOrderPendiente.additional_amount
                    ).toFixed(2)}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-950 p-5 text-white">
                  <p className="text-sm font-bold text-slate-300">
                    {T("Nuevo total propuesto")}
                  </p>
                  <p className="mt-1 text-2xl font-black">
                    ${Number(
                      changeOrderPendiente.new_total_amount
                    ).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-black uppercase tracking-wide text-slate-500">
                  {T("Motivo")}
                </p>

                <p className="mt-2 font-black text-slate-950">
                  {changeOrderPendiente.reason === "problema_mayor"
                    ? T("El problema es mayor de lo esperado")
                    : changeOrderPendiente.reason === "trabajo_adicional"
                    ? T("Se necesita trabajo adicional")
                    : changeOrderPendiente.reason === "materiales_adicionales"
                    ? T("Se necesitan materiales adicionales")
                    : changeOrderPendiente.reason === "otro"
                    ? T("Otro motivo")
                    : changeOrderPendiente.reason}
                </p>

                {changeOrderPendiente.description && (
                  <>
                    <div className="my-4 border-t border-slate-200" />

                    <p className="text-sm font-black uppercase tracking-wide text-slate-500">
                      {T("Explicación del profesional")}
                    </p>

                    <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">
                      {changeOrderPendiente.description}
                    </p>
                  </>
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold leading-6 text-amber-900">
                  {language === "en"
                    ? `By accepting, RELYDO will send you to Stripe secure checkout to pay the additional $${Number(
                        changeOrderPendiente.additional_amount
                      ).toFixed(2)} plus the applicable service fee.`
                    : `Al aceptar, RELYDO te enviará al checkout seguro de Stripe para pagar los $${Number(
                        changeOrderPendiente.additional_amount
                      ).toFixed(2)} adicionales más la tarifa de servicio correspondiente.`}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={
                    respondiendoChangeOrderId !==
                    null ||
                    pagandoChangeOrderId !==
                    null
                  }
                  onClick={() =>
                    responderCambioPresupuesto(
                      changeOrderPendiente,
                      "rejected"
                    )
                  }
                  className="rounded-xl border-2 border-red-600 bg-white px-5 py-3.5 font-black text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {respondiendoChangeOrderId ===
                  changeOrderPendiente.id
                    ? T("Procesando...")
                    : T("✕ Rechazar cambio")}
                </button>

                <button
                  type="button"
                  disabled={
                    respondiendoChangeOrderId !==
                    null ||
                    pagandoChangeOrderId !==
                    null
                  }
                  onClick={() =>
                    responderCambioPresupuesto(
                      changeOrderPendiente,
                      "accepted"
                    )
                  }
                  className="rounded-xl bg-violet-700 px-5 py-3.5 font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {respondiendoChangeOrderId ===
                  changeOrderPendiente.id
                    ? T("Procesando...")
                    : language === "en"
                    ? `✓ Accept +$${Number(
                        changeOrderPendiente.additional_amount
                      ).toFixed(2)}`
                    : `✓ Aceptar +$${Number(
                        changeOrderPendiente.additional_amount
                      ).toFixed(2)}`}
                </button>
              </div>
            </div>
          </section>
        )}

        {!changeOrderPendiente &&
          ultimoChangeOrder &&
          ultimoChangeOrder.status !==
            "pending" && (
          <details className="group mt-6">
            <summary
              className={`cursor-pointer list-none rounded-2xl border-2 px-5 py-4 shadow-sm ${
                ultimoChangeOrder.status === "rejected"
                  ? "border-red-300 bg-red-50"
                  : "border-blue-300 bg-blue-50"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p
                    className={`text-xs font-black uppercase tracking-wide ${
                      ultimoChangeOrder.status === "rejected"
                        ? "text-red-700"
                        : "text-blue-700"
                    }`}
                  >
                    {T("Cambio de presupuesto")}
                  </p>
                  <p className="mt-1 font-extrabold text-slate-950">
                    {ultimoChangeOrder.status === "accepted" &&
                    ultimoChangeOrder.payment_status === "paid"
                      ? T("✓ Cambio pagado")
                      : ultimoChangeOrder.status === "accepted"
                      ? T("✓ Cambio de presupuesto aceptado")
                      : ultimoChangeOrder.status === "rejected"
                      ? T("✕ Cambio de presupuesto rechazado")
                      : T("Cambio de presupuesto cancelado")}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden text-right sm:block">
                    <p className="text-xs font-bold text-slate-500">
                      {T("Nuevo total propuesto")}
                    </p>
                    <p className="font-black text-slate-950">
                      ${Number(
                        ultimoChangeOrder.new_total_amount
                      ).toFixed(2)}
                    </p>
                  </div>
                  <span className="text-xl text-slate-500 transition group-open:rotate-90">
                    ›
                  </span>
                </div>
              </div>
            </summary>

            <section
              className={`mt-2 rounded-3xl border-2 p-6 shadow-sm ${
                ultimoChangeOrder.status === "rejected"
                  ? "border-red-300 bg-red-50"
                  : "border-blue-300 bg-blue-50"
              }`}
            >
              <div className="mb-5 font-extrabold text-slate-900">
                <span>{T("Cambio de presupuesto")}</span>
              </div>

              <p
                className={`text-sm font-black uppercase tracking-wide ${
                  ultimoChangeOrder.status === "rejected"
                    ? "text-red-700"
                    : "text-blue-700"
                }`}
              >
                {ultimoChangeOrder.status ===
                "accepted"
                  ? T("✓ Cambio de presupuesto aceptado")
                  : ultimoChangeOrder.status ===
                    "rejected"
                  ? T("✕ Cambio de presupuesto rechazado")
                  : T("Cambio de presupuesto cancelado")}
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm text-slate-600">
                    {T("Adicional solicitado")}
                  </p>
                  <p className="text-xl font-black text-slate-950">
                    ${Number(
                      ultimoChangeOrder.additional_amount
                    ).toFixed(2)}
                  </p>
                </div>

                <div className="sm:text-right">
                  <p className="text-sm text-slate-600">
                    {T("Nuevo total propuesto")}
                  </p>
                  <p className="text-xl font-black text-slate-950">
                    ${Number(
                      ultimoChangeOrder.new_total_amount
                    ).toFixed(2)}
                  </p>
                </div>
              </div>

              {ultimoChangeOrder.status ===
                "accepted" &&
                ultimoChangeOrder.payment_status ===
                  "paid" && (
                  <div className="mt-4 rounded-2xl border border-blue-200 bg-white/80 p-4">
                    <p className="font-black text-blue-800">
                      {T("✓ Cambio pagado")}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-6 text-blue-800">
                      {language === "en"
                        ? `Stripe confirmed the additional payment of $${Number(
                            ultimoChangeOrder.additional_customer_total_amount ||
                              0
                          ).toFixed(2)}. This amount is already included in the job total summary.`
                        : `Stripe confirmó el pago adicional de $${Number(
                            ultimoChangeOrder.additional_customer_total_amount ||
                              0
                          ).toFixed(2)}. Este monto ya está incluido en el resumen total del trabajo.`}
                    </p>
                  </div>
                )}

              {ultimoChangeOrder.status ===
                "accepted" &&
                ultimoChangeOrder.payment_status !==
                  "paid" && (
                <div className="mt-4">
                  <p className="text-sm font-bold leading-6 text-blue-800">
                    {T("Tu aprobación quedó registrada. Para completar el cambio, paga ahora el monto adicional mediante Stripe.")}
                  </p>

                  <button
                    type="button"
                    disabled={
                      pagandoChangeOrderId !==
                        null ||
                      verificandoPagoChangeOrder
                    }
                    onClick={() =>
                      pagarCambioPresupuesto(
                        ultimoChangeOrder
                      )
                    }
                    className="mt-4 w-full rounded-xl bg-blue-700 px-5 py-3.5 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {pagandoChangeOrderId ===
                    ultimoChangeOrder.id
                      ? T("Abriendo pago seguro...")
                      : `💳 Pagar adicional · $${redondearDinero(
                          Number(
                            ultimoChangeOrder.additional_amount
                          ) +
                            Number(
                              ultimoChangeOrder.additional_amount
                            ) *
                              (Number(
                                paymentSettings?.customer_service_fee_percent ||
                                  0
                              ) /
                                100)
                        ).toFixed(2)}`}
                  </button>
                </div>
              )}

              {ultimoChangeOrder.status ===
                "rejected" && (
                <p className="mt-4 text-sm font-bold leading-6 text-red-800">
                  {T("El cambio fue rechazado. El presupuesto anterior permanece sin cambios.")}
                </p>
              )}
            </section>
          </details>
        )}

        {/* CANCELACIÓN DISPONIBLE — DEBAJO DEL CHANGE ORDER */}

        {puedeCancelar &&
          !(
            ultimoChangeOrder?.status === "accepted" &&
            ultimoChangeOrder.payment_status === "paid"
          ) && (
          <section id="reclamos" className="mt-6 rounded-3xl border border-red-200 bg-white p-7 shadow-sm">
            <div className="mb-5 font-extrabold text-slate-900">
              <span>{T("¿Ya no necesitas el servicio?")}</span>
            </div>

            {!mostrarCancelacion ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <h2 className="text-xl font-extrabold text-slate-900">
                    {T("Puedes cancelar esta solicitud")}
                  </h2>

                  <p className="mt-2 text-sm text-slate-600">
                    {T("La cancelación dejará de estar disponible cuando el profesional haya iniciado el trabajo.")}
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMostrarCancelacion(
                      true
                    );
                    setError("");
                    setMensaje("");
                  }}
                  className="shrink-0 rounded-xl border-2 border-red-600 bg-white px-5 py-3 font-extrabold text-red-700 hover:bg-red-50"
                >
                  {T("Cancelar solicitud")}
                </button>

              </div>
            ) : (
              <div>

                <div className="flex items-start justify-between gap-4">

                  <div>
                    <p className="text-sm font-extrabold uppercase tracking-wide text-red-700">
                      {T("Cancelar solicitud")}
                    </p>

                    <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                      {T("¿Por qué deseas cancelar?")}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMostrarCancelacion(
                        false
                      );
                      setMotivoCancelacion(
                        ""
                      );
                    }}
                    className="rounded-lg px-3 py-2 font-bold text-slate-500 hover:bg-slate-100"
                  >
                    ✕
                  </button>

                </div>

                <select
                  value={
                    motivoCancelacion
                  }
                  onChange={(e) =>
                    setMotivoCancelacion(
                      e.target.value
                    )
                  }
                  className="mt-5 w-full rounded-xl border border-slate-300 bg-white p-4 font-semibold text-slate-900"
                >
                  <option value="">
                    {T("Selecciona un motivo")}
                  </option>

                  <option value="Ya no necesito el servicio">
                    {T("Ya no necesito el servicio")}
                  </option>

                  <option value="Encontré otra solución">
                    {T("Encontré otra solución")}
                  </option>

                  <option value="Cambió mi horario">
                    {T("Cambió mi horario")}
                  </option>

                  <option value="El precio no me conviene">
                    {T("El precio no me conviene")}
                  </option>

                  <option value="Otro motivo">
                    {T("Otro motivo")}
                  </option>
                </select>

                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
                  <p className="text-sm font-black uppercase tracking-wide text-red-700">
                    {T("Resumen de la cancelación")}
                  </p>

                  {solicitud.status === "open" ? (
                    <div className="mt-3 rounded-xl bg-white p-4">
                      <p className="font-extrabold text-emerald-700">
                        {T("Cancelación sin penalidad")}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {T("Esta solicitud todavía no tiene un trabajo pagado en progreso.")}
                      </p>
                    </div>
                  ) : payment ? (
                    <div className="mt-4 space-y-3 rounded-xl bg-white p-4">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-600">{T("Total pagado")}</span>
                        <strong className="text-slate-900">
                          ${resumenCancelacion.totalPagado.toFixed(2)}
                        </strong>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-600">
                          {T("Tarifa de servicio RELYDO")}
                        </span>
                        <strong className="text-slate-900">
                          ${resumenCancelacion.serviceFee.toFixed(2)}
                        </strong>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-600">
                          {T("Penalidad")}
                        </span>
                        <strong className="text-red-700">
                          -${resumenCancelacion.penalidad.toFixed(2)}
                        </strong>
                      </div>

                      <div className="border-t border-slate-200 pt-3">
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-black text-slate-900">
                            {T("Reembolso al cliente")}
                          </span>
                          <strong className="text-xl text-emerald-700">
                            ${resumenCancelacion.reembolso.toFixed(2)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                      {T("No encontramos el pago de este trabajo. Actualiza la página antes de cancelar.")}
                    </div>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">

                  <button
                    type="button"
                    onClick={() => {
                      setMostrarCancelacion(
                        false
                      );
                      setMotivoCancelacion(
                        ""
                      );
                    }}
                    disabled={
                      cancelando
                    }
                    className="rounded-xl border-2 border-slate-300 bg-white px-5 py-3 font-extrabold text-slate-700 disabled:opacity-50"
                  >
                    {T("Volver")}
                  </button>

                  <button
                    type="button"
                    onClick={
                      cancelarSolicitud
                    }
                    disabled={
                      cancelando ||
                      !motivoCancelacion
                    }
                    className="rounded-xl bg-red-600 px-5 py-3 font-extrabold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelando
                      ? T("Cancelando solicitud...")
                      : T("Confirmar cancelación")}
                  </button>

                </div>

              </div>
            )}

          </section>
        )}

        {/* PROFESIONAL CONTRATADO */}

        {ofertaSeleccionada && (
          <details
            key={
              panelesCerrados || ultimoChangeOrder
                ? "profesional-cerrado"
                : "profesional-abierto"
            }
            open={!panelesCerrados && !ultimoChangeOrder}
            className="group mt-6"
          >
            <summary className="cursor-pointer list-none rounded-2xl border-2 border-green-300 bg-green-50 px-5 py-4 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-green-700">
                    {T("✓ Profesional contratado")}
                  </p>
                  <p className="mt-1 font-extrabold text-slate-950">
                    {ofertaSeleccionada.profesional?.business_name || T("Profesional RELYDO")}
                  </p>
                </div>
                <span className="text-xl text-slate-500 transition group-open:rotate-90">›</span>
              </div>
            </summary>
            <section className="mt-2 rounded-3xl border-2 border-green-300 bg-green-50 p-7">
            <div className="mb-5 font-extrabold text-slate-900">
              <span>{T("✓ Profesional contratado")}</span>
            </div>

            <p className="text-sm font-extrabold uppercase tracking-wide text-green-700">
              {T("✓ Profesional contratado")}
            </p>

            <h2 className="mt-2 text-2xl font-extrabold text-green-900">
              {ofertaSeleccionada.profesional
                ?.business_name ||
                T("Profesional RELYDO")}
            </h2>

            <p className="mt-2 text-green-800">
              {T("Has seleccionado este presupuesto por")}{" "}
              <strong>
                $
                {Number(
                  ofertaSeleccionada.price
                ).toFixed(
                  2
                )}
              </strong>
              .
            </p>

            {payment && (
              <div className="mt-5 rounded-2xl border border-green-200 bg-white p-5">
                <p className="text-sm font-extrabold uppercase tracking-wide text-green-700">{T("Resumen de pago")}</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-600">{T("Presupuesto del profesional")}</span>
                    <strong className="text-slate-900">${presupuestoTotalPagado.toFixed(2)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-600">{T("Tarifa de servicio RELYDO")}</span>
                    <strong className="text-slate-900">${tarifaClienteTotalPagada.toFixed(2)}</strong>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-extrabold text-slate-900">{T("Total del cliente")}</span>
                      <strong className="text-xl text-green-800">${totalClientePagado.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

                {changeOrdersPagados.length > 0 && (
                  <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-800">
                    {language === "en"
                      ? `This summary includes ${changeOrdersPagados.length} paid budget change${changeOrdersPagados.length === 1 ? "" : "s"} for an additional total of $${totalesAdicionalesPagados.toFixed(2)}.`
                      : `Este resumen incluye ${changeOrdersPagados.length} cambio${changeOrdersPagados.length === 1 ? "" : "s"} de presupuesto pagado${changeOrdersPagados.length === 1 ? "" : "s"} por un total adicional de $${totalesAdicionalesPagados.toFixed(2)}.`}
                  </div>
                )}

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-bold text-slate-600">
                      {T("Estado del pago")}
                    </span>

                    <span
                      className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-black ${
                        payment.status === "refunded"
                          ? "bg-emerald-100 text-emerald-800"
                          : payment.status === "partially_refunded"
                          ? "bg-violet-100 text-violet-800"
                          : payment.status === "paid_out"
                          ? "bg-blue-100 text-blue-800"
                          : payment.status === "ready_for_payout"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {T("Pagado")}
                    </span>
                  </div>

                  {Number(payment.refunded_amount || 0) > 0 && (
                    <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-emerald-50 px-4 py-3">
                      <span className="font-bold text-emerald-800">
                        {T("Reembolso al cliente")}
                      </span>
                      <strong className="text-lg text-emerald-800">
                        ${Number(payment.refunded_amount || 0).toFixed(2)}
                      </strong>
                    </div>
                  )}

                  {payment.status === "paid_out" && (
                    <p className="mt-3 text-xs leading-5 text-blue-700">
                      {T("El pago fue procesado y liberado de acuerdo con el flujo de RELYDO.")}
                    </p>
                  )}

                  {payment.status === "refunded" && (
                    <p className="mt-3 text-xs leading-5 text-emerald-700">
                      {T("RELYDO procesó el reembolso correspondiente a este trabajo.")}
                    </p>
                  )}

                  {payment.status === "partially_refunded" && (
                    <p className="mt-3 text-xs leading-5 text-violet-700">
                      {T("RELYDO procesó un reembolso parcial para este trabajo.")}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">

              <div className="rounded-xl bg-white p-4">
                <p className="text-sm text-green-700">
                  {T("Llegada estimada")}
                </p>

                <p className="mt-1 font-extrabold text-green-900">
                  {mostrarMinutos(
                    ofertaSeleccionada.arrival_minutes
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white p-4">
                <p className="text-sm text-green-700">
                  {T("Duración estimada")}
                </p>

                <p className="mt-1 font-extrabold text-green-900">
                  {mostrarMinutos(
                    ofertaSeleccionada.estimated_job_minutes
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white p-4">
                <p className="text-sm text-green-700">
                  {T("Valoración")}
                </p>

                <p className="mt-1 font-extrabold text-green-900">
                  ⭐{" "}
                  {Number(
                    ofertaSeleccionada.profesional
                      ?.average_rating ||
                      0
                  ).toFixed(
                    1
                  )}
                </p>
              </div>

            </div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  `/profesionales/${ofertaSeleccionada.professional_id}?returnTo=${encodeURIComponent(
                    `/mis-solicitudes/${solicitud.id}`
                  )}`
                )
              }
              className="mt-5 rounded-xl border-2 border-green-700 px-5 py-3 font-extrabold text-green-800 hover:bg-green-100"
            >
              {T("Ver perfil del profesional")}
            </button>

            {solicitud.status ===
              "completed" && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/solicitar-trabajo?profesional=${ofertaSeleccionada.professional_id}`
                    )
                  }
                  className="ml-0 mt-3 rounded-xl bg-green-700 px-5 py-3 font-extrabold text-white hover:bg-green-800 sm:ml-3"
                >
                  {T("🔁 Contratar de nuevo")}
                </button>
              )}

            </section>
          </details>
        )}

        {/* FOTOS DE LA SOLICITUD + EVIDENCIA FINAL DEL PROFESIONAL */}

        {(
          solicitud.status === "completed" ||
          (
            solicitud.status === "in_progress" &&
            solicitud.completion_review_status === "pending"
          )
        ) &&
          evidenciasFinales.length > 0 && (
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {fotosSolicitud.length > 0 && (
                <details
                  key={trabajoFinalizadoConReview ? "fotos-solicitud-cerradas" : "fotos-solicitud-abiertas"}
                  open={!panelesCerrados}
                  className="group"
                >
                  <summary className="cursor-pointer list-none rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-extrabold text-slate-950">
                          {T("📷 Fotos de la solicitud")}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {T("Fotos que adjuntaste al crear esta solicitud.")}
                        </p>
                      </div>
                      <span className="text-xl text-slate-500 transition group-open:rotate-90">›</span>
                    </div>
                  </summary>

                  <section className="mt-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                      {fotosSolicitud.map(
                        (foto, index) =>
                          foto.signed_url ? (
                            <button
                              key={foto.id}
                              type="button"
                              onClick={() => abrirVisorFoto(`request-${foto.id}`)}
                              className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left cursor-zoom-in"
                              aria-label={`${T("Foto de la solicitud")} ${index + 1}`}
                            >
                              <img
                                src={foto.signed_url}
                                alt={`${T("Foto de la solicitud")} ${index + 1}`}
                                className="aspect-square h-full w-full object-cover transition group-hover:scale-[1.02]"
                              />
                            </button>
                          ) : null
                      )}
                    </div>
                  </section>
                </details>
              )}

              <details
                key={trabajoFinalizadoConReview ? "evidencia-final-cerrada" : "evidencia-final-abierta"}
                open={!panelesCerrados}
                className="group"
              >
                <summary className="cursor-pointer list-none rounded-2xl border border-blue-100 bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-extrabold text-slate-950">
                        {T("📸 Evidencia del trabajo terminado")}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {T("Fotos y videos registrados por el profesional")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="hidden rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 sm:inline-block">
                        {
                          evidenciasFinales.filter(
                            (item) => item.file_type === "image"
                          ).length
                        }{" "}
                        foto(s) ·{" "}
                        {
                          evidenciasFinales.filter(
                            (item) => item.file_type === "video"
                          ).length
                        }{" "}
                        video(s)
                      </span>
                      <span className="text-xl text-slate-500 transition group-open:rotate-90">›</span>
                    </div>
                  </div>
                </summary>

                <section className="mt-2 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-black uppercase tracking-wide text-blue-700">
                        {T("📸 Evidencia del trabajo terminado")}
                      </p>

                      <h2 className="mt-2 text-2xl font-black text-slate-950">
                        {T("Fotos y videos registrados por el profesional")}
                      </h2>

                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {T("Esta evidencia fue registrada por el profesional al finalizar el servicio y queda asociada a este trabajo para tu protección y la del profesional.")}
                      </p>
                    </div>

                    <div className="w-fit shrink-0 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">
                      {
                        evidenciasFinales.filter(
                          (item) => item.file_type === "image"
                        ).length
                      }{" "}
                      foto(s) ·{" "}
                      {
                        evidenciasFinales.filter(
                          (item) => item.file_type === "video"
                        ).length
                      }{" "}
                      video(s)
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {evidenciasFinales.map(
                      (item) => (
                        <article
                          key={item.id}
                          className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                        >
                          {item.signed_url ? (
                            item.file_type === "video" ? (
                              <video
                                src={item.signed_url}
                                controls
                                preload="metadata"
                                className="aspect-video w-full bg-black object-contain"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => abrirVisorFoto(`evidence-${item.id}`)}
                                className="block w-full cursor-zoom-in"
                                aria-label={T("Evidencia del trabajo terminado")}
                              >
                                <img
                                  src={item.signed_url}
                                  alt={T("Evidencia del trabajo terminado")}
                                  className="aspect-video w-full bg-slate-100 object-cover transition hover:opacity-95"
                                />
                              </button>
                            )
                          ) : (
                            <div className="flex aspect-video items-center justify-center bg-slate-100 px-5 text-center text-sm font-bold text-slate-500">
                              {T("No pudimos abrir este archivo de evidencia.")}
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-3 bg-white px-4 py-3">
                            <span className="text-sm font-black text-slate-800">
                              {item.file_type === "video"
                                ? T("🎥 Video")
                                : T("📷 Foto")}
                            </span>

                            <span className="text-xs font-semibold text-slate-500">
                              {T("Registrado")}
                            </span>
                          </div>
                        </article>
                      )
                    )}
                  </div>

                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4">
                    <p className="text-sm font-bold leading-6 text-blue-900">
                      {T("🔒 Esta evidencia forma parte del registro del trabajo y no puede ser modificada desde esta pantalla.")}
                    </p>
                  </div>
                </section>
              </details>
            </div>
          )}

        {/* RECLAMO / REPORTAR PROBLEMA */}

        {(
          (solicitud.status === "completed" && Boolean(claim)) ||
          solicitud.status === "cancelled" ||
          (
            solicitud.status === "in_progress" &&
            solicitud.job_stage === "working" &&
            (Boolean(claim) || mostrarReclamo)
          )
        ) &&
          ofertaSeleccionada && (
          <details
            open={!claim}
            className="group mt-8 scroll-mt-6"
          >
            <summary className="cursor-pointer list-none rounded-2xl border border-red-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-red-700">
                    {claim ? T("⚠️ Problema reportado") : T("Reportar un problema")}
                  </p>
                  <p className="mt-1 font-extrabold text-slate-950">
                    {claim ? T("Tu reclamo quedó registrado") : T("¿Hubo un problema con el servicio?")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {claim && (
                    <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black uppercase text-amber-800">
                      {claim.status === "open"
                        ? (language === "en" ? "Open" : "Abierto")
                        : claim.status === "reviewing"
                        ? T("En revisión")
                        : claim.status === "resolved"
                        ? (language === "en" ? "Resolved" : "Resuelto")
                        : (language === "en" ? "Rejected" : "Rechazado")}
                    </span>
                  )}
                  <span className="text-xl text-slate-500 transition group-open:rotate-90">›</span>
                </div>
              </div>
            </summary>
            <section
              id="reclamos-cliente"
              className="mt-2 rounded-3xl border border-red-200 bg-white p-8 shadow-xl"
            >
            <div className="mb-5 font-extrabold text-slate-900">
              <span>{T("¿Hubo un problema con el servicio?")}</span>
            </div>
            {claim ? (
              <>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-wide text-red-700">
                      {T("⚠️ Problema reportado")}
                    </p>
                    <h2 className="mt-2 text-2xl font-extrabold text-slate-900">
                      {T("Tu reclamo quedó registrado")}
                    </h2>
                    <p className="mt-2 text-slate-600">
                      {T("RELYDO conserva este reporte asociado al trabajo.")}
                    </p>
                  </div>

                  <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-black uppercase text-amber-800">
                    {claim.status === "open"
                      ? (language === "en" ? "Open" : "Abierto")
                      : claim.status === "reviewing"
                      ? T("En revisión")
                      : claim.status === "resolved"
                      ? (language === "en" ? "Resolved" : "Resuelto")
                      : (language === "en" ? "Rejected" : "Rechazado")}
                  </span>
                </div>

                <div className="mt-6 rounded-2xl bg-red-50 p-6">
                  <p className="text-sm font-bold text-red-700">{T("Motivo")}</p>
                  <p className="mt-2 font-extrabold text-slate-900">
                    {T(claim.reason)}
                  </p>

                  {claim.description && (
                    <>
                      <p className="mt-5 text-sm font-bold text-red-700">
                        {T("Descripción")}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">
                        {claim.description}
                      </p>
                    </>
                  )}
                </div>

                {claim.status === "resolved" && (
                  <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-6">
                    <p className="text-sm font-black uppercase tracking-wide text-green-700">
                      {T("✅ Reclamo resuelto")}
                    </p>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white p-4">
                        <p className="text-sm font-bold text-slate-500">
                          {T("Reembolso al cliente")}
                        </p>
                        <p className="mt-1 text-xl font-black text-green-800">
                          ${Number(
                            claim.customer_refund_amount || 0
                          ).toFixed(2)}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white p-4">
                        <p className="text-sm font-bold text-slate-500">
                          {T("Compensación al profesional")}
                        </p>
                        <p className="mt-1 text-xl font-black text-slate-900">
                          ${Number(
                            claim.provider_award_amount || 0
                          ).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {claim.resolution_notes && (
                      <div className="mt-4 rounded-xl bg-white p-4">
                        <p className="text-sm font-bold text-slate-500">
                          {T("Resolución de RELYDO")}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">
                          {claim.resolution_notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : solicitud.status === "cancelled" ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <p className="font-extrabold text-slate-900">
                  {T("Este trabajo está cerrado.")}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {T("No se pueden abrir nuevos reclamos después de que el trabajo ha sido cancelado.")}
                </p>
              </div>
            ) : (
              <form onSubmit={enviarReclamo} className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-wide text-red-700">
                      {T("Abrir reclamo")}
                    </p>
                    <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
                      {T("Cuéntanos qué ocurrió")}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMostrarReclamo(false);
                      setMotivoReclamo("");
                      setDescripcionReclamo("");
                      setExplicacionEvidenciaCliente("");
                      setEvidenciasReclamo([]);
                      setError("");
                    }}
                    className="rounded-lg px-3 py-2 font-bold text-slate-500 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>

                <div>
                  <label className="mb-2 block font-bold text-slate-900">
                    {T("Motivo del reclamo *")}
                  </label>
                  <select
                    value={motivoReclamo}
                    onChange={(e) => setMotivoReclamo(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-4 font-semibold text-slate-900"
                  >
                    <option value="">Selecciona un motivo</option>
                    <option value="Trabajo incompleto">{T("Trabajo incompleto")}</option>
                    <option value="Calidad del trabajo">{T("Calidad del trabajo")}</option>
                    <option value="Daños durante el servicio">{T("Daños durante el servicio")}</option>
                    <option value="Cobro adicional no acordado">{T("Cobro adicional no acordado")}</option>
                    <option value="Conducta del profesional">{T("Conducta del profesional")}</option>
                    <option value="Otro problema">{T("Otro problema")}</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block font-bold text-slate-900">
                    {T("Explica el problema *")}
                  </label>
                  <textarea
                    value={descripcionReclamo}
                    onChange={(e) => setDescripcionReclamo(e.target.value)}
                    rows={5}
                    maxLength={1500}
                    placeholder={T("Describe qué ocurrió y qué parte del servicio tuvo el problema...")}
                    className="w-full resize-none rounded-xl border border-slate-300 p-4 text-slate-900"
                  />
                  <p className="mt-2 text-right text-sm text-slate-500">
                    {descripcionReclamo.length}/1500
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-extrabold text-slate-900">
                        {T("Fotos o videos")}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {T("Opcional. Puedes adjuntar hasta 10 fotos y 2 videos como evidencia.")}
                      </p>
                    </div>

                    <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border-2 border-blue-700 bg-white px-5 py-3 font-extrabold text-blue-700 transition hover:bg-blue-50">
                      {T("📎 Adjuntar archivos")}
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                        onChange={seleccionarEvidenciaReclamo}
                        disabled={enviandoReclamo}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    <p className="font-bold">
                      {T("Formatos permitidos")}
                    </p>
                    <p className="mt-1">
                      {T("Fotos: JPG, PNG, WEBP · Videos: MP4, WEBM, MOV · Máximo 50 MB por archivo.")}
                    </p>
                  </div>

                  {evidenciasReclamo.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {evidenciasReclamo.map(
                        (file, index) => (
                          <div
                            key={`${file.name}-${file.size}-${index}`}
                            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-900">
                                {file.type.startsWith("video/")
                                  ? "🎥"
                                  : "🖼️"}{" "}
                                {file.name}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={enviandoReclamo}
                              onClick={() =>
                                eliminarEvidenciaReclamo(
                                  index
                                )
                              }
                              className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-extrabold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              {T("Quitar")}
                            </button>
                          </div>
                        )
                      )}

                      <p className="text-right text-sm font-bold text-slate-600">
                        {evidenciasReclamo.filter(
                          (file) =>
                            file.type.startsWith("image/")
                        ).length}{" "}
                        foto(s) ·{" "}
                        {evidenciasReclamo.filter(
                          (file) =>
                            file.type.startsWith("video/")
                        ).length}{" "}
                        video(s)
                      </p>
                    </div>
                  )}
                </div>

                {evidenciasReclamo.length > 0 && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                    <label className="mb-2 block font-extrabold text-slate-900">
                      {T("Explicación de la evidencia *")}
                    </label>

                    <p className="mb-3 text-sm text-slate-600">
                      {T("Describe qué muestran las fotos o videos y qué debe considerar RELYDO al revisar tu reclamo.")}
                    </p>

                    <textarea
                      value={explicacionEvidenciaCliente}
                      onChange={(e) =>
                        setExplicacionEvidenciaCliente(e.target.value)
                      }
                      rows={5}
                      maxLength={1500}
                      disabled={enviandoReclamo}
                      placeholder={T("Ejemplo: Estas fotos muestran la parte del trabajo que quedó incompleta y el daño que encontré después del servicio...")}
                      className="w-full resize-none rounded-xl border border-slate-300 bg-white p-4 text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100"
                    />

                    <p className="mt-2 text-right text-sm text-slate-500">
                      {explicacionEvidenciaCliente.length}/1500
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={enviandoReclamo}
                    onClick={() => {
                      setMostrarReclamo(false);
                      setMotivoReclamo("");
                      setDescripcionReclamo("");
                      setEvidenciasReclamo([]);
                      setError("");
                    }}
                    className="rounded-xl border-2 border-slate-300 bg-white px-5 py-3 font-extrabold text-slate-700 disabled:opacity-50"
                  >
                    {T("Cancelar")}
                  </button>

                  <button
                    type="submit"
                    disabled={
                      enviandoReclamo ||
                      !motivoReclamo ||
                      descripcionReclamo.trim().length < 5 ||
                      (evidenciasReclamo.length > 0 &&
                        explicacionEvidenciaCliente.trim().length < 5)
                    }
                    className="rounded-xl bg-red-600 px-5 py-3 font-extrabold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {enviandoReclamo
                      ? T("Enviando reclamo...")
                      : T("Enviar reclamo")}
                  </button>
                </div>
              </form>
            )}
          </section>
          </details>
        )}

        {/* PRESUPUESTOS */}

        {ofertas.some((oferta) => oferta.status !== "selected") && (
        <details
          open={solicitud.status !== "cancelled"}
          className="group mt-8"
        >
          <summary
            className={solicitud.status === "cancelled"
              ? "cursor-pointer list-none rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
              : "hidden"}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-extrabold text-slate-950">
                  {T("Presupuestos recibidos")}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {T("Compara precio, tiempo de llegada, experiencia y valoración antes de elegir.")}
                </p>
              </div>
              <span className="text-xl text-slate-500 transition group-open:rotate-90">›</span>
            </div>
          </summary>

        <section className={solicitud.status === "cancelled" ? "mt-2" : ""}>
          <div className="mb-5 font-extrabold text-slate-900">
              <span>{T("Presupuestos recibidos")}</span>
            </div>

          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

            <div>

              <h2 className="text-3xl font-extrabold text-slate-900">
                {T("Presupuestos recibidos")}
              </h2>

              <p className="mt-2 text-slate-600">
                {T("Compara precio, tiempo de llegada, experiencia y valoración antes de elegir.")}
              </p>

            </div>

            {solicitud.status ===
              "open" &&
              ofertasPendientes >
                0 && (
                <div className="rounded-full bg-blue-100 px-4 py-2 font-extrabold text-blue-800">
                  {ofertasPendientes}{" "}
                  {ofertasPendientes ===
                  1
                    ? T("presupuesto disponible")
                    : T("presupuestos disponibles")}
                </div>
              )}

          </div>

          {ofertas.length ===
          0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-lg">

              <div className="text-5xl">
                ⏳
              </div>

              <h3 className="mt-4 text-2xl font-extrabold text-slate-900">
                {T("Todavía no tienes presupuestos")}
              </h3>

              <p className="mt-2 text-slate-600">
                {T("Cuando un profesional envíe un presupuesto aparecerá aquí.")}
              </p>

            </div>
          ) : (
            <div className="space-y-5">

              {ofertas.map(
                (
                  oferta
                ) => {
                  const seleccionada =
                    oferta.status ===
                    "selected";

                  const rechazada =
                    oferta.status ===
                    "rejected";

                  return (
                    <article
                      key={
                        oferta.id
                      }
                      className={`rounded-3xl border bg-white p-7 shadow-lg ${
                        seleccionada
                          ? "border-green-400 ring-2 ring-green-100"
                          : rechazada
                          ? "border-slate-200 opacity-70"
                          : "border-slate-200"
                      }`}
                    >

                      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">

                        <div>

                          <div className="flex flex-wrap items-center gap-2">

                            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
                              {T("Profesional")}
                            </p>

                            {seleccionada && (
                              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-extrabold text-green-800">
                                {T("✓ Contratado")}
                              </span>
                            )}

                            {rechazada && (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                                {T("No seleccionada")}
                              </span>
                            )}

                            {oferta.profesional?.verified && (
                              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                                {T("✓ Verificado")}
                              </span>
                            )}

                          </div>

                          <h3 className="mt-2 text-2xl font-extrabold text-slate-900">
                            {oferta.profesional?.business_name ||
                              T("Profesional RELYDO")}
                          </h3>

                          <p className="mt-1 font-semibold text-blue-700">
                            {T(
                              nombreOficio(
                                oferta.profesional?.trade ||
                                  null
                              )
                            )}
                          </p>

                        </div>

                        <div className="rounded-2xl bg-green-50 px-6 py-4 text-center">

                          <p className="text-sm font-bold text-green-700">
                            {T("Presupuesto")}
                          </p>

                          <p className="mt-1 text-3xl font-extrabold text-green-900">
                            $
                            {Number(
                              oferta.price
                            ).toFixed(
                              2
                            )}
                          </p>

                          {paymentSettings && (
                            <>
                              <p className="mt-2 text-xs font-semibold text-green-700">
                                {T("Tarifa de servicio RELYDO")}
                              </p>
                              <p className="mt-1 text-sm font-black text-green-950">
                                Total: ${calcularMontosPago(oferta.price, paymentSettings).customerTotalAmount.toFixed(2)}
                              </p>
                            </>
                          )}

                        </div>

                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">

                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">
                            {T("🚗 Puede llegar")}
                          </p>

                          <p className="mt-1 font-extrabold text-slate-900">
                            {mostrarMinutos(
                              oferta.arrival_minutes,
                              language
                            )}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">
                            {T("⏱️ Duración")}
                          </p>

                          <p className="mt-1 font-extrabold text-slate-900">
                            {mostrarMinutos(
                              oferta.estimated_job_minutes,
                              language
                            )}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">
                            {T("⭐ Valoración")}
                          </p>

                          <p className="mt-1 font-extrabold text-slate-900">
                            {Number(
                              oferta.profesional?.average_rating ||
                                0
                            ).toFixed(
                              1
                            )}
                          </p>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">
                            {T("🛠️ Experiencia")}
                          </p>

                          <p className="mt-1 font-extrabold text-slate-900">
                            {oferta.profesional?.years_experience ??
                              0}{" "}
                            {language === "en"
                              ? (oferta.profesional?.years_experience ?? 0) === 1
                                ? "year"
                                : "years"
                              : (oferta.profesional?.years_experience ?? 0) === 1
                              ? "año"
                              : "años"}
                          </p>
                        </div>

                      </div>

                      <div className="mt-4 rounded-xl bg-slate-50 p-4">

                        <p className="text-sm text-slate-500">
                          {T("Trabajos completados en RELYDO")}
                        </p>

                        <p className="mt-1 font-extrabold text-slate-900">
                          {oferta.profesional?.completed_jobs ??
                            0}
                        </p>

                      </div>

                      <div className="mt-5 rounded-2xl border border-slate-200 p-5">

                        <p className="text-sm font-bold text-slate-500">
                          {T("Mensaje del profesional")}
                        </p>

                        <p className="mt-2 leading-7 text-slate-700">
                          {oferta.message ||
                            T("Sin mensaje adicional.")}
                        </p>

                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/profesionales/${oferta.professional_id}?returnTo=${encodeURIComponent(
                              `/mis-solicitudes/${solicitud.id}`
                            )}`
                          )
                        }
                        className="mt-5 w-full rounded-xl border-2 border-blue-700 px-6 py-3 font-extrabold text-blue-700 hover:bg-blue-50"
                      >
                        {T("Ver perfil del profesional")}
                      </button>

                      {solicitud.status ===
                        "open" &&
                        oferta.status ===
                          "pending" && (
                          <button
                            type="button"
                            onClick={() =>
                              aceptarOferta(
                                oferta
                              )
                            }
                            disabled={
                              aceptandoId !==
                              null
                            }
                            className="mt-3 w-full rounded-xl bg-green-600 px-6 py-4 text-lg font-extrabold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {aceptandoId ===
                            oferta.id
                              ? T("Contratando profesional...")
                              : paymentSettings
                              ? `${T("Revisar y continuar")} · Total $${calcularMontosPago(
                                  oferta.price,
                                  paymentSettings
                                ).customerTotalAmount.toFixed(2)}`
                              : `${T("Contratar por")} $${Number(
                                  oferta.price
                                ).toFixed(
                                  2
                                )}`}
                          </button>
                        )}

                    </article>
                  );
                }
              )}

            </div>
          )}

        </section>
        </details>
        )}

        {/* CHAT PRIVADO RELYDO */}

        {ofertaSeleccionada &&
          solicitud.status !==
            "open" && (
            <details
              key={trabajoFinalizadoConReview ? "chat-cerrado" : reclamoActivoChat ? "chat-reclamo" : "chat-abierto"}
              open={!panelesCerrados && !reclamoActivoChat}
              className="group mt-8"
            >
              <summary className="cursor-pointer list-none rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                      {T("🔒 Comunicación protegida")}
                    </p>
                    <p className="mt-1 font-extrabold text-slate-950">
                      {T("Chat con")} {ofertaSeleccionada.profesional?.business_name || T("el profesional")}
                    </p>
                  </div>
                  <span className="text-xl text-slate-500 transition group-open:rotate-90">›</span>
                </div>
              </summary>
              <section
                id="chat-relydo"
                className="mt-2 scroll-mt-6 overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-xl"
              >
              <div className="mb-5 font-extrabold text-slate-900">
              <span>{T("🔒 Comunicación protegida")}</span>
            </div>
              <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-blue-300">
                      {T("🔒 Comunicación protegida")}
                    </p>

                    <h2 className="mt-1 text-2xl font-black">
                      {T("Chat con")}{" "}
                      {ofertaSeleccionada.profesional
                        ?.business_name ||
                        T("el profesional")}
                    </h2>

                    <p className="mt-1 text-sm text-slate-300">
                      {T("Los números de teléfono personales permanecen privados.")}
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${
                      chatRealtimeConectado
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-700 text-slate-200"
                    }`}
                  >
                    {chatRealtimeConectado
                      ? T("● En tiempo real")
                      : T("Conectando...")}
                  </span>
                </div>
              </div>

              <div className="max-h-[430px] min-h-[260px] overflow-y-auto bg-slate-50 p-5">
                {cargandoChat ? (
                  <div className="flex min-h-[220px] items-center justify-center text-sm font-bold text-slate-500">
                    {T("Cargando conversación...")}
                  </div>
                ) : mensajesChat.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                    <div className="text-4xl">
                      💬
                    </div>

                    <p className="mt-3 font-black text-slate-800">
                      {T("Todavía no hay mensajes")}
                    </p>

                    <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                      {T("Usa este chat para coordinar el servicio sin compartir tu número personal.")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mensajesChat.map(
                      (item) => {
                        const mio =
                          item.sender_id ===
                          usuarioChatId;

                        return (
                          <div
                            key={item.id}
                            className={`flex ${
                              mio
                                ? "justify-end"
                                : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[86%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] ${
                                mio
                                  ? "rounded-br-md bg-blue-700 text-white"
                                  : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                              }`}
                            >
                              <p
                                className={`text-xs font-black ${
                                  mio
                                    ? "text-blue-100"
                                    : "text-blue-700"
                                }`}
                              >
                                {mio
                                  ? T("Tú")
                                  : item.sender_role ===
                                    "admin"
                                  ? "RELYDO Admin"
                                  : ofertaSeleccionada.profesional
                                      ?.business_name ||
                                    T("Profesional")}
                              </p>

                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                                {item.message}
                              </p>

                              <p
                                className={`mt-1 text-right text-[11px] ${
                                  mio
                                    ? "text-blue-200"
                                    : "text-slate-400"
                                }`}
                              >
                                {formatearHoraChat(
                                  item.created_at
                                , language)}
                              </p>
                            </div>
                          </div>
                        );
                      }
                    )}

                    <div
                      ref={finalChatRef}
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 bg-white p-5">
                {chatPuedeEnviar ? (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <textarea
                        value={mensajeChat}
                        onChange={(e) =>
                          setMensajeChat(
                            e.target.value
                          )
                        }
                        onKeyDown={(e) => {
                          if (
                            e.key ===
                              "Enter" &&
                            !e.shiftKey
                          ) {
                            e.preventDefault();
                            enviarMensajeChat();
                          }
                        }}
                        rows={2}
                        maxLength={1500}
                        placeholder={T("Escribe un mensaje...")}
                        className="min-h-[52px] flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
                      />

                      <button
                        type="button"
                        disabled={
                          enviandoMensajeChat ||
                          !mensajeChat.trim()
                        }
                        onClick={
                          enviarMensajeChat
                        }
                        className="rounded-2xl bg-blue-700 px-6 py-3.5 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {enviandoMensajeChat
                          ? "Enviando..."
                          : T("Enviar")}
                      </button>
                    </div>

                    <p className="mt-2 text-xs font-bold text-amber-700">
                      {T("⏳ El chat permanecerá abierto hasta 12 horas después de que se completó el trabajo.")}
                    </p>

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {T("🔒 RELYDO mantiene privados los teléfonos del cliente y del profesional. No compartas datos personales o formas de pago externas en el chat.")}
                    </p>
                  </>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-black text-amber-950">
                      {T("🔒 Chat bloqueado")}
                    </p>

                    <p className="mt-1 text-sm leading-6 text-amber-900">
                      {motivoChatBloqueado()}
                    </p>
                  </div>
                )}
              </div>
              </section>
            </details>
          )}


      </div>

      {visorFotoIndex !== null && fotosVisor[visorFotoIndex] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={fotosVisor[visorFotoIndex].alt}
          onClick={() => setVisorFotoIndex(null)}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setVisorFotoIndex(null);
            }}
            className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-3xl font-light text-white transition hover:bg-white/25"
            aria-label={language === "es" ? "Cerrar visor" : "Close viewer"}
          >
            ×
          </button>

          {fotosVisor.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moverVisorFoto(-1);
                }}
                className="absolute left-3 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-5xl font-light text-white transition hover:bg-white/25 sm:left-6"
                aria-label={language === "es" ? "Foto anterior" : "Previous photo"}
              >
                ‹
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moverVisorFoto(1);
                }}
                className="absolute right-3 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-5xl font-light text-white transition hover:bg-white/25 sm:right-6"
                aria-label={language === "es" ? "Foto siguiente" : "Next photo"}
              >
                ›
              </button>
            </>
          )}

          <img
            src={fotosVisor[visorFotoIndex].url}
            alt={fotosVisor[visorFotoIndex].alt}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85vh] max-w-[88vw] rounded-xl object-contain shadow-2xl"
          />

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white">
            {visorFotoIndex + 1} / {fotosVisor.length}
          </div>
        </div>
      )}

    </main>
  );
}



