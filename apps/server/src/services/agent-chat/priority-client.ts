import type { HermesClient } from '../hermes/client.interface.js';

export interface ModelFallbackEvent { from: string; to: string }
export class ModelPriorityExhaustedError extends Error {
  constructor(cause: Error) { super(cause.message, { cause }); this.name = 'ModelPriorityExhaustedError'; }
}

/** Only explicit provider/model rejection, never a missing API route or timeout. */
function canFallback(error: unknown): boolean {
  if (!(error instanceof Error) || /timeout|timed out|abort/i.test(error.name + ' ' + error.message)) return false;
  const message = error.message;
  // Read only the transport's status prefix, never a number inside the body.
  const status = Number(/^(?:Hermes|Mock gateway) (?:chat|session chat|startRun) error: (\d{3})\b/.exec(message)?.[1]);
  return status === 402 || ((status === 400 || status === 404) && /model|deployment/i.test(message));
}

/** Decorate the existing transport; all non-generating methods remain bound. */
export function withModelPriority(
  client: HermesClient,
  priority: string[],
  safety: string | undefined,
  onFallback: (event: ModelFallbackEvent) => void
): HermesClient {
  const candidates = [...new Set([...priority, ...(safety?.trim() ? [safety.trim()] : [])])];
  if (priority.length === 0) return client;

  async function attempt<T>(
    requested: string | undefined,
    run: (model: string, markStarted: () => void) => Promise<T>
  ): Promise<T> {
    const initial = requested || candidates[0]!;
    const at = candidates.indexOf(initial);
    const models = at < 0 ? [initial] : candidates.slice(at);
    for (let i = 0; i < models.length; i++) {
      let started = false;
      try {
        return await run(models[i]!, () => { started = true; });
      } catch (error) {
        // A run accepted by the gateway may already have tool side effects.
        // Never replay it or concatenate answers from different models.
        if (started || !canFallback(error)) throw error;
        if (i === models.length - 1) throw new ModelPriorityExhaustedError(error as Error);
        onFallback({ from: models[i]!, to: models[i + 1]! });
      }
    }
    throw new Error('Tidak ada model prioritas.');
  }

  const methods: Partial<HermesClient> = {
    startRun: (params) => attempt(params.model, (model) => client.startRun({ ...params, model })),
    runChatStream: (params, handlers) => attempt(params.model, (model, started) => client.runChatStream(
      { ...params, model },
      {
        ...handlers,
        onRunId: (id) => { started(); handlers.onRunId?.(id, model); },
        onEvent: (event, data) => { started(); handlers.onEvent?.(event, data); },
        onDelta: (delta) => { started(); handlers.onDelta(delta); },
        onDone: () => { started(); handlers.onDone(); },
        onError: (message) => { started(); handlers.onError?.(message); },
      }
    )),
    chatStream: (messages, onChunk, model, prompt) => attempt(model, (next, started) =>
      client.chatStream(messages, (chunk) => { started(); onChunk(chunk); }, next, prompt)),
    sessionChatStream: (id, message, onDelta, model, prompt) => attempt(model, (next, started) =>
      client.sessionChatStream(id, message, (delta) => { started(); onDelta(delta); }, next, prompt)),
  };
  return new Proxy(client, {
    get(target, property) {
      const override = Reflect.get(methods, property);
      if (override) return override;
      const value: unknown = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
