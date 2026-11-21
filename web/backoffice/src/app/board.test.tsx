// 보드(칸반) 보기(2026-11-20) — 대시보드 보드 탭·접수 건·승인함. 보기 전용, 칸은 서버 조회 조건으로만.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { API_BASE } from '../api/client';
import { server } from '../test/server';
import { as, renderAt } from '../test/render';

describe('대시보드 보드(한눈에 아래, 2026-11-21 보드 탭 없앰)', () => {
  it('보드 탭은 없고, 한눈에 숫자 칸 아래에 보드가 바로 보인다 — 옛 ?tab=board 주소도 한눈에', async () => {
    renderAt('/?tab=board', as.admin);
    const panel = await screen.findByRole('tabpanel', { name: '한눈에' });
    expect(screen.queryByRole('tab', { name: '보드' })).not.toBeInTheDocument();
    expect(within(panel).getByTestId('dash-board')).toBeInTheDocument();
  });

  it('관리자: 기한 넘김·아무도 안 맡음·내가 맡음·답변 대기 문의·내가 심사할 승인 칸, 카드를 누르면 상세', async () => {
    const view = renderAt('/', as.admin);
    const board = await screen.findByTestId('dash-board');
    for (const id of ['overdue', 'unassigned', 'mine', 'inquiries', 'approvals']) expect(within(board).getByTestId(`board-col-${id}`)).toBeInTheDocument();
    // 서버 조회 조건 — 메뉴 알림과 같은 조건
    await waitFor(() => {
      const urls = view.sent.map((r) => new URL(r.url));
      expect(urls.some((u) => u.pathname.endsWith('/cases') && u.searchParams.get('overdue') === 'true')).toBe(true);
      expect(urls.some((u) => u.pathname.endsWith('/approvals') && u.searchParams.get('decidableByMe') === 'true' && u.searchParams.get('reviewState') === 'REVIEW_PENDING')).toBe(true);
    });
    const overdue = within(board).getByTestId('board-col-overdue');
    const card = (await within(overdue).findAllByTestId('board-card'))[0]!;
    expect(card.getAttribute('href')).toMatch(/^\/cases\//);
    // 기한 넘긴 건은 "아무도 안 맡음" 칸에 겹쳐 나오지 않는다
    const href = card.getAttribute('href');
    expect(within(within(board).getByTestId('board-col-unassigned')).queryAllByTestId('board-card').some((c) => c.getAttribute('href') === href)).toBe(false);
  });

  it('한 칸을 못 읽으면 그 칸만 "?"와 다시 — 0 이나 빈 칸으로 보이지 않는다', async () => {
    server.use(http.get(`${API_BASE}/approvals`, () => HttpResponse.json({ type: 'about:blank', title: 'x', status: 503 }, { status: 503, headers: { 'content-type': 'application/problem+json' } })));
    const user = userEvent.setup();
    renderAt('/', as.admin);
    const col = await screen.findByTestId('board-col-approvals');
    await waitFor(() => expect(within(col).getByTestId('board-count-approvals')).toHaveTextContent('?'));
    expect(within(col).getByRole('alert')).toHaveTextContent('못 읽었어요');
    await user.click(within(col).getByRole('button', { name: '다시' }));
  });
});

describe('접수 건 보드로 보기', () => {
  it('표 / 보드를 바꾸면 처리 단계(서버 상태)별 칸 — 주소에 layout=board', async () => {
    const user = userEvent.setup();
    const view = renderAt('/cases', as.admin);
    await user.click(await screen.findByTestId('layout-board'));
    const board = await screen.findByTestId('case-board');
    for (const st of ['OPEN', 'RESOLUTION_REVIEW', 'CLOSED']) expect(within(board).getByTestId(`board-col-${st}`)).toBeInTheDocument();
    await waitFor(() => expect(view.sent.some((r) => { const u = new URL(r.url); return u.pathname.endsWith('/cases') && u.searchParams.get('state') === 'CLOSED'; })).toBe(true));
    expect(screen.queryByTestId('case-list-card')).not.toBeInTheDocument(); // 표 대신 보드
  });
});

describe('승인함 보드로 보기', () => {
  it('"모두"에서 심사 상태별 칸, "내가 심사할 것"에는 바꾸기 단추가 없다', async () => {
    const user = userEvent.setup();
    renderAt('/approvals', as.admin);
    await screen.findByTestId('approval-view-todo');
    expect(screen.queryByTestId('layout-board')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('approval-view-all'));
    await user.click(await screen.findByTestId('layout-board'));
    const board = await screen.findByTestId('approval-board');
    expect(within(board).getByTestId('board-col-REVIEW_PENDING')).toHaveTextContent('심사 기다림');
    expect(within(board).getByTestId('board-col-REJECTED')).toBeInTheDocument();
  });
});
