import { describe, expect, it, vi } from 'vitest';
import { createSpaceWorkspaceOps, type SpaceWorkspaceStub } from './space-workspace-ops';

function mockStub() {
	return {
		writeFile: vi.fn(async () => undefined),
		rm: vi.fn(async () => undefined),
		readFile: vi.fn(async () => ''),
		readFileBytes: vi.fn(async () => null),
		mkdir: vi.fn(async () => undefined),
		readDir: vi.fn(async () => []),
		glob: vi.fn(async () => []),
		stat: vi.fn(async () => null),
	} as unknown as SpaceWorkspaceStub & {
		writeFile: ReturnType<typeof vi.fn>;
		rm: ReturnType<typeof vi.fn>;
	};
}

const PROTECTED = ['worker/index.ts', 'worker/core-utils.ts', 'src/lib/booqable.ts', 'src/lib/booqable/'];

describe('createSpaceWorkspaceOps dontTouchFiles guard', () => {
	it('blocks writes to protected files and never touches the space', async () => {
		const stub = mockStub();
		const ops = createSpaceWorkspaceOps(() => stub, PROTECTED);

		for (const path of ['worker/index.ts', 'src/lib/booqable.ts', 'src/lib/booqable/index.js']) {
			await expect(ops.writeFile(path, 'x')).rejects.toThrow(/protected/i);
		}
		expect(stub.writeFile).not.toHaveBeenCalled();
	});

	it('blocks deletes of protected files', async () => {
		const stub = mockStub();
		const ops = createSpaceWorkspaceOps(() => stub, PROTECTED);

		await expect(ops.rm('worker/core-utils.ts')).rejects.toThrow(/protected/i);
		expect(stub.rm).not.toHaveBeenCalled();
	});

	it('allows writes to editable files (e.g. userRoutes.ts, app pages)', async () => {
		const stub = mockStub();
		const ops = createSpaceWorkspaceOps(() => stub, PROTECTED);

		await ops.writeFile('worker/userRoutes.ts', 'routes');
		await ops.writeFile('src/pages/HomePage.tsx', 'page');

		expect(stub.writeFile).toHaveBeenCalledTimes(2);
	});

	it('allows everything when no protected paths are configured', async () => {
		const stub = mockStub();
		const ops = createSpaceWorkspaceOps(() => stub);

		await ops.writeFile('worker/index.ts', 'x');
		expect(stub.writeFile).toHaveBeenCalledOnce();
	});
});
