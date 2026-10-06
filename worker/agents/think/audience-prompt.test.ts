import { describe, expect, it } from 'vitest';
import { buildAudienceSection } from './audience-prompt';

describe('buildAudienceSection', () => {
	const section = buildAudienceSection().join('\n');

	it('frames the reader as a rental business owner, not a developer', () => {
		expect(section).toContain('runs a rental business and is NOT a developer');
		expect(section).toContain('plain product language');
	});

	it('forbids the technical vocabulary that leaked into builder chats', () => {
		for (const term of ['file names or paths', 'consoles', 'logs', 'APIs', 'attributes', 'deploys', 'tool names']) {
			expect(section).toContain(term);
		}
	});

	it('asks for outcome-style reporting and minimal narration', () => {
		expect(section).toContain('Report checks and fixes as outcomes');
		expect(section).toContain('at most one short sentence');
		expect(section).toContain('Only go into technical detail if the user explicitly asks');
	});

	it('overrides the base prompt tone rules', () => {
		expect(section).toContain('overrides the tone rules above');
	});
});
