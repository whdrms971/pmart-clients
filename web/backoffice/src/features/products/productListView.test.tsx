// 상품 조회(2026-11-19 쿠팡 윙 상품 조회/수정 참고)
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { pick } from '../../test/pick';
import { as, renderAt } from '../../test/render';
import { server } from '../../test/server';

const rowOf = (name: string) => screen.getAllByTestId('product-row').find((r) => r.textContent?.includes(name))!;

describe('상품 조회', () => {
  it('판매 상태 숫자 카드(서버 목록으로 셈), 누르면 그 상태', async () => {
    const user = userEvent.setup();
    renderAt('/products', as.md);
    await waitFor(() => expect(screen.getByTestId('product-count-all')).toHaveTextContent('2'));
    expect(screen.getByTestId('product-count-ON_SALE')).toHaveTextContent('2');
    expect(screen.getByTestId('product-count-SALE_STOPPED')).toHaveTextContent('0');
    await user.click(screen.getByTestId('product-count-SALE_STOPPED'));
    expect(await screen.findByText('조건에 맞는 상품이 없어요')).toBeInTheDocument();
    expect(screen.getByTestId('product-count-SALE_STOPPED')).toHaveAttribute('aria-current', 'true');
  });

  it('줄에는 시스템 ID 대신 카테고리 경로·SKU 수·판매가(서버 값), 미설정은 0원이 아니라 "가격 미설정"', async () => {
    renderAt('/products', as.md);
    await waitFor(() => expect(rowOf('사과 1.5kg')).toHaveTextContent('과일·채소 > 과일 > 사과·배'));
    const apple = rowOf('사과 1.5kg');
    expect(apple).not.toHaveTextContent('P-00000001');
    expect(apple).not.toHaveTextContent('p01-c01');
    await waitFor(() => expect(within(apple).getByTestId('product-price')).toHaveTextContent('4,500원'));
    expect(apple).toHaveTextContent('SKU 1개');
    await waitFor(() => expect(within(rowOf('소고기 미역국')).getByTestId('product-price')).toHaveTextContent('가격 미설정'));
  });

  it('상품명은 바로 거르고, 카테고리는 경로로 쳐서 고른다(주소에 categoryId)', async () => {
    const user = userEvent.setup();
    renderAt('/products', as.md);
    await waitFor(() => expect(screen.getAllByTestId('product-row')).toHaveLength(2));
    await user.type(screen.getByRole('textbox', { name: '상품명' }), '미역');
    expect(screen.getAllByTestId('product-row')).toHaveLength(1);
    await user.clear(screen.getByRole('textbox', { name: '상품명' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '카테고리' })).toBeEnabled());
    await pick(user, '카테고리', '국·탕·찌개 > 국·국밥', '국밥');
    await waitFor(() => expect(screen.getAllByTestId('product-row').every((r) => r.textContent?.includes('국·탕·찌개'))).toBe(true));
  });

  it('줄 행동: 상품 수정은 상세로, ⋮ 에 가격·콘텐츠 바로 가기', async () => {
    renderAt('/products', as.md);
    await waitFor(() => expect(within(rowOf('사과 1.5kg')).getByTestId('product-price')).toHaveTextContent('4,500원'));
    const apple = rowOf('사과 1.5kg');
    expect(within(apple).getByTestId('product-edit')).toHaveAttribute('href', '/products/P-00000001');
    expect(within(apple).getByRole('link', { name: '가격 바꾸기' })).toHaveAttribute('href', '/products/P-00000001?tab=price'); // 그 상품의 가격 탭(2026-11-20 — 가격 관리 화면으로 보내지 않음)
    expect(within(apple).getByRole('link', { name: '판매 상태 바꾸기' })).toHaveAttribute('href', '/products/P-00000001#sale-state-change');
    expect(within(apple).getByRole('link', { name: '콘텐츠·이미지 등록' })).toHaveAttribute('href', '/products/P-00000001?tab=content'); // 상품 상세의 고객 화면 탭(2026-11-19 상품 묶음 합치기)
  });
});

describe('상품 조회 — 사진·이름 찾기(2026-11-19)', () => {
  it('게시된 상품은 대표 이미지 썸네일, 미게시는 상자 아이콘', async () => {
    renderAt('/products', as.md);
    await waitFor(() => expect(within(rowOf('사과 1.5kg')).getByTestId('product-thumb').querySelector('img')).not.toBeNull());
    expect(within(rowOf('소고기 미역국')).getByTestId('product-thumb').querySelector('img')).toBeNull();
  });

  it('상품명 칸은 관리용 명칭·고객용 상품명 모두로 찾는다(이 쪽 안에서)', async () => {
    const user = userEvent.setup();
    renderAt('/products', as.md);
    await waitFor(() => expect(within(rowOf('사과 1.5kg')).getByTestId('product-thumb').querySelector('img')).not.toBeNull());
    await user.type(screen.getByRole('textbox', { name: '상품명' }), '사과');
    expect(screen.getAllByTestId('product-row')).toHaveLength(1);
  });
});

describe('상품 조회 정렬(2026-11-19 "이름순 해도 작동 안 함")', () => {
  const names = () => screen.getAllByTestId('product-row').map((r) => r.querySelector('[data-testid="product-name"]')?.textContent);

  it('이름 순(가나다)·이름 역순 — 서버 순서가 섞여 있어도', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/products', ({ request }) =>
        new URL(request.url).searchParams.get('size') === '200'
          ? undefined
          : HttpResponse.json({
              items: [
                { productId: 'P-1', internalName: '참외', saleState: 'ON_SALE', version: 1 },
                { productId: 'P-2', internalName: '귤', saleState: 'ON_SALE', version: 1 },
                { productId: 'P-3', internalName: '사과', saleState: 'ON_SALE', version: 1 },
              ],
              page: { nextCursor: null },
            }),
      ),
    );
    renderAt('/products', as.md);
    await waitFor(() => expect(names()).toEqual(['참외', '귤', '사과']));
    await user.click(screen.getByRole('button', { name: '이름 순(가나다)' }));
    expect(names()).toEqual(['귤', '사과', '참외']);
    await user.click(screen.getByRole('button', { name: '이름 역순' }));
    expect(names()).toEqual(['참외', '사과', '귤']);
    await user.click(screen.getByRole('button', { name: '기본 순' }));
    expect(names()).toEqual(['참외', '귤', '사과']);
  });

  it('판매가 순 — 가격 미설정은 낮은 순·높은 순 모두 맨 뒤', async () => {
    const user = userEvent.setup();
    renderAt('/products', as.md);
    await waitFor(() => expect(within(rowOf('사과 1.5kg')).getByTestId('product-price')).toHaveTextContent('4,500원'));
    await waitFor(() => expect(within(rowOf('소고기 미역국')).getByTestId('product-price')).toHaveTextContent('가격 미설정'));
    await user.click(screen.getByRole('button', { name: '판매가 높은 순' }));
    expect(names()).toEqual(['사과 1.5kg', '소고기 미역국 500g']);
    await user.click(screen.getByRole('button', { name: '판매가 낮은 순' }));
    expect(names()).toEqual(['사과 1.5kg', '소고기 미역국 500g']);
  });
});
