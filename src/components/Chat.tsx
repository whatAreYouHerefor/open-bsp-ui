import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/es";
import "dayjs/locale/pt";
import localizedFormat from "dayjs/plugin/localizedFormat";
dayjs.extend(localizedFormat);
import useBoundStore from "@/stores/useBoundStore";
import Message from "./Message/Message";
import {
  type MessageRow,
  isInternal,
  isMultiParty,
  isTeamChat,
  messageDirection,
} from "@/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentOrganization } from "@/queries/useOrganizations";
import { useCurrentAgent } from "@/queries/useAgents";
import { AVATAR_COLORS } from "@/utils/colors";

type EnvelopeType = { message: MessageRow; first: boolean; last: boolean };
type SeparatorType = { text: string; first: true; last: true };

function Separator({ text }: { text: string }) {
  // TODO: just a placeholder
  const type: string = "date";

  return (
    <div
      className={
        "flex justify-center mb-[12px]" +
        (type === "unread" ? " py-[5px] bg-incoming-chat-bubble/25" : "")
      }
    >
      {/* unreads has rounded-16px px-22px py-0 but I prefer to keep the date style */}
      <div
        className={
          "px-[12px] pt-[4px] pb-[5px] capitalize text-[12px] bg-incoming-chat-bubble rounded-lg text-foreground" +
          (type === "unread" ? "" : " shadow")
        }
      >
        {text}
      </div>
    </div>
  );
}

