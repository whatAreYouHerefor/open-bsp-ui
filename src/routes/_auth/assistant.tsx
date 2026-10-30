import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  ChevronUp,
  MessageSquarePlus,
  Sparkles,
} from "lucide-react";
import useBoundStore from "@/stores/useBoundStore";
import { invokeFunction, supabase } from "@/supabase/client";
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
  const user = useBoundStore((s) => s.ui.user);
  // A workspace switch destroys the previous workspace's chat and pending UI.
  return (
    <AssistantChat
      key={`${orgId}:${user?.id}`}
      orgId={orgId}
      es={currentLanguage === "es"}
    />
  );
}
function AssistantChat({ orgId, es }: { orgId: string | null; es: boolean }) {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const user = useBoundStore((s) => s.ui.user);
  const setUser = useBoundStore((s) => s.ui.setUser);
  const [instructionsHidden, setInstructionsHidden] = useState(
    () => user?.user_metadata?.cmx_instructions_hidden === true,
  );
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);
  async function toggleInstructions() {
    if (!user || savingPreference) return;
    const previous = instructionsHidden;
    setInstructionsHidden(!previous);
    setSavingPreference(true);
    setPreferenceError("");
    try {
      const { data, error: saveError } = await supabase.auth.updateUser({
        data: { cmx_instructions_hidden: !previous },
      });
      if (saveError || !data.user) throw new Error();
      setUser(data.user);
    } catch {
      setInstructionsHidden(previous);
      setPreferenceError(
        es
          ? "No se pudo guardar tu preferencia. Intenta otra vez."
          : "Could not save your preference. Please try again.",
      );
    } finally {
      setSavingPreference(false);
    }
  }

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
  const examples = es
    ? [
        "¿Qué pidió Carlos ayer?",
        "¿Quién necesita seguimiento?",
        "Resume una conversación",
      ]
    : [
        "What did Carlos ask yesterday?",
        "Who needs a follow-up?",
        "Summarize a conversation",
      ];
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <span className="text-xs font-semibold tracking-widest text-muted-foreground">
            CONVERSIA
          </span>
          <h1 className="text-lg font-semibold">
            {es ? "Asistente de tu espacio" : "Workspace assistant"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
            disabled={busy || !turns.length}
            onClick={() => {
              setTurns([]);
              setError("");
            }}
            title={es ? "Nuevo chat" : "New chat"}
          >
            <MessageSquarePlus size={18} />
            <span className="hidden sm:inline">
              {es ? "Nuevo chat" : "New chat"}
            </span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
            aria-expanded={!instructionsHidden}
            aria-controls="workspace-instructions"
            disabled={savingPreference || !user}
            onClick={() => {
              void toggleInstructions();
            }}
          >
            <BookOpen size={17} />
            {instructionsHidden
              ? es
                ? "Mostrar guía"
                : "Show guide"
              : es
                ? "Ocultar guía"
                : "Hide guide"}
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 pb-8 pt-6">
          {!instructionsHidden && (
            <section
              id="workspace-instructions"
              aria-label={es ? "Cómo usar el chat" : "How to use this chat"}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">
                  {es ? "Cómo usar este espacio" : "How to use your workspace"}
                </h2>
                <button
                  type="button"
                  disabled={savingPreference || !user}
                  onClick={() => {
                    void toggleInstructions();
                  }}
                  aria-label={
                    es ? "Ocultar instrucciones" : "Hide instructions"
                  }
                  className="rounded-lg p-1 hover:bg-muted"
                >
                  <ChevronUp size={18} />
                </button>
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  {es
                    ? "Pregunta por un cliente, una fecha o lo que se habló en una conversación."
                    : "Ask about a customer, a date, or what was discussed in a conversation."}
                </li>
                <li>
                  {es
                    ? "Continúa con preguntas como «¿Cuál es su número?» o «Resume lo que hablaron»."
                    : "Follow up with questions like “What is their number?” or “Summarize what they discussed.”"}
                </li>
                <li>
                  {es
                    ? "Abre los mensajes consultados para revisar la información original."
                    : "Open the source messages to check the original information."}
                </li>
              </ol>
              <p className="mt-4 text-xs text-muted-foreground">
                {es
                  ? "Tu asistente sigue atendiendo a tus clientes y generando resúmenes guardados. Este chat es para ti y tu equipo. Tu preferencia de mostrar u ocultar esta guía se guarda en tu cuenta."
                  : "Your assistant continues handling your customers and generating saved summaries. This chat is for you and your team. Your show/hide guide preference is saved to your account."}
              </p>
            </section>
          )}
          {preferenceError && (
            <p role="alert" className="text-sm">
              {preferenceError}
            </p>
          )}
          {!turns.length && (
            <div className="flex flex-col items-center gap-5 py-10 text-center">
              <Sparkles size={30} className="text-primary" />
              <h2 className="text-3xl font-semibold tracking-tight">
                {es
                  ? "¿Qué quieres saber de tus clientes?"
                  : "What would you like to know?"}
              </h2>
              <p className="max-w-lg text-muted-foreground">
                {es
                  ? "Habla con tu asistente sobre las conversaciones de tus clientes y encuentra los detalles que necesitas."
                  : "Chat with your assistant about customer conversations and find the details you need."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {examples.map((example) => (
                  <button
                    type="button"
                    key={example}
                    onClick={() => setQuestion(example)}
                    className="rounded-2xl border border-border px-4 py-3 text-sm hover:bg-muted"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            className="flex flex-col gap-8"
            aria-live="polite"
            aria-busy={busy}
          >
            {turns.map((turn, index) => (
              <article
                key={index}
                className={
                  turn.role === "user"
                    ? "ml-auto max-w-[85%] rounded-3xl bg-muted px-5 py-3"
                    : "w-full px-1"
                }
              >
                <h2
                  className={
                    turn.role === "user"
                      ? "sr-only"
                      : "mb-3 flex items-center gap-2 text-sm font-semibold"
                  }
                >
                  {turn.role === "user" ? (
                    es ? (
                      "Tú"
                    ) : (
                      "You"
                    )
                  ) : (
                    <>
                      <Sparkles size={16} className="text-primary" />
                      Conversia
                    </>
                  )}
                </h2>
                <p className="whitespace-pre-wrap text-[15px] leading-7">
                  {turn.content}
                </p>
                {turn.result?.limited && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {es
                      ? "Hay más mensajes. Indica un contacto o una fecha para precisar tu consulta."
                      : "There are more matching messages. Specify a contact or date to narrow your question."}
                  </p>
                )}
                {!!turn.result?.sources.length && (
                  <details className="mt-4 rounded-xl border border-border px-4 py-3 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      {es ? "Mensajes consultados" : "Source messages"} ·{" "}
                      {turn.result.sources.length}
                    </summary>
                    {turn.result.sources.map((source) => (
                      <details
                        key={source.id}
                        className="mt-3 border-t border-border pt-3"
                      >
                        <summary className="cursor-pointer">
                          [{source.reference}] {source.phone} ·{" "}
                          {new Date(source.timestamp).toLocaleString()}
                        </summary>
                        <p className="my-3 whitespace-pre-wrap leading-6">
                          {source.text}
                        </p>
                        <button
                          className="text-primary"
                          onClick={() => {
                            void navigate({
                              to: "/conversations",
                              hash: source.conversation_id,
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
              <p
                role="status"
                className="animate-pulse text-sm text-muted-foreground"
              >
                {es
                  ? "Consultando tus conversaciones…"
                  : "Looking through your conversations…"}
              </p>
            )}
            <div ref={endRef} />
          </div>
        </div>
      </div>
      <footer className="shrink-0 px-4 pb-4 pt-3 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {error && (
            <p role="alert" className="mb-3 text-sm">
              {error}
            </p>
          )}
          <form
            ref={formRef}
            onSubmit={(event) => {
              void ask(event);
            }}
            className="rounded-3xl border border-border bg-card p-3 shadow-sm"
          >
            <label htmlFor="workspace-question" className="sr-only">
              {es ? "Mensaje al asistente" : "Message your workspace assistant"}
            </label>
            <textarea
              id="workspace-question"
              rows={2}
              maxLength={2000}
              required
              disabled={busy}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  if (!busy && orgId && question.trim())
                    formRef.current?.requestSubmit();
                }
              }}
              placeholder={
                es
                  ? "Pregunta sobre tus clientes…"
                  : "Ask about your customers…"
              }
              className="w-full resize-none bg-transparent px-2 py-2 text-[15px] outline-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="px-2 text-xs text-muted-foreground">
                {es ? "Chat privado de tu espacio" : "Private workspace chat"}
              </span>
              <button
                type="submit"
                title={es ? "Enviar mensaje" : "Send message"}
                aria-label={es ? "Enviar mensaje" : "Send message"}
                disabled={busy || !orgId || !question.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-25"
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </form>
          <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">
            {es
              ? "Revisa los mensajes originales para confirmar los detalles. Este chat no escribe a tus clientes. La conversación con este asistente no se guarda al salir."
              : "Check the original messages to confirm details. This chat does not message your customers. This assistant conversation is not saved when you leave."}
          </p>
        </div>
      </footer>
    </div>
  );
}
