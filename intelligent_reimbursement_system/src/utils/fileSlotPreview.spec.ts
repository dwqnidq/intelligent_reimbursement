import { describe, expect, it } from 'vitest';
import { resolveFileSlotBlobUrl } from './fileSlotPreview';

describe('resolveFileSlotBlobUrl', () => {
	const files = [{ uid: 'a' }, { uid: 'b' }];
	const urls = new Map<string, string>([
		['a', 'blob:a'],
		['b', 'blob:b'],
	]);

	it('resolves blob url by 1-based file index regardless of recognition fields', () => {
		expect(resolveFileSlotBlobUrl(files, 1, urls)).toBe('blob:a');
		expect(resolveFileSlotBlobUrl(files, 2, urls)).toBe('blob:b');
	});

	it('returns null when file or blob is missing', () => {
		expect(resolveFileSlotBlobUrl(files, 3, urls)).toBeNull();
		expect(resolveFileSlotBlobUrl(files, 1, new Map())).toBeNull();
		expect(resolveFileSlotBlobUrl(files, 0, urls)).toBeNull();
		expect(resolveFileSlotBlobUrl(files, -1, urls)).toBeNull();
	});
});
