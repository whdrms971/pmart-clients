// 등록이 덜 된 상품(2026-11-19 상품 하나씩 등록 다듬기) — 목: 사과(P-00000001)는 게시·가격 있음, 소고기 미역국(P-00000002)은 미게시·가격 미설정
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { API_BASE } from '../../api/client';
import { as, renderAt } from '../../test/render';
import { server } from '../../test/server';

describe('상품 목록 — 등록이 덜 된 상품', () => {
  it('사진·설명 없음·가격 미설정 수(불러온 쪽 기준)를 보이고, 누르면 그것만 거른다', async () => {
    const user = userEvent.setup();
    renderAt('/products', as.md);
    const box = await screen.findByTestId('product-missing');
    await waitFor(() => expect(within(box).getByTestId('missing-price')).toHaveTextContent('가격 미설정 1'));
    expect(within(box).getByTestId('missing-photo')).toHaveTextContent('사진·설명 없음 1');
    await user.click(within(box).getByTestId('missing-price'));
    await waitFor(() => expect(screen.getAllByTestId('product-row')).toHaveLength(1));
    expect(screen.getByTestId('product-row')).toHaveTextContent('소고기 미역국');
    expect(screen.getByRole('combobox', { name: '판매가' })).toHaveValue('notSet');
  });

  it('게시 카드를 못 읽으면 사진 수는 "?" — 0 으로 바꾸지 않는다', async () => {
    server.use(http.get(`${API_BASE}/product-contents`, () => HttpResponse.json({ code: 'UNAVAILABLE' }, { status: 503 })));
    renderAt('/products', as.md);
    expect(await screen.findByTestId('missing-photo')).toHaveTextContent('사진·설명 없음 ?');
  });
});

describe('상품 상세 — 다음 할 일', () => {
  it('미게시·가격 미설정 상품은 맨 위에 "사진·설명 등록"·"가격 정하기"', async () => {
    renderAt('/products/P-00000002', as.md);
    expect(await screen.findByTestId('next-photo')).toHaveAttribute('href', '/contents/drafts/new?productId=P-00000002');
    // 가격 정하기 — 이 화면의 가격 탭으로(2026-11-20 — 가격 관리 화면으로 보내지 않음)
    await userEvent.click(await screen.findByTestId('next-price'));
    expect(await screen.findByTestId('price-form')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /소고기 미역국/ })).toBeInTheDocument();
  });

  it('SKU 표의 SKU 번호를 누르면 이 화면의 가격 탭', async () => {
    renderAt('/products/P-00000001', as.md);
    await userEvent.click(await screen.findByTestId('sku-to-price'));
    expect(await screen.findByTestId('price-form')).toBeInTheDocument();
  });

  it('다 된 상품(게시·가격 있음)에는 없다', async () => {
    renderAt('/products/P-00000001', as.md);
    // 게시 콘텐츠를 읽은 뒤(사진 모음이 보임)에 본다 — 읽기 전에 없는 것은 확인이 아니다
    expect(await screen.findByTestId('content-gallery')).toBeInTheDocument();
    expect(screen.queryByTestId('next-photo')).toBeNull();
    // 미게시 상품이면 같은 때 나오는 가격 단추도 — 가격까지 읽힌 뒤
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByTestId('next-price')).toBeNull();
  });
});
