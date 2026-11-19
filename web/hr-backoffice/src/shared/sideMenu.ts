// 사본: web/backoffice shared/sideMenu.ts (2026-11-19) — 이 앱에서 따로 고친다.
// 왼쪽 메뉴 접기(2026-11-19 사용자 "순서대로" — 좁은 화면(노트북·태블릿)에서 본문이 답답하다).
// 고른 값은 이 브라우저에만(보는 사람 한 명의 편의). 고른 적이 없으면 화면 폭으로: 1280px 보다 좁으면 접어서 시작.
import { useState } from 'react';

const KEY = 'pmart.hr-backoffice.menu';

export function readMenuCollapsed(): boolean {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'collapsed') return true;
    if (v === 'open') return false;
  } catch {
    /* 저장이 막힌 브라우저 — 폭으로 */
  }
  return typeof window.innerWidth === 'number' && window.innerWidth < 1280;
}

export function useMenuCollapsed(): readonly [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readMenuCollapsed);
  const toggle = () => {
    const next = !collapsed;
    try {
      window.localStorage.setItem(KEY, next ? 'collapsed' : 'open');
    } catch {
      /* 기억만 못 할 뿐 접기·펴기는 된다 */
    }
    setCollapsed(next);
  };
  return [collapsed, toggle];
}
