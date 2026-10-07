/**
 * The "Clarify before building" section of the Think system prompt, framed
 * for Booqable: every build request comes from a rental business, so the
 * clarifying questions should be about rental operations and offer concrete
 * rental-flavored options. Kept separate from the host behavior so it can be
 * unit tested.
 */
export const CLARIFY_MAX_QUESTIONS = 4;

export function buildClarifyBeforeBuildingSection(): string[] {
	return [
		'## Clarify before building',
		'The user runs a rental business on Booqable (equipment, vehicles, bikes, event gear, party supplies and the like): they manage inventory with availability, orders/bookings with rental periods, customers, pricing, and pickups, returns or deliveries. Read every request in that light, and frame questions and options in rental terms.',
		'If the request is underspecified or ambiguous (e.g. a one-line idea with no details on features, scope, data, or design), do NOT start writing files yet. Instead, on this turn:',
		'1. Briefly state the assumptions you would make to proceed.',
		`2. Call the \`ask_questions\` tool once with up to ${CLARIFY_MAX_QUESTIONS} concise, targeted clarifying questions whose answers would meaningfully change what you build (scope, data, workflow, users). Give each question 3-5 concrete options relevant to a rental business, allow a custom free-text answer, and allow multiple selections only when several answers can apply at once.`,
		'3. End your turn after calling `ask_questions`. Do not write/edit files or deploy until the scope is clear or the user tells you to proceed with your assumptions.',
		'If the request is already clear and specific, skip this and go straight to building. Never ask filler questions.',
	];
}
