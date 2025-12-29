/**
 * Log levels supported by the logger.
 */
export type LogLevelType = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log level priority for filtering.
 */
const LOG_LEVEL_PRIORITY: Record<LogLevelType, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

/**
 * Logger interface used throughout Kustodian.
 */
export interface LoggerType {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): LoggerType;
}

/**
 * Console logger implementation.
 */
export interface ConsoleLoggerOptionsType {
  level?: LogLevelType;
  context?: Record<string, unknown>;
  timestamp?: boolean;
}

function format_timestamp(): string {
  return new Date().toISOString();
}

function format_context(context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) {
    return '';
  }
  return ` ${JSON.stringify(context)}`;
}

function should_log(current_level: LogLevelType, message_level: LogLevelType): boolean {
  return LOG_LEVEL_PRIORITY[message_level] >= LOG_LEVEL_PRIORITY[current_level];
}

/**
 * Creates a console logger.
 */
export function create_console_logger(options: ConsoleLoggerOptionsType = {}): LoggerType {
  const level = options.level ?? 'info';
  const base_context = options.context ?? {};
  const show_timestamp = options.timestamp ?? true;

  function log(
    message_level: LogLevelType,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (!should_log(level, message_level)) {
      return;
    }

    const merged_context = { ...base_context, ...context };
    const timestamp = show_timestamp ? `[${format_timestamp()}] ` : '';
    const level_tag = `[${message_level.toUpperCase()}]`;
    const context_str = format_context(merged_context);
    const formatted = `${timestamp}${level_tag} ${message}${context_str}`;

    switch (message_level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    child: (context) =>
      create_console_logger({
        level,
        context: { ...base_context, ...context },
        timestamp: show_timestamp,
      }),
  };
}

/**
 * Creates a silent logger that discards all messages.
 */
export function create_silent_logger(): LoggerType {
  const noop = (): void => {};
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => create_silent_logger(),
  };
}
