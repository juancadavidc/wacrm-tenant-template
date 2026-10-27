"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

/** Lo que ve quien abre la URL de una sección que su empresa no tiene. */
export type MotivoSinAcceso = "apagada" | "perfil" | "sin-perfil";

export function SinAccesoSeccion({
  nombre,
  motivo = "apagada",
}: {
  nombre: string | null;
  motivo?: MotivoSinAcceso;
}) {
  const t = useTranslations("SinAccesoSeccion");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold text-foreground">{t("titulo")}</h1>
      <p className="text-sm text-muted-foreground">
        {motivo === "sin-perfil"
          ? t("textoSinPerfil")
          : motivo === "perfil" && nombre
            ? t("textoPerfil", { nombre })
            : nombre
              ? t("texto", { nombre })
              : t("textoGenerico")}
      </p>
      {motivo === "sin-perfil" && (
        <Link href="/cuenta" className="text-sm font-medium text-primary">
          {t("irACuenta")}
        </Link>
      )}
      <Link href="/dashboard" className="text-sm font-medium text-primary">
        {t("volver")}
      </Link>
    </div>
  );
}
