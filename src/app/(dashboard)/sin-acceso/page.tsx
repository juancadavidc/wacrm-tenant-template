import { CATALOGO_V1 } from "@contracts/emp/company-sections";
import { SinAccesoSeccion } from "@/components/layout/sin-acceso-seccion";

export default async function SinAccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ seccion?: string }>;
}) {
  const { seccion } = await searchParams;
  const s = CATALOGO_V1.find((c) => c.id === seccion);
  return <SinAccesoSeccion nombre={s?.nombre ?? null} />;
}
