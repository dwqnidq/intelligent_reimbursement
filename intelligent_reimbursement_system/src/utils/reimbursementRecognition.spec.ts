import { describe, expect, it } from 'vitest';
import type { AiReimbursementFormExtractRow } from '../api/ai';
import type { ReimbursementType } from '../api/reimbursement';
import {
	applyManualTypeSelection,
	applyTypeFillToGroup,
	buildFileSlotSummaries,
	mergeFilledFieldsWithTypeSkeleton,
	needsTypeFieldFill,
	pickOcrTextFromGroup,
} from './reimbursementRecognition';

const baseType = {
	_id: 'type-1',
	label: '差旅费',
	name: '差旅费',
	code: 'travel',
	fields: [
		{
			_id: 'f1',
			key: 'travel_fee',
			label: '交通费',
			type: 'number' as const,
			required: true,
			options: [],
			sort: 0,
			is_calculate: true,
		},
		{
			_id: 'f2',
			key: 'city',
			label: '城市',
			type: 'text' as const,
			required: false,
			options: [],
			sort: 1,
			is_calculate: false,
		},
	],
} as unknown as ReimbursementType;

describe('needsTypeFieldFill / applyManualTypeSelection', () => {
	it('manual select marks fill needed and clears applied flag', () => {
		const summaries = buildFileSlotSummaries(
			[[{ label: '未知', fields: [{ key: 'amount', label: '金额', type: 'number', value: 25 }], is_suggested_type: true, ocr_text: '合计25' }]],
			[],
			['a.pdf'],
		);
		expect(needsTypeFieldFill(summaries[0])).toBe(false);
		const next = applyManualTypeSelection(summaries, 1, 'type-1');
		expect(next[0].userSelectedCategoryId).toBe('type-1');
		expect(next[0].typeFillApplied).toBe(false);
		expect(needsTypeFieldFill(next[0])).toBe(true);
		expect(needsTypeFieldFill({ ...next[0], typeFillApplied: true })).toBe(false);
	});
});

describe('pickOcrTextFromGroup / applyTypeFillToGroup', () => {
	it('picks ocr and rewrites group fields while keeping invoice meta', () => {
		const group: AiReimbursementFormExtractRow[] = [
			{
				label: '建议',
				fields: [{ key: 'amount', label: '金额', type: 'number', value: 25 }],
				is_suggested_type: true,
				invoice_number: 'INV1',
				ocr_text: '价税合计 25',
			},
		];
		expect(pickOcrTextFromGroup(group)).toBe('价税合计 25');
		const filled = applyTypeFillToGroup(
			group,
			{
				label: '差旅费',
				fields: [{ key: 'travel_fee', label: '交通费', type: 'number', value: 25 }],
			},
			'差旅费',
		);
		expect(filled).toHaveLength(1);
		expect(filled[0].label).toBe('差旅费');
		expect(filled[0].invoice_number).toBe('INV1');
		expect(filled[0].ocr_text).toBe('价税合计 25');
		expect(filled[0].is_suggested_type).toBe(false);
		expect(filled[0].fields?.[0]?.key).toBe('travel_fee');
	});
});

describe('mergeFilledFieldsWithTypeSkeleton', () => {
	it('keeps type skeleton and only soft-fills known values', () => {
		const merged = mergeFilledFieldsWithTypeSkeleton(baseType, [
			{ key: 'travel_fee', label: '交通费', type: 'number', value: 88 },
		]);
		expect(merged).toHaveLength(2);
		expect(merged[0]).toMatchObject({ key: 'travel_fee', value: 88 });
		expect(merged[1].key).toBe('city');
		expect(merged[1].value).toBeUndefined();
	});
});
