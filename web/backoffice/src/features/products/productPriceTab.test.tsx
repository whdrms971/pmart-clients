// 상품 상세 "가격" 탭에서 바로 바꾸기(2026-11-20 사용자 "가격도 여기서 바로 바꿀 수 있게 하던가")
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { as, renderAt } from '../../test/render';

describe('상품 상세 가격 탭', () => {
  it('탭 안에서 새 가격 → 승인 요청, 가격 관리 화면으로 보내는 링크는 없다', async () => {
    const user = userEvent.setup();
    renderAt('/products/P-00000001?tab=price', as.md);
    const tab = await screen.findByTestId('tab-price');
    expect(within(tab).queryByRole('link', { name: /가격 화면/ })).not.toBeInTheDocument();
    const form = within(tab).getByTestId('price-form');
    await waitFor(() => expect(within(form).getByTestId('price-form-now')).toHaveTextContent('4,500원'));
    expect(within(form).getByTestId('price-form-row')).toHaveTextContent('낱개(E)');
    await user.type(within(form).getByRole('textbox', { name: 'E-00000001 새 가격' }), '4000');
    expect(within(form).getByTestId('price-form-diff')).toHaveTextContent('-500원');
    await user.click(within(form).getByTestId('price-form-submit'));
    expect(await within(tab).findByTestId('price-form-done')).toHaveTextContent('승인 요청했어요');
    expect(screen.getByRole('heading', { level: 1, name: /사과 1\.5kg/ })).toBeInTheDocument(); // 상품 상세 그대로
  });
});

describe('센터 취급(2026-11-20)', () => {
  it('상품 상세에 센터 취급 탭이 없다 — 기본 정보·고객 화면·가격 셋', async () => {
    renderAt('/products/P-00000001', as.md);
    const tabs = await screen.findByRole('tablist');
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['기본 정보', '고객 화면', '가격']);
  });

  it('센터가 없는 본사 역할(MD)에는 "센터 취급" 메뉴가 없다 — 그 화면은 토큰에 센터가 있어야 열린다', async () => {
    renderAt('/products', as.md);
    await screen.findByRole('heading', { level: 1, name: '상품 조회' });
    expect(screen.queryByRole('link', { name: '센터 취급' })).not.toBeInTheDocument();
  });
});

describe('승인 뒤 "가격 정하기"(2026-11-20)', () => {
  it('상품 등록이 승인·반영되면 가격은 가격 관리 화면이 아니라 그 상품의 가격 탭으로', async () => {
    const { db } = await import('../../mocks/db');
    db.productDrafts.set('pd-applied-t', {
      draftId: 'pd-applied-t',
      batchId: null,
      sourceSystem: null,
      sourceKey: null,
      state: 'APPLIED',
      input: { product: { internalName: '사과 1.5kg', primaryCategoryId: 'p01-c01-l01', categoryIds: ['p01-c01-l01'] }, skus: [] },
      draftHash: 'h',
      approvalId: 'apv-seed-1',
      resultProductId: 'P-00000001',
      resultSkus: ['E-00000001'],
      version: 2,
      updatedAt: '2026-11-20T00:00:00Z',
    } as unknown as (typeof db.productDrafts extends Map<string, infer V> ? V : never));
    renderAt('/products/drafts/pd-applied-t', as.md);
    expect(await screen.findByTestId('applied-price')).toHaveAttribute('href', '/products/P-00000001?tab=price');
  });
});
