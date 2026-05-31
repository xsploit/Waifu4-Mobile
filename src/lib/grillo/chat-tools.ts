// @ts-nocheck
import { z } from "zod";

export interface ToolContext {
  userId: string;
  channelId: string;
  turnId: string;
  memorySearch: (
    query: string,
    limit: number,
  ) => Promise<
    Array<{
      id: string;
      text: string;
      score: number;
      metadata?: Record<string, unknown>;
    }>
  >;
  profileGet: () => Promise<Record<string, unknown> | null>;
  candidateWrite: (candidate: {
    type: string;
    content: string;
    summary: string;
    confidence: number;
  }) => Promise<{ candidate_id: string }>;
  diaryAppend: (entry: {
    summary: string;
    personal_thought: string;
    tags: string[];
    content?: string;
    interaction_summary?: string;
    user_message?: string;
    context_tags?: string[];
    involved_users?: string[];
    emotions?: Array<{
      name: string;
      intensity: number;
    }>;
  }) => Promise<{ diary_id: string }>;
  profileSetCandidate: (patch: {
    field: string;
    operation: "add" | "remove";
    value: string;
  }) => Promise<{ ok: boolean }>;
  tavilySearch?: (args: {
    query: string;
    max_results: number;
    search_depth: "basic" | "advanced";
    topic?: "general" | "news";
    include_answer?: boolean;
    include_images?: boolean;
    include_raw_content?: boolean;
  }) => Promise<Record<string, unknown>>;
  tavilyExtract?: (args: {
    urls: string[];
    extract_depth: "basic" | "advanced";
    include_images?: boolean;
  }) => Promise<Record<string, unknown>>;
  tavilyCrawl?: (args: {
    url: string;
    max_results: number;
    crawl_depth: "basic" | "advanced";
    include_images?: boolean;
  }) => Promise<Record<string, unknown>>;
  discordToolCall?: (action: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolDefinition {
  description: string;
  inputSchema: z.ZodType;
  timeoutMs: number;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => cleanJsonSchema(item));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "$schema") continue;
    out[key] = cleanJsonSchema(entry);
  }
  return out;
}

