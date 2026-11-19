// 콘텐츠 조회·상품 사진(2026-11-19)
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { as, renderAt } from '../../test/render';

const rowOf = (name: string) => screen.getAllByTestId('content-row').find((r) => r.textContent?.includes(name))!;

describe('콘텐츠 조회', () => {
  it('상품마다 게시 상태 — 게시됨은 대표 사진·고객용 이름, 미게시는 0 이 아니라 "미게시"', async () => {
    renderAt('/contents', as.md);
    await waitFor(() => expect(screen.getByTestId('content-count-published')).toHaveTextContent(/게시됨1$/));
    expect(screen.getByTestId('content-count-missing')).toHaveTextContent(/보여요1$/);
    const apple = rowOf('사과 1.5kg');
    expect(apple).toHaveTextContent('게시됨');
    await waitFor(() => expect(within(apple).getByTestId('content-thumb').querySelector('img')).not.toBeNull());
    expect(rowOf('소고기 미역국')).toHaveTextContent('미게시');
    expect(within(rowOf('소고기 미역국')).getByTestId('content-edit')).toHaveTextContent('등록');
  });

  it('줄을 누르면 오른쪽에 게시된 콘텐츠(사진·설명·고시)', async () => {
    const user = userEvent.setup();
    renderAt('/contents', as.md);
    await waitFor(() => expect(rowOf('사과 1.5kg')).toHaveTextContent('게시됨'));
    await user.click(rowOf('사과 1.5kg'));
    const text = await screen.findByTestId('content-text');
    expect(text).toHaveTextContent('아삭한 부사 사과');
    expect(text).toHaveTextContent('원산지: 국산');
    expect(screen.getByTestId('content-gallery')).toHaveTextContent('사진 1장');
  });
});

describe('상품 상세 사진', () => {
  it('게시된 상품은 사진, 미게시는 오류가 아니라 등록 안내', async () => {
    renderAt('/products/P-00000001', as.md);
    expect(await screen.findByTestId('content-gallery')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('content-gallery').querySelector('img')).not.toBeNull());
  });

  it('미게시 상품', async () => {
    renderAt('/products/P-00000002', as.md);
    expect(await screen.findByTestId('content-not-published')).toHaveTextContent('게시된 콘텐츠가 없어');
  });
});

describe('상품 상세 — 시스템 ID 대신(ADR-0070 덧붙임)', () => {
  it('제목은 이름만, 카테고리는 경로, 승인은 "승인 보기" — ID 는 "시스템 번호" 접기 안에만', async () => {
    renderAt('/products/P-00000001', as.md);
    expect(await screen.findByRole('heading', { level: 1, name: '사과 1.5kg' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('primary-category')).toHaveTextContent('과일·채소 > 과일 > 사과·배'));
    expect(screen.getAllByTestId('exposed-category')[0]).toHaveTextContent('과일·채소 > 과일 > 사과·배');
    expect(screen.getByTestId('product-approval')).toHaveTextContent('승인 보기');
    const outside = document.querySelector('section')!.cloneNode(true) as HTMLElement;
    outside.querySelector('[data-testid="system-numbers"]')?.remove();
    expect(outside.textContent).not.toMatch(/P-00000001|p01-c01-l01|apv-seed-1/);
    expect(screen.getByTestId('system-numbers')).toHaveTextContent('P-00000001');
  });
});
