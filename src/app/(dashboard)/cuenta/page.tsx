import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/settings/profile-form";
import { SecurityPanel } from "@/components/settings/security-panel";

/** Perfil y seguridad para cualquiera con sesión, tenga o no Configuración. */
export default async function CuentaPage() {
  const t = await getTranslations("Cuenta");
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
      <h1 className="text-lg font-semibold text-foreground">{t("titulo")}</h1>
      <ProfileForm />
      <SecurityPanel />
    </div>
  );
}