export function toolInputSchemaToJsonSchema(inputSchema: z.ZodType): Record<string, unknown> {
  const schema = cleanJsonSchema(z.toJSONSchema(inputSchema, { target: "draft-7" }));
  if (!isPlainObject(schema) || schema.type !== "object") {
    return {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
  }
  // Strip fields with defaults from required — models treat required fields as
  // mandatory friction, while the Python bot only requires truly mandatory params.
  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  if (Array.isArray(schema.required)) {
    schema.required = schema.required.filter((key: unknown) => {
      if (typeof key !== "string") return true;
      const prop = properties[key];
      return !(isPlainObject(prop) && "default" in prop);
    });
    if ((schema.required as string[]).length === 0) {
      delete schema.required;
    }
  }
  return schema;
}

export class ToolTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolTimeoutError";
  }
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label = "tool",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ToolTimeoutError(`Tool timed out (${label}) after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function buildCoreTools(
  ctx: ToolContext,
): Record<string, ToolDefinition> {
  const runWithTimeout = <T>(
    label: string,
    timeoutMs: number,
    fn: () => Promise<T>,
  ): Promise<T> => withTimeout(fn, timeoutMs, label);

  const tools: Record<string, ToolDefinition> = {};
  const registerTool = (
    toolId: string,
    description: string,
    inputSchema: z.ZodType,
    timeoutMs: number,
    execute: (args: Record<string, unknown>) => Promise<unknown>,
  ): void => {
    tools[toolId] = { description, inputSchema, timeoutMs, execute };
  };

  registerTool(
    "core.memory_search",
    "Search long-term memories for the current user by semantic query. Returns scored results.",
    z.object({
      query: z
        .string()
        .describe("The search query to find relevant memories"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("Maximum number of results to return"),
    }),
    5000,
    async (args) => {
      const { query, limit } = args as { query: string; limit: number };
      return runWithTimeout("core.memory_search", 5000, () => ctx.memorySearch(query, limit ?? 5));
    },
  );

  registerTool(
    "core.profile_get",
    "Retrieve the current user's relationship profile including tone preferences, interaction style, and boundaries.",
    z.object({}),
    3000,
    async () => {
      return runWithTimeout("core.profile_get", 3000, () => ctx.profileGet());
    },
  );

  registerTool(
    "core.memory_write_candidate",
    "Write a candidate memory for later promotion. Used when the user shares durable information worth remembering.",
    z.object({
      type: z
        .enum([
          "preference",
          "fact",
          "goal",
          "boundary",
          "bond_signal",
          "thread",
        ])
        .describe("The category of memory"),
      content: z
        .string()
        .describe("Full content of the memory to store"),
      summary: z
        .string()
        .describe("Brief summary of the memory"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("Confidence score for this memory (0-1)"),
    }),
    3000,
    async (args) => {
      const { type, content, summary, confidence } = args as {
        type: string;
        content: string;
        summary: string;
        confidence: number;
      };
      return runWithTimeout("core.memory_write_candidate", 3000, () =>
        ctx.candidateWrite({ type, content, summary, confidence }),
      );
    },
  );

  registerTool(
    "core.diary_append_candidate",
    "Append a diary entry reflecting on the current interaction. The summary is factual; personal_thought must be first person from the assistant's perspective and start with I, I'm, I've, I'd, I'll, My, or Me.",
    z.object({
      summary: z
        .string()
        .describe("Brief summary of the diary entry"),
      content: z
        .string()
        .optional()
        .describe("What the assistant said in this interaction"),
      interaction_summary: z
        .string()
        .optional()
        .describe("Compact summary of the interaction"),
      user_message: z
        .string()
        .optional()
        .describe("User message that prompted the interaction"),
      personal_thought: z
        .string()
        .describe("First-person personal reflection from the assistant's perspective. Must start with I, I'm, I've, I'd, I'll, My, or Me."),
      tags: z
        .array(z.string())
        .describe("Tags categorizing this diary entry"),
      context_tags: z
        .array(z.string())
        .optional()
        .describe("Context/topic tags for this interaction"),
      involved_users: z
        .array(z.string())
        .optional()
        .describe("People involved in this interaction"),
      emotions: z
        .array(
          z.object({
            name: z.string(),
            intensity: z.number().min(0).max(10),
          }),
        )
        .optional()
        .describe("Emotion tags with intensity (0..10)"),
    }),
    3000,
    async (args) => {
      const {
        summary,
        content,
        interaction_summary,
        user_message,
        personal_thought,
        tags,
        context_tags,
        involved_users,
        emotions,
      } = args as {
        summary: string;
        content?: string;
        interaction_summary?: string;
        user_message?: string;
        personal_thought: string;
        tags: string[];
        context_tags?: string[];
        involved_users?: string[];
        emotions?: Array<{ name: string; intensity: number }>;
      };
      return runWithTimeout("core.diary_append_candidate", 3000, () =>
        ctx.diaryAppend({
          summary,
          content,
          interaction_summary,
          user_message,
          personal_thought,
          tags,
          context_tags,
          involved_users,
          emotions,
        }),
      );
    },
  );

  registerTool(
    "core.profile_set_candidate",
    "Propose a change to the user's relationship profile. Changes are queued for promotion.",
    z.object({
      field: z
        .enum([
          "tone_preferences",
          "interaction_style",
          "boundaries",
          "active_threads",
        ])
        .describe("Profile field to modify"),
      operation: z
        .enum(["add", "remove"])
        .describe("Whether to add or remove the value"),
      value: z
        .string()
        .describe("The value to add or remove"),
    }),
    3000,
    async (args) => {
      const { field, operation, value } = args as {
        field: string;
        operation: "add" | "remove";
        value: string;
      };
      return runWithTimeout("core.profile_set_candidate", 3000, () =>
        ctx.profileSetCandidate({ field, operation, value }),
      );
    },
  );

  if (ctx.tavilySearch) {
    registerTool(
      "core.tavily_search",
      "Search the web for factual or recent information. Use this first to discover relevant pages and links.",
      z.object({
        query: z.string().describe("Search query to run."),
        search_depth: z.enum(["basic", "advanced"]).default("advanced").describe("Search depth; advanced is slower but broader."),
        max_results: z.number().int().min(1).max(10).default(5).describe("Number of results to return (1-10)."),
      }),
      20_000,
      async (args) => {
        const { query, search_depth, max_results } = args as {
          query: string;
          search_depth: "basic" | "advanced";
          max_results: number;
        };
        return runWithTimeout("core.tavily_search", 20_000, () => ctx.tavilySearch!({
          query,
          max_results: max_results ?? 5,
          search_depth: search_depth ?? "advanced",
          include_answer: true,
          include_images: false,
          include_raw_content: false,
        }));
      },
    );
  }

  if (ctx.tavilyExtract) {
    registerTool(
      "core.tavily_extract",
      "Extract cleaned page content from specific URLs. Use after tavily_search when you need deeper details from selected links.",
      z.object({
        urls: z.array(z.string()).min(1).max(20).describe("One or more URLs to extract."),
        extract_depth: z.enum(["basic", "advanced"]).default("basic").describe("Extraction depth; advanced may return richer content."),
        max_results: z.number().int().min(1).max(10).default(5).describe("Maximum extracted items to return in tool output."),
      }),
      20_000,
      async (args) => {
        const { urls, extract_depth } = args as {
          urls: string[];
          extract_depth: "basic" | "advanced";
        };
        return runWithTimeout("core.tavily_extract", 20_000, () => ctx.tavilyExtract!({
          urls,
          extract_depth: extract_depth ?? "basic",
          include_images: false,
        }));
      },
    );
  }

  if (ctx.tavilyCrawl) {
    registerTool(
      "core.tavily_crawl",
      "Crawl a site from a starting URL and return discovered page content. Use this for broader multi-page collection.",
      z.object({
        url: z.string().describe("Starting URL to crawl."),
        extract_depth: z.enum(["basic", "advanced"]).default("basic").describe("Content depth for crawled pages."),
        max_results: z.number().int().min(1).max(30).default(10).describe("Maximum crawled items to return in tool output."),
      }),
      25_000,
      async (args) => {
        const { url, extract_depth, max_results } = args as {
          url: string;
          extract_depth: "basic" | "advanced";
          max_results: number;
        };
        return runWithTimeout("core.tavily_crawl", 25_000, () => ctx.tavilyCrawl!({
          url,
          max_results: max_results ?? 10,
          crawl_depth: (extract_depth ?? "basic") as "basic" | "advanced",
          include_images: false,
        }));
      },
    );
  }

  if (ctx.discordToolCall) {
    const runDiscord = (
      toolId: string,
      action: string,
      timeoutMs: number,
      args: Record<string, unknown>,
    ): Promise<unknown> =>
      runWithTimeout(toolId, timeoutMs, () => ctx.discordToolCall!(action, args));

    registerTool(
      "core.discord_bot_status",
      "Get bot runtime status, gateway state, and connected server counts.",
      z.object({}),
      5000,
      async () => runDiscord("core.discord_bot_status", "bot_status", 5000, {}),
    );

    registerTool(
      "core.discord_list_guilds",
      "List guilds (servers) the bot can access.",
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
      }),
      8000,
      async (args) => runDiscord("core.discord_list_guilds", "list_guilds", 8000, args),
    );

    registerTool(
      "core.discord_get_guild",
      "Get detailed metadata for one guild.",
      z.object({
        guild_id: z.string().optional().describe("Guild id. Defaults to current message guild."),
      }),
      8000,
      async (args) => runDiscord("core.discord_get_guild", "get_guild", 8000, args),
    );

    registerTool(
      "core.discord_list_channels",
      "List channels in a guild.",
      z.object({
        guild_id: z.string().optional().describe("Guild id. Defaults to current message guild."),
        limit: z.number().int().min(1).max(250).default(100),
      }),
      8000,
      async (args) => runDiscord("core.discord_list_channels", "list_channels", 8000, args),
    );

    registerTool(
      "core.discord_get_channel",
      "Get metadata for a channel by id.",
      z.object({
        channel_id: z.string().describe("Channel id."),
      }),
      8000,
      async (args) => runDiscord("core.discord_get_channel", "get_channel", 8000, args),
    );

    registerTool(
      "core.discord_list_members",
      "List guild members/users and optional name search.",
      z.object({
        guild_id: z.string().optional().describe("Guild id. Defaults to current message guild."),
        limit: z.number().int().min(1).max(200).default(50),
        query: z.string().optional().describe("Optional prefix query for member search."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_list_members", "list_members", 10_000, args),
    );

    registerTool(
      "core.discord_get_user",
      "Get user profile details and optional guild membership details.",
      z.object({
        user_id: z.string().describe("Discord user id."),
        guild_id: z.string().optional().describe("Optional guild id for member details."),
      }),
      8000,
      async (args) => runDiscord("core.discord_get_user", "get_user", 8000, args),
    );

    registerTool(
      "core.discord_read_channel_messages",
      "Read recent messages from a text channel.",
      z.object({
        channel_id: z.string().optional().describe("Target channel id. Defaults to current channel."),
        limit: z.number().int().min(1).max(50).default(12),
      }),
      10_000,
      async (args) => runDiscord("core.discord_read_channel_messages", "read_channel_messages", 10_000, args),
    );

    registerTool(
      "core.discord_get_message",
      "Fetch one message by channel and message id.",
      z.object({
        channel_id: z.string().describe("Channel id."),
        message_id: z.string().describe("Message id."),
      }),
      8000,
      async (args) => runDiscord("core.discord_get_message", "get_message", 8000, args),
    );

    registerTool(
      "core.discord_send_message",
      "Send a message to the current channel, or a target channel in the same guild.",
      z.object({
        content: z.string().describe("Message text to send."),
        channel_id: z.string().optional().describe("Optional target channel id. Defaults to current channel."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_send_message", "send_message", 10_000, args),
    );

    registerTool(
      "core.discord_reply_to_message",
      "Reply to a specific message id in the current channel.",
      z.object({
        content: z.string().describe("Reply text to send."),
        message_id: z.string().optional().describe("Message id to reply to."),
        channel_id: z.string().optional().describe("Optional channel id. Defaults to current channel."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_reply_to_message", "reply_to_message", 10_000, args),
    );

    registerTool(
      "core.discord_send_dm",
      "Send a DM to a specific user id.",
      z.object({
        user_id: z.string().describe("Target user id."),
        content: z.string().describe("DM content."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_send_dm", "send_dm", 10_000, args),
    );

    registerTool(
      "core.discord_read_dm_history",
      "Read recent DM messages with a specific user id.",
      z.object({
        user_id: z.string().describe("Target user id."),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      10_000,
      async (args) => runDiscord("core.discord_read_dm_history", "read_dm_history", 10_000, args),
    );

    registerTool(
      "core.discord_edit_message",
      "Edit a Discord message by id.",
      z.object({
        message_id: z.string().describe("Message id to edit."),
        content: z.string().describe("New message content."),
        channel_id: z.string().optional().describe("Optional channel id. Defaults to current channel."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_edit_message", "edit_message", 10_000, args),
    );

    registerTool(
      "core.discord_delete_message",
      "Delete a message by id.",
      z.object({
        message_id: z.string().describe("Message id to delete."),
        channel_id: z.string().optional().describe("Optional channel id. Defaults to current channel."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_delete_message", "delete_message", 10_000, args),
    );

    registerTool(
      "core.discord_add_reaction",
      "Add an emoji reaction to a message.",
      z.object({
        message_id: z.string().describe("Message id to react to."),
        emoji: z.string().describe("Emoji string (unicode or custom emoji)."),
        channel_id: z.string().optional().describe("Optional channel id. Defaults to current channel."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_add_reaction", "add_reaction", 10_000, args),
    );

    registerTool(
      "core.discord_pin_message",
      "Pin a message in a channel.",
      z.object({
        message_id: z.string().describe("Message id to pin."),
        channel_id: z.string().optional().describe("Optional channel id. Defaults to current channel."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_pin_message", "pin_message", 10_000, args),
    );

    registerTool(
      "core.discord_unpin_message",
      "Unpin a message in a channel.",
      z.object({
        message_id: z.string().describe("Message id to unpin."),
        channel_id: z.string().optional().describe("Optional channel id. Defaults to current channel."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_unpin_message", "unpin_message", 10_000, args),
    );

    registerTool(
      "core.discord_timeout_member",
      "Timeout a guild member for N minutes. Dangerous moderation action.",
      z.object({
        user_id: z.string().describe("User id to timeout."),
        minutes: z.number().int().min(1).max(10080),
        reason: z.string().optional().describe("Optional moderation reason."),
      }),
      10_000,
      async (args) => {
        const { user_id, minutes, reason } = args as { user_id: string; minutes: number; reason?: string };
        return runDiscord("core.discord_timeout_member", "timeout_member", 10_000, { user_id, duration_minutes: minutes, reason });
      },
    );

    registerTool(
      "core.discord_remove_timeout_member",
      "Remove timeout from a guild member. Dangerous moderation action.",
      z.object({
        user_id: z.string().describe("User id to un-timeout."),
        reason: z.string().optional().describe("Optional moderation reason."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_remove_timeout_member", "remove_timeout_member", 10_000, args),
    );

    registerTool(
      "core.discord_kick_member",
      "Kick a guild member. Dangerous moderation action.",
      z.object({
        user_id: z.string().describe("User id to kick."),
        reason: z.string().optional().describe("Optional moderation reason."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_kick_member", "kick_member", 10_000, args),
    );

    registerTool(
      "core.discord_ban_member",
      "Ban a guild member. Dangerous moderation action.",
      z.object({
        user_id: z.string().describe("User id to ban."),
        delete_message_days: z.number().int().min(0).max(7).optional(),
        reason: z.string().optional().describe("Optional moderation reason."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_ban_member", "ban_member", 10_000, args),
    );

    registerTool(
      "core.discord_unban_member",
      "Unban a user by user id. Dangerous moderation action.",
      z.object({
        user_id: z.string().describe("User id to unban."),
        reason: z.string().optional().describe("Optional moderation reason."),
      }),
      10_000,
      async (args) => runDiscord("core.discord_unban_member", "unban_member", 10_000, args),
    );
  }

  return tools;
}
