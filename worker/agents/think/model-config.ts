import { ModelSize, type AIModelConfig } from '../inferutils/config.types';

export const THINK_MODEL_ID = 'anthropic/claude-sonnet-4-5';

export const THINK_MODEL_CONFIG: AIModelConfig = {
	name: 'Claude 4.5 Sonnet',
	size: ModelSize.LARGE,
	provider: 'anthropic',
	creditCost: 12,
	contextSize: 200_000,
};
