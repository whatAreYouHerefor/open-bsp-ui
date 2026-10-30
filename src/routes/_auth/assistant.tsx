import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  ChevronUp,
  MessageSquarePlus,
  Sparkles,
  History,
  Copy,
  UserRound,
  X,
} from "lucide-react";
import useBoundStore from "@/stores/useBoundStore";
import { invokeFunction, supabase } from "@/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

import {
  listWorkspaceChats,
  loadWorkspaceChat,
  saveWorkspaceChat,
  type WorkspaceAnswer as Answer,
  type WorkspaceTurn as Turn,
} from "@/utils/WorkspaceChats";

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
  const [savedChats, setSavedChats] = useState<
    Awaited<ReturnType<typeof listWorkspaceChats>>
  >([]);
  const [activeSaved, setActiveSaved] = useState<{
    id: string;
    updated_at: string;
  }>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [selectedPhone, setSelectedPhone] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  const user = useBoundStore((s) => s.ui.user);
  const userId = user?.id;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const setUser = useBoundStore((s) => s.ui.setUser);
  const [instructionsHidden, setInstructionsHidden] = useState(
    () => user?.user_metadata?.cmx_instructions_hidden === true,
  );
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  useEffect(() => {
    if (!orgId || !userId) return;
    let live = true;
    void listWorkspaceChats(orgId, userId)
      .then((rows) => {
        if (live) setSavedChats(rows);
      })
      .catch(() => {
        if (live)
          setSaveError(
            es
              ? "El historial guardado aún no está conectado. Puedes continuar en este chat."
              : "Saved history is not connected yet. You can continue in this chat.",
          );
      });
    return () => {
      live = false;
    };
  }, [orgId, userId, es]);
  async function persistChat(next: Turn[]) {
    if (!orgId || !user) return;
    try {
      const saved = await saveWorkspaceChat(orgId, user.id, next, activeSaved);
      setActiveSaved(saved);
      setSaveError("");
      setSavedChats((prev) =>
        [saved, ...prev.filter((item) => item.id !== saved.id)].slice(0, 50),
      );
    } catch {
      setSaveError(
        es
          ? "Este chat no se ha guardado. No cierres la página; vuelve a intentar guardar."
          : "This chat has not been saved. Keep this page open and retry saving.",
      );
    }
  }
  async function openSavedChat(id: string) {
    if (!orgId || !user || busy || loadingChat || (saveError && turns.length))
      return;
    setLoadingChat(true);
    try {
      const chat = await loadWorkspaceChat(id, orgId, user.id);
      setTurns(chat.turns);
      setActiveSaved(chat);
      setQuestion("");
      setError("");
      setSelectedPhone("");
      setHistoryOpen(false);
    } catch {
      setError(
        es
          ? "No se pudo abrir el chat guardado."
          : "Could not open the saved chat.",
      );
    } finally {
      setLoadingChat(false);
    }
  }
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
    if (!orgId || busy || loadingChat || !question.trim()) return;
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
      const next: Turn[] = [
        ...turns,
        { role: "user", content: text },
        { role: "assistant", content: result.answer, result },
      ];
      setTurns(next);
      await persistChat(next);
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
  const latestSources =
    [...turns].reverse().find((turn) => turn.result?.sources.length)?.result
      ?.sources ?? [];
  const phones = [...new Set(latestSources.map((source) => source.phone))];
  const focusedPhone = phones.includes(selectedPhone)
    ? selectedPhone
    : phones.length === 1
      ? phones[0]
      : "";
  const customerSources = latestSources.filter(
    (source) => source.phone === focusedPhone,
  );
  const customerName = customerSources.find(
    (source) => source.contact_name,
  )?.contact_name;
  const latestCustomer = [...customerSources]
    .reverse()
    .find((source) => source.author === "customer");
  const followUp = (prompt: string) => {
    setQuestion(focusedPhone ? `${prompt} (${focusedPhone})` : prompt);
    document.getElementById("workspace-question")?.focus();
  };
  const revealSource = (index: number, reference: number) => {
    const parent = document.getElementById(`sources-${index}`);
    const child = document.getElementById(`source-${index}-${reference}`);
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    if (child instanceof HTMLDetailsElement) {
      child.open = true;
      child.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
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
    <div className="relative flex h-full min-h-0 flex-row bg-background">
      <aside
        aria-label={es ? "Chats guardados" : "Saved chats"}
        className={`${historyOpen ? "absolute inset-y-0 left-0 z-40 flex shadow-xl" : "hidden"} w-64 shrink-0 flex-col border-r border-border bg-sidebar p-4 lg:static lg:flex lg:shadow-none`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-semibold">{es ? "Tus chats" : "Your chats"}</h2>
          <button
            className="lg:hidden"
            aria-label="Close history"
            onClick={() => setHistoryOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {es
            ? "Solo tú puedes ver tus chats internos guardados."
            : "Only you can see your saved internal chats."}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
          {savedChats.length ? (
            savedChats.map((chat) => (
              <button
                key={chat.id}
                disabled={
                  busy || loadingChat || (!!saveError && !!turns.length)
                }
                onClick={() => {
                  void openSavedChat(chat.id);
                }}
                className={`w-full truncate rounded-xl px-3 py-3 text-left text-sm hover:bg-muted disabled:opacity-40 ${activeSaved?.id === chat.id ? "bg-muted" : ""}`}
                title={chat.title}
              >
                {chat.title}
              </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {es
                ? "Tus conversaciones aparecerán aquí cuando se guarden."
                : "Your conversations will appear here when saved."}
            </p>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
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
              className="rounded-xl p-2 xl:hidden"
              aria-label={es ? "Vista del cliente" : "Customer overview"}
              title={es ? "Vista del cliente" : "Customer overview"}
              onClick={() => setDetailsOpen(!detailsOpen)}
            >
              <UserRound size={18} />
            </button>
            <button
              type="button"
              className="rounded-xl p-2 lg:hidden"
              aria-label={es ? "Chats guardados" : "Saved chats"}
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <History size={18} />
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
              disabled={busy || loadingChat || !turns.length}
              onClick={() => {
                if (
                  saveError &&
                  !window.confirm(
                    es
                      ? "Este chat no está guardado. ¿Quieres descartarlo y comenzar uno nuevo?"
                      : "This chat is not saved. Discard it and start a new one?",
                  )
                )
                  return;
                setSaveError("");
                setTurns([]);
                setActiveSaved(undefined);
                setSelectedPhone("");
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
        {saveError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-5 py-3 text-sm"
          >
            <span>{saveError}</span>
            {!!turns.length && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void persistChat(turns);
                }}
                className="font-semibold underline"
              >
                {es ? "Volver a guardar" : "Retry save"}
              </button>
            )}
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto px-4 sm:px-8">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 pb-8 pt-6">
              {!instructionsHidden && (
                <section
                  id="workspace-instructions"
                  aria-label={es ? "Cómo usar el chat" : "How to use this chat"}
                  className="rounded-2xl border border-border bg-card p-5"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-semibold">
                      {es
                        ? "Cómo usar este espacio"
                        : "How to use your workspace"}
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
                      {turn.content
                        .split(/(\[\d+\])/g)
                        .map((part, partIndex) => {
                          const reference = /^\[(\d+)\]$/.exec(part);
                          return reference &&
                            turn.result?.sources.some(
                              (source) =>
                                source.reference === Number(reference[1]),
                            ) ? (
                            <button
                              type="button"
                              key={partIndex}
                              className="mx-0.5 rounded bg-muted px-1 text-primary underline"
                              aria-label={`Source ${reference[1]}`}
                              onClick={() =>
                                revealSource(index, Number(reference[1]))
                              }
                            >
                              {part}
                            </button>
                          ) : (
                            part
                          );
                        })}
                    </p>
                    {turn.role === "assistant" && (
                      <button
                        type="button"
                        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(turn.content)
                            .then(() => setCopied(index))
                            .catch(() =>
                              setError(
                                es
                                  ? "No se pudo copiar."
                                  : "Could not copy the answer.",
                              ),
                            );
                        }}
                      >
                        <Copy size={13} />
                        {copied === index
                          ? es
                            ? "Copiado"
                            : "Copied"
                          : es
                            ? "Copiar respuesta"
                            : "Copy answer"}
                      </button>
                    )}
                    {turn.result?.limited && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {es
                          ? "Hay más mensajes. Indica un contacto o una fecha para precisar tu consulta."
                          : "There are more matching messages. Specify a contact or date to narrow your question."}
                      </p>
                    )}
                    {!!turn.result?.sources.length && (
                      <details
                        id={`sources-${index}`}
                        className="mt-4 rounded-xl border border-border px-4 py-3 text-sm"
                      >
                        <summary className="cursor-pointer text-muted-foreground">
                          {es ? "Mensajes consultados" : "Source messages"} ·{" "}
                          {turn.result.sources.length}
                        </summary>
                        {turn.result.sources.map((source) => (
                          <details
                            id={`source-${index}-${source.reference}`}
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
          <aside
            aria-label={es ? "Vista del cliente" : "Customer overview"}
            className={`${detailsOpen ? "absolute inset-y-0 right-0 z-40 block bg-background shadow-xl" : "hidden"} w-72 shrink-0 overflow-y-auto border-l border-border p-5 xl:static xl:block xl:shadow-none`}
          >
            <div className="mb-5 flex items-center gap-2">
              <button
                type="button"
                className="xl:hidden"
                aria-label={es ? "Cerrar detalles" : "Close details"}
                onClick={() => setDetailsOpen(false)}
              >
                <X size={18} />
              </button>
              <UserRound size={18} />
              <h2 className="font-semibold">
                {es ? "Vista del cliente" : "Customer overview"}
              </h2>
            </div>
            {phones.length > 1 && (
              <label className="mb-4 block text-sm">
                {es ? "Elegir cliente" : "Choose customer"}
                <select
                  className="mt-2 w-full rounded-xl border border-border bg-background p-2"
                  value={focusedPhone}
                  onChange={(event) => setSelectedPhone(event.target.value)}
                >
                  <option value="">
                    {es ? "Selecciona un número" : "Select a number"}
                  </option>
                  {phones.map((phone) => (
                    <option key={phone} value={phone}>
                      {phone}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {focusedPhone ? (
              <>
                <h3 className="text-lg font-semibold">
                  {customerName || (es ? "Cliente" : "Customer")}
                </h3>
                <p className="mt-1 text-sm">{focusedPhone}</p>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {es
                    ? "Último mensaje consultado"
                    : "Latest retrieved message"}
                </p>
                <p className="mt-2 text-sm leading-6">
                  {latestCustomer?.text ||
                    (es
                      ? "No hay mensajes de este cliente en los resultados."
                      : "No customer message in these results.")}
                </p>
                {latestCustomer && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(latestCustomer.timestamp).toLocaleString()}
                  </p>
                )}
                <div className="mt-6 flex flex-col gap-2">
                  <button
                    className="rounded-xl border border-border px-3 py-3 text-left text-sm hover:bg-muted"
                    onClick={() =>
                      followUp(
                        es
                          ? "¿Cuál es el siguiente paso recomendado para este cliente? Separa los hechos de las sugerencias."
                          : "What is the recommended next step for this customer? Separate facts from suggestions.",
                      )
                    }
                  >
                    {es ? "Sugerir siguiente paso" : "Suggest next step"}
                  </button>
                  <button
                    className="rounded-xl border border-border px-3 py-3 text-left text-sm hover:bg-muted"
                    onClick={() =>
                      followUp(
                        es
                          ? "Redacta una respuesta para este cliente que pueda revisar. No la envíes."
                          : "Draft a reply to this customer for me to review. Do not send it.",
                      )
                    }
                  >
                    {es ? "Preparar respuesta" : "Draft a reply"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                {es
                  ? "Pregunta por un cliente para ver aquí su número y los mensajes que respaldan la respuesta."
                  : "Ask about a customer to see their number and supporting messages here."}
              </p>
            )}
            <p className="mt-6 text-xs leading-5 text-muted-foreground">
              {es
                ? "Basado en los mensajes consultados para esta respuesta; no es el historial completo del cliente."
                : "Based on messages retrieved for this answer, not the customer’s entire history."}
            </p>
          </aside>
        </div>
        <footer className="shrink-0 px-4 pb-4 pt-3 sm:px-8">
          <div className="mx-auto w-full max-w-3xl">
            {error && (
              <p role="alert" className="mb-3 text-sm">
                {error}
              </p>
            )}
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() =>
                  followUp(
                    es
                      ? "¿Qué quedó pendiente en esta conversación?"
                      : "What remains unresolved in this conversation?",
                  )
                }
              >
                {es ? "¿Qué quedó pendiente?" : "What’s unresolved?"}
              </button>
              <button
                type="button"
                className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() =>
                  followUp(
                    es
                      ? "Sugiere el siguiente paso basándote en esta conversación."
                      : "Suggest the next step based on this conversation.",
                  )
                }
              >
                {es ? "Siguiente paso" : "Next step"}
              </button>
              <button
                type="button"
                className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
                onClick={() =>
                  followUp(
                    es
                      ? "Redacta una respuesta para revisar, sin enviarla."
                      : "Draft a reply for review, without sending it.",
                  )
                }
              >
                {es ? "Borrador de respuesta" : "Draft reply"}
              </button>
            </div>
            <form
              ref={formRef}
              onSubmit={(event) => {
                void ask(event);
              }}
              className="rounded-3xl border border-border bg-card p-3 shadow-sm"
            >
              <label htmlFor="workspace-question" className="sr-only">
                {es
                  ? "Mensaje al asistente"
                  : "Message your workspace assistant"}
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
                ? "Revisa los mensajes originales para confirmar los detalles. Este chat no escribe a tus clientes. Los chats guardados quedan disponibles en tu historial privado."
                : "Check the original messages to confirm details. This chat does not message your customers. Saved chats remain in your private history."}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
