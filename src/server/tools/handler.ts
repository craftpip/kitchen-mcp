import { KitchenError, ErrorCode } from '../../shared/errors/catalogue.js';
import { error } from '../../shared/response.js';

export async function toolHandler<T>(
  fn: () => Promise<T> | T,
): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    const result = await fn();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  } catch (err: unknown) {
    if (err instanceof KitchenError) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(error(err.code, err.message, {
            details: err.details,
            recoverable: err.recoverable,
            suggested_actions: err.suggestedActions,
          })),
        }],
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(error(ErrorCode.INTERNAL_ERROR, message)),
      }],
    };
  }
}
