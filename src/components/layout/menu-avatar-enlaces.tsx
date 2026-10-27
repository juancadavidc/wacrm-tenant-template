"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Settings as SettingsIcon, User } from "lucide-react";
import type { SeccionId } from "@contracts/emp/company-sections";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { enlacesMenuAvatar } from "@/lib/secciones/menu-avatar";

/** Perfil y Configuración del menú del avatar, según las secciones permitidas. */
export function MenuAvatarEnlaces({ secciones }: { secciones: SeccionId[] }) {
  const t = useTranslations("Header");
  const { perfil, configuracion } = enlacesMenuAvatar(secciones);
  const clase = "text-popover-foreground focus:bg-accent focus:text-accent-foreground";
  return (
    <>
      <DropdownMenuItem render={<Link href={perfil} className={clase} />}>
        <User className="size-4" />
        {t("menuProfile")}
      </DropdownMenuItem>
      {configuracion && (
        <DropdownMenuItem render={<Link href={configuracion} className={clase} />}>
          <SettingsIcon className="size-4" />
          {t("menuSettings")}
        </DropdownMenuItem>
      )}
    </>
  );
}
