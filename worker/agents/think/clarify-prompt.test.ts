import { describe, expect, it } from 'vitest';
import { CLARIFY_MAX_QUESTIONS, buildClarifyBeforeBuildingSection } from './clarify-prompt';

describe('buildClarifyBeforeBuildingSection', () => {
	const section = buildClarifyBeforeBuildingSection().join('\n');

	it('frames the request as coming from a rental business on Booqable', () => {
		expect(section).toContain('rental business on Booqable');
		expect(section).toContain('frame questions and options in rental terms');
	});

	it('bounds the questions and shapes their options for rental businesses', () => {
		expect(section).toContain(`up to ${CLARIFY_MAX_QUESTIONS} concise`);
		expect(section).toContain('3-5 concrete options relevant to a rental business');
		expect(section).toContain('allow a custom free-text answer');
		expect(section).toContain('allow multiple selections only when several answers can apply at once');
	});

	it('keeps the ask_questions turn contract and skips filler questions', () => {
		expect(section).toContain('Call the `ask_questions` tool once');
		expect(section).toContain('End your turn after calling `ask_questions`');
		expect(section).toContain('Never ask filler questions');
	});
});
