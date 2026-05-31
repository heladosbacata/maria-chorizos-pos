"use client";

import type { PosCajaMensajeCliente } from "@/lib/wms-caja-mensajes-client";

export function IconImagePlus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

export function IconXSmall({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function validarImagenChat(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Solo se permiten imágenes (JPG, PNG, WebP).";
  if (file.size > 2 * 1024 * 1024) return "La imagen no debe superar 2 MB.";
  return null;
}

export function PosCajaMensajeContenido({
  mensaje,
  classNameImagen = "max-h-40 max-w-full rounded-lg object-cover",
}: {
  mensaje: PosCajaMensajeCliente;
  classNameImagen?: string;
}) {
  return (
    <>
      {mensaje.imageUrl ? (
        <a
          href={mensaje.imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1.5 block"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mensaje.imageUrl}
            alt="Imagen adjunta"
            className={classNameImagen}
            loading="lazy"
          />
        </a>
      ) : null}
      {mensaje.text ? <p className="whitespace-pre-wrap break-words">{mensaje.text}</p> : null}
    </>
  );
}