export default function Chat() {
  const activeConvId = useBoundStore((store) => store.ui.activeConvId);
  const messages = Array.from(
    useBoundStore((store) =>
      store.chat.messages.get(store.ui.activeConvId || ""),
    )?.values() || [],
  );

  const { data: org } = useCurrentOrganization();
  const orgName = org?.name || "?";

  const conversation = useBoundStore((store) =>
    store.chat.conversations.get(store.ui.activeConvId || ""),
  );
  const convName = conversation?.name || "?";
  const multiParty = !!conversation && isMultiParty(conversation);
  const teamChat = isTeamChat(conversation);

  const { data: agent } = useCurrentAgent();
  // From the store, not the query, so this and Message agree on the viewer
  // exactly — they decide the same message's side, one render apart otherwise.
  const activeAgentId = useBoundStore((store) => store.chat.ownAgentId);
  const isAdmin = ["admin", "owner"].includes(agent?.role || "");

  const scroller = useRef<HTMLDivElement>(null);

  const { translate: t, currentLanguage } = useTranslation();

  const viewKey = `cmx-hidden-messages:${activeAgentId}:${activeConvId}`;
  const [hiddenByKey, setHiddenByKey] = useState<Record<string, string[]>>({});
  const hidden = hiddenByKey[viewKey] ?? (() => {
    try { return JSON.parse(localStorage.getItem(viewKey) || "[]") as string[]; }
    catch { return []; }
  })();
  const saveHidden = (ids: string[]) => {
    try {
      localStorage.setItem(viewKey, JSON.stringify(ids));
      setHiddenByKey((old) => ({ ...old, [viewKey]: ids }));
    } catch { window.alert(currentLanguage === "es" ? "No se pudo guardar el cambio." : "Could not save this change."); }
  };
  const deleteFromView = (id: string) => {
    if (window.confirm(currentLanguage === "es"
      ? "¿Eliminar este mensaje de tu vista en este navegador? No se elimina de WhatsApp ni de los registros del equipo."
      : "Delete this message from your view in this browser? It stays in WhatsApp and the team records.")) saveHidden([...hidden, id]);
  };

  function formatDate(timestamp: string): string {
    const dayjsTs = dayjs(timestamp).locale(currentLanguage);

    const days = dayjs().diff(dayjsTs.startOf("day"), "day", true);

    if (days < 1) return t("hoy");

    if (days < 2) return t("ayer");

    if (days < 7) return dayjsTs.format("dddd"); // Jueves

    return dayjsTs.format("l"); // 9/9/2024
  }

  function getUniqueAgentIds(messages: MessageRow[] | undefined): Set<string> {
    if (!messages) return new Set();

    const agentIds = new Set<string>();

    for (const message of messages) {
      if (message.agent_id) {
        agentIds.add(message.agent_id);
      }
    }

    return agentIds;
  }

  function assignAgentColors(agentIds: Set<string>): Map<string, string> {
    const colorMap = new Map<string, string>();
    let colorIndex = 0;

    // Ensure consistent color assignment by sorting agent IDs
    const sortedAgentIds = Array.from(agentIds).sort();

    for (const agentId of sortedAgentIds) {
      colorMap.set(agentId, AVATAR_COLORS[colorIndex % AVATAR_COLORS.length]);
      colorIndex++;
    }

    return colorMap;
  }

  const colorMap = assignAgentColors(getUniqueAgentIds(messages));

  // Who said this — shown only when it is a question.
  //
  // Outgoing side: a shared inbox has many possible senders, so a colleague's
  // (or the AI's) reply is attributed. Mine never is: my own bubbles are the
  // ones on the right that need no explaining.
  //
  // Incoming side: only where the peer's side can hold more than one party.
  // Contacts have no agent row and so no avatar — they get a sender name from
  // Message instead; this is the attribution for members, which is who the
  // other side is made of in a `local` room or a mirrored Slack channel.
  function getAgentAvatar(
    message: MessageRow,
  ): { agentId: string; color: string } | undefined {
    const agentId = message.agent_id;

    if (!agentId || agentId === activeAgentId) return undefined;

    if (
      messageDirection(message, activeAgentId, teamChat) === "incoming" &&
      !multiParty
    ) {
      return undefined;
    }

    return { agentId, color: colorMap.get(agentId)! };
  }

  function insertDateSeparators(
    chat: MessageRow[],
  ): (EnvelopeType | SeparatorType)[] {
    const _chat = [];

    let prevMsg: EnvelopeType | null = null;

    for (const env of chat.map(
      (message) => ({ message, first: false, last: false }) as EnvelopeType,
    )) {
      if (!prevMsg) {
        env.first = true;
        env.last = true;
      } else if (
        prevMsg.message.agent_id === env.message.agent_id &&
        messageDirection(prevMsg.message, activeAgentId, teamChat) ===
          messageDirection(env.message, activeAgentId, teamChat) &&
        prevMsg.message.sender_address === env.message.sender_address
      ) {
        prevMsg.last = false;
        env.last = true;
      } else if (
        prevMsg.message.agent_id !== env.message.agent_id ||
        messageDirection(prevMsg.message, activeAgentId, teamChat) !==
          messageDirection(env.message, activeAgentId, teamChat) ||
        prevMsg.message.sender_address !== env.message.sender_address
      ) {
        prevMsg.last = true;
        env.first = true;
        env.last = true;
      }

      if (
        !prevMsg ||
        dayjs(prevMsg.message.timestamp).isBefore(env.message.timestamp, "day")
      ) {
        _chat.push({
          text: formatDate(env.message.timestamp),
          first: true,
          last: true,
        } as SeparatorType);

        if (prevMsg) {
          prevMsg.last = true;
        }

        env.first = true;
      }

      _chat.push(env);

      prevMsg = env;
    }

    return _chat;
  }

  /* Actions that reset the unreads counter
   * ======================================
   *
   *   Inactive conversation
   *   ---------------------
   *   [x] Opening the conversation (conv goes active)
   *   [~] {X new messages} system message, it dissapears when conv goes inactive
   *   [ ] Scroll starts at system message
   *
   *   Active conversations
   *   --------------------
   *   [x] Sending a message
   *   [ ] Scrolling to bottom
   *
   * Scrolling behavior
   * ==================
   *
   * If at bottom, it sticks
   * New outgoing -> goes to bottom
   * New incoming -> stays at place
   *
   * Telegram:
   *   Remembers conv scroll position
   *   Re-activating the conv -> goes to bottom
   */

  useEffect(() => {
    const scrollerRef = scroller.current;

    if (!scrollerRef || !scroller.current) {
      return;
    }
  }, [messages.length, activeConvId]);

  useEffect(() => {
    scrollToBottom(false);
  }, [activeConvId]);

  // Keep the scroll at the bottom when new messages are added
  // prevent the scroll from jumping when the user is reading old messages
  useEffect(() => {
    const scrollRef = scroller.current;
    if (!scrollRef) {
      return;
    }
    scrollToBottom();
  }, [messages.length]);

  // Adjust scroll when visual viewport resizes (e.g. mobile keyboard opens)
  useEffect(() => {
    const handleResize = () => {
      scrollToBottom(false);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
      }
    };
  }, []);

  // If the role is not admin, then do not show internal messages (tool calls, etc).
  const envelopesAndSeparators = insertDateSeparators(
    messages
      .filter((m) => {
        if (hidden.includes(m.id)) return false;
        if (isAdmin) return true;

        // Hide internal messages for non-admin users
        if (isInternal(m)) return false;

        return true;
      })
      .reverse(),
  );

  const scrollToBottom = (isSmooth: boolean = true) => {
    if (scroller.current) {
      scroller.current.scrollTo({
        top: scroller.current.scrollHeight,
        behavior: isSmooth ? "smooth" : "instant",
      });
    }
  };

  return (
    activeConvId && (
      <div
        ref={scroller}
        className="grow pb-[8px] overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="flex justify-end gap-3 p-2 text-xs">
          <button className="text-muted-foreground underline" onClick={() => {
            if (window.confirm(currentLanguage === "es" ? "¿Limpiar tu vista en este navegador? El historial se conserva y puedes restaurarlo." : "Clear your view in this browser? History is kept and can be restored.")) saveHidden([...new Set([...hidden, ...messages.map(m => m.id)])]);
          }}>{currentLanguage === "es" ? "Limpiar mi vista" : "Clear my view"}</button>
          {hidden.length > 0 && <button className="text-primary underline" onClick={() => saveHidden([])}>{currentLanguage === "es" ? "Restaurar mensajes" : "Restore messages"}</button>}
        </div>
        <div className="flex flex-col">
          {envelopesAndSeparators.map((envOrSep, index) =>
            "message" in envOrSep ? (
              <div key={envOrSep.message.id} className="group relative">
              <button className="absolute right-2 top-0 z-20 rounded bg-background border border-border px-2 py-1 text-xs text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100" onClick={() => deleteFromView(envOrSep.message.id)}>{currentLanguage === "es" ? "Eliminar para mí" : "Delete for me"}</button>
              <Message
                message={envOrSep.message}
                first={envOrSep.first}
                last={envOrSep.last}
                orgName={orgName}
                convName={convName}
                multiParty={multiParty}
                avatar={getAgentAvatar(envOrSep.message)}
              />
              </div>
            ) : (
              <Separator key={index} text={envOrSep.text} />
            ),
          )}
        </div>
        {/* (
          <button
            style={{
              width: "42px",
              height: "42px",
              position: "fixed",
              bottom: "75px",
              right: "20px",
              backgroundColor: "#FFFFFF",
              borderRadius: "50%",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
            }}
            onClick={() => scrollToBottom()}
          >
            <ChevronDown className="w-8 h-8 pt-1 text-foreground" />
          </button>
        ) */}
      </div>
    )
  );
}
