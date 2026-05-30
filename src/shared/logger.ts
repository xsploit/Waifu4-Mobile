export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogFields = Record<string, unknown>;

/** Pure formatter so log output is unit-testable without spying on console. */
export function formatLogLine(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields,
): string {
  const head = `[${level.toUpperCase()}] (${scope}) ${message}`;
  if (!fields || Object.keys(fields).length === 0) {
    return head;
  }
  const tail = Object.entries(fields)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(' ');
  return `${head} ${tail}`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export function createLogger(scope: string, minLevel: LogLevel = 'debug'): Logger {
  const min = LEVEL_ORDER[minLevel];
  const emit = (level: LogLevel, message: string, fields?: LogFields) => {
    if (LEVEL_ORDER[level] < min) {
      return;
    }
    const line = formatLogLine(level, scope, message, fields);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}
