/**
 * `deploy_space` — commits the working tree (a durable git snapshot in the
 * SpaceDO) and then builds + deploys the branch **in a Cloudflare Container**
 * sandbox, so the preview at `<name>.booqableapps.com` rebuilds. The skills
 * (see `skills/app-file-structure`) instruct the model to call this after
 * writing files; pair it with `get_browser_console_logs` to verify the preview.
 *
 * Why the container and not the SpaceDO: the SpaceDO's in-isolate bundler hits
 * the 128 MB Durable Object memory wall on our dep-rich template (full shadcn +
 * recharts + ~30 radix pkgs, ~1700 modules) and OOMs on every deploy. The
 * sandbox container has no such wall — it is the same build surface the agentic
 * flow uses. So we keep the durable git in the SpaceDO (via `getBranchFiles`)
 * and route only the memory-heavy build+deploy through `getSandboxService`.
 *
 * `envVars` is the "secrets from the start" hook: whatever the host threads in
 * is present in the container from the first build, so the deployed worker can
 * talk to Booqable without a separate post-deploy secret push.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { BaseSandboxService } from '../../services/sandbox/BaseSandboxService';
import type { TemplateFile } from '../../services/sandbox/sandboxTypes';
import { withDurableObjectResetRetry, type SpaceWorkspaceStub } from './space-workspace-ops';

const DESCRIPTION = [
	'Commit the current working tree and build + deploy a branch so its preview rebuilds and serves the latest code.',
	'',
	'Call this after writing/editing files to make changes visible in the preview. Returns the deploy result as JSON, including the preview URL and any build/runtime errors — read those errors and fix the code if the build failed, then redeploy.',
	'',
	"Defaults to the 'main' branch.",
].join('\n');

/** Bounded wait for the sandbox dev server to come up before we deploy. */
const HEALTH_POLL_ATTEMPTS = 20;
const HEALTH_POLL_INTERVAL_MS = 3000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DeploySpaceToolDeps {
	/** SpaceDO stub — holds the durable git and yields the branch tree. */
	getStub: () => SpaceWorkspaceStub;
	/** Sandbox service for THIS session (container build surface). */
	getSandbox: () => BaseSandboxService;
	/** Project/worker name used for the deploy (dispatch namespace subdomain). */
	projectName: string;
	/** Secrets injected into the container from the first build. */
	envVars?: Record<string, string>;
	/** Persisted sandbox instance id (survives hibernation). */
	getInstanceId: () => string | undefined;
	setInstanceId: (id: string | undefined) => void;
}

export function createDeploySpaceTool(deps: DeploySpaceToolDeps): Tool {
	const { getStub, getSandbox, projectName, envVars, getInstanceId, setInstanceId } = deps;

	return tool({
		description: DESCRIPTION,
		inputSchema: z.object({
			branch: z
				.string()
				.optional()
				.describe("Git branch to deploy. Defaults to 'main'."),
		}),
		execute: async (args: { branch?: string }) => {
			const branch = args.branch && args.branch.length > 0 ? args.branch : 'main';

			// 1. Durable snapshot of the working tree (git lives in the SpaceDO).
			try {
				await withDurableObjectResetRetry(getStub, (stub) =>
					stub.gitCommit('deploy: snapshot working tree'),
				);
			} catch {
				// Clean tree / nothing to commit — deploy the existing HEAD.
			}

			// 2. Read the branch tree out of the SpaceDO.
			let files: TemplateFile[];
			try {
				files = (await withDurableObjectResetRetry(getStub, (stub) =>
					stub.getBranchFiles(branch),
				)) as TemplateFile[];
			} catch (e) {
				return JSON.stringify({
					branch,
					error: `Could not read branch files: ${e instanceof Error ? e.message : String(e)}`,
				});
			}
			if (!files || files.length === 0) {
				return JSON.stringify({ branch, error: `Branch "${branch}" has no files to deploy.` });
			}

			// 3. Ensure a container instance holds the latest files.
			const sandbox = getSandbox();
			let instanceId: string | undefined = getInstanceId();
			try {
				instanceId = await ensureInstance(sandbox, instanceId, files, projectName, envVars);
			} catch (e) {
				return JSON.stringify({
					branch,
					error: `Failed to start sandbox build: ${e instanceof Error ? e.message : String(e)}`,
				});
			}
			setInstanceId(instanceId);

			// 4. Wait (bounded) for the dev server, then deploy from the container.
			const status = await waitForHealthy(sandbox, instanceId);
			let deployedUrl: string | undefined = status?.previewURL;
			let deployed = false;
			let deployError: string | undefined;
			try {
				const result = await sandbox.deployToCloudflareWorkers(instanceId, 'platform');
				deployed = Boolean(result?.success);
				deployedUrl = result?.deployedUrl ?? deployedUrl;
				if (!deployed) deployError = result?.error ?? 'Deploy reported failure';
			} catch (e) {
				deployError = e instanceof Error ? e.message : String(e);
			}

			// 5. Surface build/runtime errors so the model can self-correct.
			const buildErrors = await collectErrors(sandbox, instanceId);

			return JSON.stringify(
				{
					branch,
					instance_id: instanceId,
					deployed,
					preview_url: deployedUrl,
					...(deployError ? { error: `Deploy failed: ${deployError}` } : {}),
					...(buildErrors.length > 0 ? { build_errors: buildErrors } : {}),
				},
				null,
				2,
			);
		},
	});
}

/**
 * Reuse the existing container instance when it is still healthy (just push the
 * new files), otherwise boot a fresh one seeded with the whole tree + secrets.
 */
async function ensureInstance(
	sandbox: BaseSandboxService,
	instanceId: string | undefined,
	files: TemplateFile[],
	projectName: string,
	envVars: Record<string, string> | undefined,
): Promise<string> {
	if (instanceId) {
		try {
			const status = await sandbox.getInstanceStatus(instanceId);
			if (status?.success && status.isHealthy) {
				await sandbox.writeFiles(instanceId, files, 'deploy: sync working tree');
				return instanceId;
			}
		} catch {
			// Instance is gone/unreachable — fall through and create a fresh one.
		}
	}
	const created = await sandbox.createInstance({
		files,
		projectName,
		initCommand: 'bun run dev',
		envVars: envVars ?? {},
	});
	if (!created?.success || !created.runId) {
		throw new Error(created?.error || 'Sandbox did not return an instance id');
	}
	return created.runId;
}

async function waitForHealthy(sandbox: BaseSandboxService, instanceId: string) {
	for (let attempt = 0; attempt < HEALTH_POLL_ATTEMPTS; attempt++) {
		try {
			const status = await sandbox.getInstanceStatus(instanceId);
			if (status?.success && status.isHealthy && !status.pending) return status;
		} catch {
			// transient — keep polling
		}
		await sleep(HEALTH_POLL_INTERVAL_MS);
	}
	// Never went healthy in time; deploy anyway (the build step is what matters)
	// and let the returned errors tell the model what went wrong.
	return null;
}

async function collectErrors(sandbox: BaseSandboxService, instanceId: string): Promise<string[]> {
	try {
		const res = await sandbox.getInstanceErrors(instanceId);
		const errors = (res as { errors?: Array<{ message?: string }> })?.errors ?? [];
		return errors.map((e) => e?.message ?? String(e)).filter(Boolean);
	} catch {
		return [];
	}
}
