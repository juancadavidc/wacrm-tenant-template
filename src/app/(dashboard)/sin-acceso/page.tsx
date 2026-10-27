import { CATALOGO_V1 } from "@contracts/emp/company-sections";
import {
  SinAccesoSeccion,
  type MotivoSinAcceso,
} from "@/components/layout/sin-acceso-seccion";

const MOTIVOS: readonly MotivoSinAcceso[] = ["apagada", "perfil", "sin-perfil"];

export default async function SinAccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ seccion?: string; motivo?: string }>;
}) {
  const { seccion, motivo } = await searchParams;
  const s = CATALOGO_V1.find((c) => c.id === seccion);
  const m = MOTIVOS.find((x) => x === motivo) ?? "apagada";
  return <SinAccesoSeccion nombre={s?.nombre ?? null} motivo={m} />;
}
