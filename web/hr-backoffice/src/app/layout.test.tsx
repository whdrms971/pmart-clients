// 메뉴 레이아웃 — 메뉴는 화면 높이에 고정·따로 스크롤, 다른 화면으로 가면 맨 위부터(사용자 2026-11-17)
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderAt } from '../test/render';

describe('메뉴 레이아웃', () => {
  it('메뉴 위 앱 바꾸기(⋮⋮⋮): 4개, 인사팀은 지금 앱으로 강조', async () => {
    renderAt('/employees');
    await userEvent.click(await screen.findByRole('button', { name: '앱 바꾸기' }));
    const panel = screen.getByRole('navigation', { name: '앱 바꾸기' });
    expect(panel).toHaveTextContent('백오피스');
    expect(screen.getByText('인사팀', { selector: '[aria-current="page"]' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '백오피스' })).toHaveAttribute('href', 'http://localhost:5173/');
  });

  it('메뉴는 화면 높이에 붙어 따로 스크롤된다', async () => {
    renderAt('/employees');
    const menu = await screen.findByTestId('side-menu');
    expect(menu.className).toContain('sticky');
    expect(menu.className).toContain('overflow-y-auto');
  });

  it('메뉴로 다른 화면에 가면 스크롤이 맨 위로', async () => {
    renderAt('/employees');
    await screen.findByTestId('side-menu');
    const root = document.scrollingElement ?? document.documentElement;
    root.scrollTop = 800;
    await userEvent.click(screen.getByRole('link', { name: '권한 관리' }));
    expect(root.scrollTop).toBe(0);
  });
});

describe('메뉴 접기(2026-11-19)', () => {
  it('접으면 64px 칸에 메뉴 다섯 개 아이콘, 아이콘으로 이동, 다시 펴기 — 고른 값은 기억', async () => {
    renderAt('/employees');
    const menu = await screen.findByTestId('side-menu');
    expect(menu).toHaveAttribute('data-collapsed', 'false');
    await userEvent.click(screen.getByRole('button', { name: '메뉴 접기' }));
    expect(menu).toHaveAttribute('data-collapsed', 'true');
    expect(menu.className).toContain('w-16');
    expect(['home', 'employees', 'employees-new', 'departments', 'permissions'].map((id) => screen.getByTestId(`nav-rail-${id}`).getAttribute('title'))).toEqual(['첫 화면', '직원 목록', '직원 등록', '본사 부서', '권한 관리']);
    expect(screen.getByTestId('nav-rail-employees')).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByTestId('nav-rail-permissions'));
    expect(await screen.findByTestId('nav-rail-permissions')).toHaveAttribute('aria-current', 'page');
    expect(window.localStorage.getItem('pmart.hr-backoffice.menu')).toBe('collapsed');
    await userEvent.click(screen.getByRole('button', { name: '메뉴 펴기' }));
    expect(menu).toHaveAttribute('data-collapsed', 'false');
    expect(window.localStorage.getItem('pmart.hr-backoffice.menu')).toBe('open');
  });
});
