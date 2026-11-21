// 화면 틀 보탬(2026-11-19, 백오피스와 같게) — 탭 제목·인터넷 끊김 띠·"/" 단축키
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { messages as m } from '../shared/messages';
import { renderAt } from '../test/render';

afterEach(() => vi.restoreAllMocks());

describe('인사팀 화면 틀', () => {
  it('탭 제목 = (발급 실패 수) 화면 이름 | 인사백오피스', async () => {
    renderAt('/employees');
    await waitFor(() => expect(document.title.replace(/^\(\d+\+?\) /, '')).toBe(`${m.nav.employees} | 인사백오피스`));
  });

  it('인터넷이 끊기면 띠, 이어지면 "다시 연결됐어요"', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    renderAt('/employees');
    await screen.findByRole('heading', { level: 1 });
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByTestId('offline-banner')).toBeInTheDocument();
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByTestId('online-again')).toBeInTheDocument();
  });

  it('"/" 로 검색 조건 첫 칸', async () => {
    renderAt('/employees');
    const form = await screen.findByRole('form', { name: '검색 조건' });
    fireEvent.keyDown(window, { key: '/' });
    expect(form.contains(document.activeElement)).toBe(true);
  });
});
