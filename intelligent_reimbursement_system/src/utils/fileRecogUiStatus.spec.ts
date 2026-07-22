import { describe, expect, it } from 'vitest';
import { resolveFileRecogUiStatus } from './fileRecogUiStatus';
import type { FileSlotRecognitionSummary } from './reimbursementRecognition';

function summary(
	partial: Partial<FileSlotRecognitionSummary> & { fileIndex: number },
): FileSlotRecognitionSummary {
	return {
		label: '',
		rowCount: 0,
		matched: false,
		isSuggested: false,
		...partial,
	};
}

describe('resolveFileRecogUiStatus', () => {
	it('marks only completed indexes as completed while extracting', () => {
		const done = new Set([1, 3]);
		expect(resolveFileRecogUiStatus(1, true, [], done)).toBe('completed');
		expect(resolveFileRecogUiStatus(2, true, [], done)).toBe('extracting');
		expect(resolveFileRecogUiStatus(3, true, [], done)).toBe('completed');
		expect(resolveFileRecogUiStatus(4, true, [], done)).toBe('extracting');
	});

	it('ignores summaries while extracting', () => {
		const summaries = [summary({ fileIndex: 1, matched: true })];
		expect(resolveFileRecogUiStatus(1, true, summaries, new Set())).toBe(
			'extracting',
		);
	});

	it('uses summaries after extraction finishes', () => {
		expect(resolveFileRecogUiStatus(1, false, [], new Set([1]))).toBe(
			'pending',
		);
		expect(
			resolveFileRecogUiStatus(
				1,
				false,
				[summary({ fileIndex: 1, matched: true })],
				new Set(),
			),
		).toBe('matched');
		expect(
			resolveFileRecogUiStatus(
				2,
				false,
				[summary({ fileIndex: 2, matched: false })],
				new Set(),
			),
		).toBe('unmatched');
		expect(
			resolveFileRecogUiStatus(
				3,
				false,
				[summary({ fileIndex: 3, invoiceDuplicate: true })],
				new Set(),
			),
		).toBe('duplicate');
		expect(
			resolveFileRecogUiStatus(
				4,
				false,
				[summary({ fileIndex: 4, userSelectedCategoryId: 't1' })],
				new Set(),
			),
		).toBe('matched');
	});
});
