import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, type Database } from "@/supabase/client";

export type WorkspaceSource = {
  reference: number;
  id: string;
  conversation_id: string;
  phone: string;
  timestamp: string;
  author: string;
  text: string;
  contact_name?: string;
};
export type WorkspaceAnswer = {
  answer: string;
  sources: WorkspaceSource[];
  limited: boolean;
};
export type WorkspaceTurn = {
  role: "user" | "assistant";
  content: string;
  result?: WorkspaceAnswer;
};
export type SavedWorkspaceChat = {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  turns: WorkspaceTurn[];
  updated_at: string;
  created_at: string;
};
type ChatDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      workspace_chats: {
        Row: SavedWorkspaceChat;
        Insert: {
          organization_id: string;
          user_id: string;
          title: string;
          turns: WorkspaceTurn[];
        };
        Update: { title?: string; turns?: WorkspaceTurn[] };
        Relationships: [];
      };
    };
  };
};
// Extend only this client's table contract; do not edit generated database types.
const client = supabase as unknown as SupabaseClient<ChatDatabase>;
export async function listWorkspaceChats(org: string, user: string) {
  const { data, error } = await client
    .from("workspace_chats")
    .select("id,title,updated_at")
    .eq("organization_id", org)
    .eq("user_id", user)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}
export async function loadWorkspaceChat(id: string, org: string, user: string) {
  const { data, error } = await client
    .from("workspace_chats")
    .select()
    .eq("id", id)
    .eq("organization_id", org)
    .eq("user_id", user)
    .single();
  if (error) throw error;
  return data;
}
export async function saveWorkspaceChat(
  org: string,
  user: string,
  turns: WorkspaceTurn[],
  existing?: { id: string; updated_at: string },
) {
  if (turns.length > 100)
    throw new Error("Start a new chat to keep this history manageable.");
  const title =
    turns.find((turn) => turn.role === "user")?.content.slice(0, 100) ||
    "New chat";
  const storedTurns = turns.map((turn) => ({
    ...turn,
    result: turn.result
      ? {
          ...turn.result,
          sources: turn.result.sources.map((source) => ({
            ...source,
            text:
              source.text.length > 400
                ? `${source.text.slice(0, 400)}…`
                : source.text,
          })),
        }
      : undefined,
  }));
  if (JSON.stringify(storedTurns).length > 250000)
    throw new Error("Start a new chat to keep this history manageable.");
  const row = { title, turns: storedTurns };
  const query = existing
    ? client
        .from("workspace_chats")
        .update(row)
        .eq("id", existing.id)
        .eq("organization_id", org)
        .eq("user_id", user)
        .eq("updated_at", existing.updated_at)
    : client
        .from("workspace_chats")
        .insert({ ...row, organization_id: org, user_id: user });
  const { data, error } = await query.select("id,title,updated_at").single();
  if (error) throw error;
  return data;
}
