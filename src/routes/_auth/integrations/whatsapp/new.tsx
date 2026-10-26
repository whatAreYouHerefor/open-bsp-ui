import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import SectionBody from "@/components/SectionBody";
import SectionFooter from "@/components/SectionFooter";
import WhatsAppIntegration from "@/components/WhatsAppIntegration";
import { useTranslation } from "@/hooks/useTranslation";
import ScopeToggle from "@/components/ScopeToggle";
import { useConnectionScope } from "@/hooks/useConnectionScope";

export const Route = createFileRoute("/_auth/integrations/whatsapp/new")({
  component: WhatsAppNew,
});

function WhatsAppNew() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { scope, setScope, isAdmin, agentId, allowed } = useConnectionScope();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [verifyToken, setVerifyToken] = useState("");

  const handleSuccess = (phone_number_id: string) => {
    void navigate({
      to: "/integrations/whatsapp/$orgAddressId",
      params: { orgAddressId: phone_number_id },
      hash: (prevHash) => prevHash!,
    });
  };

  return (
    <>
      <SectionHeader title={t("Conectar WhatsApp")} />

      <SectionBody>
        <form>
          <div className="instructions">
            <p>
              {t(
                "Para conectar WhatsApp, iniciá sesión en Meta. El flujo debe permitirte seleccionar una cuenta de WhatsApp existente o crear una, y después seleccionar un número elegible o agregar y verificar uno nuevo.",
              )}
            </p>

            <p>
              <strong>{t("Antes de continuar")}</strong>
            </p>
            <ul>
              <li>
                {t(
                  "Para probar el registro de un número nuevo, usá una línea dedicada que puedas verificar por SMS o llamada. No uses todavía un número activo de tu empresa.",
                )}
              </li>
              <li>
                {t(
                  "Si querés conectar un número que ya usa WhatsApp Cloud API, elegí su cuenta de WhatsApp existente si Meta la ofrece. No lo desconectes ni lo migres solo para probar.",
                )}
              </li>
              <li>
                {t(
                  "La selección de una página o cuenta publicitaria de Facebook es opcional y no registra por sí sola un número de WhatsApp.",
                )}
              </li>
            </ul>
          </div>

          <label>
            <div className="label">{t("Ámbito de conexión")}</div>
            <ScopeToggle value={scope} onChange={setScope} isAdmin={isAdmin} />
          </label>

          <button
            type="button"
            className="text-primary text-sm font-medium cursor-pointer self-start"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced
              ? t("Ocultar opciones avanzadas")
              : t("Opciones avanzadas")}
          </button>

          {showAdvanced && (
            <>
              <div className="instructions">
                <p>
                  {t(
                    "Sobrescribir la URL de callback es útil para evadir OpenBSP y recibir los webhooks crudos en el endpoint que indiques. OpenBSP seguirá recibiendo los eventos de cuenta y plantillas (no se pueden redirigir), pero no recibirá los mensajes.",
                  )}
                </p>
              </div>

              <label>
                <div className="label">
                  {t("URL de callback")} ({t("opcional")})
                </div>
                <input
                  type="url"
                  className="text"
                  placeholder="https://example.com/webhook"
                  value={callbackUrl}
                  onChange={(e) => setCallbackUrl(e.target.value)}
                />
              </label>

              <label>
                <div className="label">
                  {t("Verify token")} ({t("opcional")})
                </div>
                <input
                  type="text"
                  className="text"
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                />
              </label>
            </>
          )}
        </form>
      </SectionBody>

      <SectionFooter>
        <WhatsAppIntegration
          onSuccess={handleSuccess}
          allowed={allowed}
          signupOptions={{
            callback_url: callbackUrl.trim() || undefined,
            verify_token: verifyToken.trim() || undefined,
            agent_id: agentId,
          }}
        />
      </SectionFooter>
    </>
  );
}
