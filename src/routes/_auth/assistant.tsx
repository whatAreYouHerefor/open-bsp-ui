import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import SectionBody from "@/components/SectionBody";
import useBoundStore from "@/stores/useBoundStore";
import { invokeFunction } from "@/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

type Source = {
  reference: number;
  id: string;
  conversation_id: string;
  phone: string;
  timestamp: string;
  author: string;
  text: string;
};
type Answer = { answer: string; sources: Source[]; limited: boolean };
type Turn = { role: "user" | "assistant"; content: string; result?: Answer };
export const Route = createFileRoute("/_auth/assistant")({
  component: WorkspaceAssistant,
});
function WorkspaceAssistant() {
  const { currentLanguage } = useTranslation();
  const orgId = useBoundStore((s) => s.ui.activeOrgId);
  // A workspace switch destroys the previous workspace's chat and pending UI.
  return (
    <AssistantChat key={orgId} orgId={orgId} es={currentLanguage === "es"} />
  );
}
function AssistantChat({ orgId, es }: { orgId: string | null; es: boolean }) {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!orgId || busy || !question.trim()) return;
    const text = question.trim();
    const history = turns
      .slice(-8)
      .map(({ role, content }) => ({ role, content: content.slice(0, 1800) }));
    setBusy(true);
    setError("");
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setQuestion("");
    try {
      const result = await invokeFunction<Answer>("workspace-assistant", {
        body: {
          organization_id: orgId,
          question: text,
          history,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      if (!result) throw new Error();
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: result.answer, result },
      ]);
    } catch {
      setTurns((prev) => prev.slice(0, -1));
      setQuestion(text);
      setError(
        es
          ? "No se pudo consultar el espacio. Conversia debe verificar la conexión y el modelo del asistente."
          : "Could not query your workspace. Conversia needs to check the assistant connection and model.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionHeader
        title={es ? "Consulta tu espacio" : "Ask your workspace"}
      />
      <SectionBody className="max-w-4xl mx-auto gap-5 pb-6">
        <p>
          {es
            ? "Habla sobre tus clientes y las conversaciones que han tenido con tu asistente. Puedes hacer preguntas de seguimiento: «¿Qué pidió Carlos?», «¿Cuál es su número?», «Resume lo que hablaron»."
            : "Talk about your customers and their conversations with your assistant. Ask follow-up questions: ‘What did Carlos ask for?’, ‘What is his number?’, ‘Summarize what they discussed.’"}
        </p>
        <p className="text-sm text-muted-foreground">
          {es
            ? "Solo consulta los mensajes de WhatsApp guardados que tienes permiso de ver. Botpress sigue atendiendo a tus clientes y generando los resúmenes guardados."
            : "Uses only stored WhatsApp messages you have permission to view. Botpress continues handling your customers and generating saved summaries."}
        </p>
        <div
          className="flex flex-col gap-4"
          aria-live="polite"
          aria-busy={busy}
        >
          {turns.map((turn, index) => (
            <article
              key={index}
              className={
                turn.role === "user"
                  ? "rounded-xl bg-muted p-4"
                  : "rounded-xl border border-border p-4"
              }
            >
              <h2 className="font-semibold mb-2">
                {turn.role === "user"
                  ? es
                    ? "Tú"
                    : "You"
                  : es
                    ? "Asistente del espacio"
                    : "Workspace assistant"}
              </h2>
              <p className="whitespace-pre-wrap">{turn.content}</p>
              {turn.result?.limited && (
                <p className="text-sm mt-3">
                  {es
                    ? "Hay más mensajes que los consultados. Especifica un contacto o fecha en tu siguiente pregunta."
                    : "There are more messages than were searched. Specify a contact or date in your next question."}
                </p>
              )}
              {!!turn.result?.sources.length && (
                <details className="mt-4">
                  <summary>
                    {es ? "Ver mensajes consultados" : "View source messages"} (
                    {turn.result.sources.length})
                  </summary>
                  {turn.result.sources.map((s) => (
                    <details key={s.id} className="border-t border-border py-3">
                      <summary>
                        [{s.reference}] {s.phone} ·{" "}
                        {new Date(s.timestamp).toLocaleString()} ·{" "}
                        {s.author === "customer"
                          ? es
                            ? "Cliente"
                            : "Customer"
                          : es
                            ? "Negocio"
                            : "Business"}
                      </summary>
                      <p className="whitespace-pre-wrap my-3">{s.text}</p>
                      <button
                        className="text-primary"
                        onClick={() => {
                          void navigate({
                            to: "/conversations",
                            hash: s.conversation_id,
                          });
                        }}
                      >
                        {es ? "Abrir conversación" : "Open conversation"}
                      </button>
                    </details>
                  ))}
                </details>
              )}
            </article>
          ))}
          {busy && (
            <p role="status">
              {es
                ? "Consultando tus conversaciones…"
                : "Looking through your conversations…"}
            </p>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        <form
          onSubmit={(event) => {
            void ask(event);
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="workspace-question">
            {es ? "Tu mensaje" : "Your message"}
          </label>
          <textarea
            id="workspace-question"
            className="text"
            rows={3}
            required
            maxLength={2000}
            disabled={busy}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              es
                ? "¿Qué me dijo Carlos ayer sobre su cita?"
                : "What did Carlos tell us yesterday about his appointment?"
            }
          />
          <div className="flex gap-3">
            <button
              className="primary"
              type="submit"
              disabled={busy || !orgId || !question.trim()}
            >
              {es ? "Enviar" : "Send"}
            </button>
            <button
              type="button"
              disabled={busy || !turns.length}
              onClick={() => {
                setTurns([]);
                setError("");
              }}
            >
              {es ? "Nueva conversación" : "New chat"}
            </button>
          </div>
        </form>
        <p className="text-sm text-muted-foreground">
          {es
            ? "Este chat es interno y no envía mensajes a tus clientes. Consulta hasta 80 mensajes de texto por respuesta; no incluye contenido de archivos ni historial externo sin importar. La conversación con este asistente se conserva solo mientras esta vista esté abierta."
            : "This chat is internal and does not send messages to your customers. Searches up to 80 text messages per answer; excludes media contents and external history that has not been imported. This assistant chat lasts only while this view stays open."}
        </p>
      </SectionBody>
    </>
  );
}
