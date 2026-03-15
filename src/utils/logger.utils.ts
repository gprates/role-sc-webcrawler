type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export const createLogger = (context: string) => ({
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.log(`[${context}] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[${context}] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>) =>
    console.error(`[${context}] ${msg}`, meta ?? ''),
  debug: (msg: string, meta?: Record<string, unknown>) =>
    console.debug(`[${context}] ${msg}`, meta ?? ''),
});

export type Logger = ReturnType<typeof createLogger>;
