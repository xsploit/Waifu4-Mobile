import { randomUUID } from "node:crypto";
import type { StorageRepository } from "./storage-repository";

export interface ChatLinkRecord {
  schema_version: "1.0.0";
  link_id: string;
  interface: string;
  interface_path: string;
  chat_name?: string;
  message_thread_name?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function compact(value: string, maxLen = 160): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function nowIso(input?: string): string {
  if (input && Number.isFinite(Date.parse(input))) return input;
  return new Date().toISOString();
}

export function listChatLinks(storage: StorageRepository, interfaceName?: string): ChatLinkRecord[] {
  const rows = storage.readAll<Record<string, unknown>>("chat_links");
  return rows
    .filter((row) => String(row["schema_version"] || "") === "1.0.0")
    .filter((row) => (interfaceName ? String(row["interface"] || "") === interfaceName : true))
    .map((row): ChatLinkRecord => ({
      schema_version: "1.0.0",
      link_id: String(row["link_id"] || ""),
      interface: String(row["interface"] || ""),
      interface_path: String(row["interface_path"] || ""),
      chat_name: String(row["chat_name"] || "") || undefined,
      message_thread_name: String(row["message_thread_name"] || "") || undefined,
      metadata: typeof row["metadata"] === "object" && row["metadata"] ? (row["metadata"] as Record<string, unknown>) : undefined,
      created_at: nowIso(String(row["created_at"] || "")),
      updated_at: nowIso(String(row["updated_at"] || "")),
    }))
    .filter((row) => row.link_id.length && row.interface.length && row.interface_path.length);
}

export function upsertChatLink(
  storage: StorageRepository,
  input: {
    interface: string;
    interfacePath: string;
    chatName?: string;
    messageThreadName?: string;
    metadata?: Record<string, unknown>;
    nowIso?: string;
  },
): ChatLinkRecord {
  const now = nowIso(input.nowIso);
  const rows = listChatLinks(storage);
  const interfaceName = String(input.interface || "").trim().toLowerCase();
  const interfacePath = String(input.interfacePath || "").trim();
  const existing = rows.find((row) => row.interface === interfaceName && row.interface_path === interfacePath);

  const next: ChatLinkRecord = existing
    ? {
        ...existing,
        chat_name: input.chatName ? compact(input.chatName, 180) : existing.chat_name,
        message_thread_name: input.messageThreadName
          ? compact(input.messageThreadName, 180)
          : existing.message_thread_name,
        metadata: input.metadata ? { ...(existing.metadata || {}), ...input.metadata } : existing.metadata,
        updated_at: now,
      }
    : {
        schema_version: "1.0.0",
        link_id: randomUUID(),
        interface: interfaceName,
        interface_path: interfacePath,
        chat_name: input.chatName ? compact(input.chatName, 180) : undefined,
        message_thread_name: input.messageThreadName ? compact(input.messageThreadName, 180) : undefined,
        metadata: input.metadata,
        created_at: now,
        updated_at: now,
      };

  const replaced = rows.filter((row) => row.link_id !== next.link_id);
  replaced.push(next);
  storage.replaceAll("chat_links", replaced as unknown as Record<string, unknown>[]);
  return next;
}

export function resolveChatLinkByPath(
  storage: StorageRepository,
  interfacePath: string,
): ChatLinkRecord | null {
  const target = String(interfacePath || "").trim();
  if (!target.length) return null;
  const rows = listChatLinks(storage);
  return rows.find((row) => row.interface_path === target) || null;
}

export function resolveChatLinksByName(
  storage: StorageRepository,
  args: {
    interface?: string;
    chatName?: string;
    messageThreadName?: string;
  },
): ChatLinkRecord[] {
  const interfaceName = String(args.interface || "").trim().toLowerCase();
  const chatName = String(args.chatName || "").trim().toLowerCase();
  const threadName = String(args.messageThreadName || "").trim().toLowerCase();

  return listChatLinks(storage, interfaceName || undefined).filter((row) => {
    const rowChat = String(row.chat_name || "").trim().toLowerCase();
    const rowThread = String(row.message_thread_name || "").trim().toLowerCase();
    if (chatName.length && rowChat !== chatName) return false;
    if (threadName.length && rowThread !== threadName) return false;
    return true;
  });
}
