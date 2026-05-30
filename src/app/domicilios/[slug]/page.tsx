import { redirect } from "next/navigation";
import { puntoVentaDesdeSlugDomicilios } from "@/lib/pos-domicilios-slug";

type Props = {
  params: { slug: string };
  searchParams?: {
    puntoVenta?: string;
    canal?: string;
  };
};

export default function DomiciliosQrRedirectPage({ params, searchParams }: Props) {
  const puntoVenta = puntoVentaDesdeSlugDomicilios(params.slug, searchParams?.puntoVenta);
  const qs = new URLSearchParams({
    puntoVenta,
    canal: searchParams?.canal?.trim() || "qr",
  });
  redirect(`/pedidos?${qs.toString()}`);
}
