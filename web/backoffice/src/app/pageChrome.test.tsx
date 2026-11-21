// 화면 틀 보탬(2026-11-19 "더더 UI UX") — 탭 제목·인터넷 끊김 띠·"/" 단축키·최근 봄 표시
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { server } from '../test/server';
import { as, renderAt } from '../test/render';
import { messages as m } from '../shared/messages';

afterEach(() => vi.restoreAllMocks());

describe('브라우저 탭 제목', () => {
  it('지금 화면 이름 | 통합백오피스 — 접수 건을 못 맡는 상담원은 숫자 없이', async () => {
    renderAt('/orders', as.cs);
    await waitFor(() => expect(document.title).toBe(`${m.nav.orders} | 통합백오피스`));
  });

  it('기한 넘긴 접수 건이 있으면 앞에 (수) — 서버가 센 수', async () => {
    server.use(http.get('*/api/v1/views/case-inbox', ({ request }) => (new URL(request.url).searchParams.get('overdue') === 'true' ? HttpResponse.json({ items: [{ caseId: 'C1' }, { caseId: 'C2' }], page: { nextCursor: null } }) : undefined)));
    renderAt('/approvals', as.admin);
    await waitFor(() => expect(document.title).toMatch(new RegExp(`^\\(\\d+\\+?\\) ${m.nav.approvals} \\| 통합백오피스$`)));
  });
});

describe('인터넷 끊김 띠', () => {
  it('끊기면 띠, 다시 이어지면 잠깐 "다시 연결됐어요"', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    renderAt('/orders', as.cs);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByTestId('offline-banner')).toHaveTextContent(m.chrome.offline);
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByTestId('online-again')).toBeInTheDocument();
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });
});

describe('"/" 단축키', () => {
  it('속성 필터 검색칸으로 간다(2026-11-20 AWS 개편 — 검색 조건 상자 대신)', async () => {
    renderAt('/orders', as.cs);
    const box = await screen.findByRole('combobox', { name: '속성으로 거르기' });
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(box);
  });
});
