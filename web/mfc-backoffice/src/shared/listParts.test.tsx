// 통합 백오피스와 같은 목록·상세 부품(2026-11-19 PC 2 요청) — 숫자 카드(서버 수만, 못 읽으면 "?"), 다 끝났어요 띠, 검색 칩 접기·'/' 키,
// 최근 봄, 목록 순서대로 넘기기([ ] 키), 미리보기 Enter, 진행 단계, 탭 제목, 끊김 띠.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { API_BASE } from '../api/client';
import { db } from '../mocks/db';
import { renderAt } from '../test/render';
import { server } from '../test/server';

const rows = () => screen.getAllByTestId('task-row');
const value = (id: string) => screen.findByTestId(`${id}-value`);

describe('작업 현황 — 숫자 카드·다 끝났어요', () => {
  it('상태 카드는 상태마다 서버 목록으로 센 수, 누르면 그 상태로 거른다(주소에 남음)', async () => {
    const view = renderAt('/c/MFC-BSN-01/tasks');
    await waitFor(async () => expect(await value('count-IN_PROGRESS')).toHaveTextContent(/^\d+건$/));
    const inProgress = [...db.tasks.values()].filter((t) => t.mfcId === 'MFC-BSN-01' && t.state === 'IN_PROGRESS').length;
    expect(await value('count-IN_PROGRESS')).toHaveTextContent(`${inProgress}건`);
    const counted = view.gets('/tasks').map((r) => new URL(r.url).searchParams);
    expect(counted.some((q) => q.getAll('state').join() === 'BLOCKED' && q.get('size') === '50')).toBe(true);
    await userEvent.click(screen.getByTestId('count-IN_PROGRESS'));
    await waitFor(() => expect(screen.getByTestId('count-IN_PROGRESS')).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByTestId('all-done')).not.toBeInTheDocument();
  });

  it('쪽이 더 있으면 "N건 이상", 못 읽으면 0 이 아니라 "?", 그때는 다 끝났어요 띠도 없다', async () => {
    server.use(
      http.get(`${API_BASE}/tasks`, ({ request }) => {
        const q = new URL(request.url).searchParams;
        if (q.getAll('state').join() === 'READY') return HttpResponse.json({ items: Array.from({ length: 50 }, (_, i) => ({ taskId: `T-${i}`, state: 'READY' })), page: { nextCursor: '50', size: 50 } });
        if (q.getAll('state').join() === 'BLOCKED') return HttpResponse.json({ status: 503, code: 'DEPENDENCY_UNAVAILABLE', type: 'about:blank' }, { status: 503, headers: { 'content-type': 'application/problem+json' } });
        return HttpResponse.json({ items: [], page: { nextCursor: null, size: 50 } });
      }),
    );
    renderAt('/c/MFC-BSN-01/tasks');
    expect(await value('count-READY')).toHaveTextContent('50건 이상');
    await waitFor(async () => expect(await value('count-BLOCKED')).toHaveTextContent('?'));
    expect(screen.queryByTestId('all-done')).not.toBeInTheDocument();
  });

  it('대기·배정·진행·막힘이 모두 서버에서 0건이면 "수고하셨어요"', async () => {
    server.use(http.get(`${API_BASE}/tasks`, () => HttpResponse.json({ items: [], page: { nextCursor: null, size: 50 } })));
    renderAt('/c/MFC-BSN-01/tasks');
    expect(await screen.findByTestId('all-done')).toHaveTextContent('수고하셨어요');
  });
});

describe('검색 조건 칩·/ 키', () => {
  it('조건을 건 목록은 칩 한 줄로 접히고, / 를 누르면 펼쳐 첫 칸으로', async () => {
    renderAt('/c/MFC-BSN-01/tasks?state=READY');
    const bar = await screen.findByTestId('search-bar');
    expect(within(bar).getAllByTestId('search-chip').map((c) => c.textContent)).toEqual(['유형전체▾', '상태대기(담당 없음)▾']);
    expect(within(bar).getByRole('form', { hidden: true })).not.toBeVisible();
    await userEvent.keyboard('/');
    await waitFor(() => expect(within(bar).getByRole('combobox', { name: '유형' })).toHaveFocus());
  });
});

describe('최근 봄·목록 순서대로 넘기기·미리보기', () => {
  it('상세는 목록 순서로 이전·n/N·다음, ] 키로 다음 건. 돌아오면 본 줄에 "최근 봄"', async () => {
    renderAt('/c/MFC-BSN-01/tasks');
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.queryByTestId('seen-mark')).not.toBeInTheDocument();
    await userEvent.click(within(rows()[0]!).getByRole('link'));
    expect(await screen.findByTestId('queue-pos')).toHaveTextContent('1 / 3');
    expect(screen.getByTestId('task-steps')).toBeInTheDocument();
    await userEvent.keyboard(']');
    await waitFor(() => expect(screen.getByTestId('queue-pos')).toHaveTextContent('2 / 3'));
    await userEvent.click(screen.getByRole('link', { name: '‹ 보던 목록으로' }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    await waitFor(() => expect(screen.getAllByTestId('seen-mark')).toHaveLength(2));
  });

  it('줄을 누르면 미리보기, ↓ 로 다음 줄, Enter 로 상세', async () => {
    renderAt('/c/MFC-BSN-01/tasks');
    await waitFor(() => expect(rows()).toHaveLength(3));
    await userEvent.click(within(rows()[0]!).getAllByRole('cell')[1]!);
    const drawer = await screen.findByTestId('preview-drawer');
    expect(drawer).toHaveTextContent('3줄 중 1번째');
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByTestId('preview-drawer')).toHaveTextContent('3줄 중 2번째'));
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByTestId('task-steps')).toBeInTheDocument();
  });

  it('진행 단계: 진행 중이면 지금 단계 숨쉬기, 앞 단계는 체크', async () => {
    renderAt('/c/MFC-BSN-01/tasks/TASK-PICK-1');
    const steps = await screen.findByTestId('task-steps');
    expect(within(steps).getAllByTestId('step-check')).toHaveLength(2);
    expect(within(steps).getByTestId('step-pulse')).toBeInTheDocument();
    expect(within(steps).getByRole('listitem', { current: 'step' })).toHaveTextContent('진행');
  });
});

describe('화면 틀', () => {
  it('탭 제목에 화면 이름, 인터넷이 끊기면 띠', async () => {
    renderAt('/c/MFC-BSN-01/tasks');
    await waitFor(() => expect(document.title).toMatch(/^(\(\d+\+?\) )?작업 현황 \| MFC백오피스$/));
    const online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByTestId('offline-banner')).toHaveTextContent('인터넷 연결이 끊겼어요');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByTestId('online-again')).toBeInTheDocument();
    if (online) Object.defineProperty(Navigator.prototype, 'onLine', online);
    delete (navigator as unknown as Record<string, unknown>)['onLine'];
  });
});
