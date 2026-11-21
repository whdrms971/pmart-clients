// 사본: web/backoffice/src/app/PageChrome.tsx (main 3222d26)·ThemeToggle.tsx (main a7cbe71)·ShortcutHelp.tsx 의 '/' 키 (main 3222d26) — 이 앱에서 따로 고친다(앱 조회를 아는 부품, 지침 §5).
// 1) 브라우저 탭 제목: "(급한 일 수) 화면 이름 | 라이더백오피스". 급한 일 = 아직 아무도 받지 않은 배송 도움요청(state OPEN) —
//    서버 목록 한 쪽(50건)으로 센다. 다음 쪽이 있으면 "50+". 못 읽으면 숫자 없이(0 으로 보이지 않게).
// 2) 인터넷 끊김 띠: 끊긴 동안 화면 숫자가 최신이 아님을 알린다. 다시 이어지면 4초 동안 알리고 화면은 저절로 다시 읽는다.
// 3) '/' 키: 입력 칸 밖에서 누르면 이 화면 검색 조건(SearchPanel)의 첫 칸으로.
// 4) 밝은/어두운 화면 단추.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { request } from '@pmart/web-core';
import { useTheme } from '../shared/theme';
import { ui } from '../shared/uiMessages';
import { useApi } from './ApiContext';

const m = ui.chrome;
const BACK_MS = 4_000;
const URGENT_PAGE = 50;
/** 탭 제목의 앱 이름 — "화면 | 라이더백오피스"(2026-11-21 사용자, 네 백오피스 같은 꼴) */
const TAB_APP = '라이더백오피스';

/** 아직 받지 않은 배송 도움요청 수(서버 목록 한 쪽 기준) — 못 읽거나 읽는 중이면 null */
function useUrgentTotal(enabled: boolean): { readonly n: number; readonly more: boolean } | null {
  const api = useApi();
  const q = useQuery({
    queryKey: ['chrome-urgent-help'],
    enabled,
    refetchInterval: 30_000,
    queryFn: () => request('GET', api.execution.GET('/delivery-help-requests', { params: { query: { size: URGENT_PAGE, state: 'OPEN' } } })),
  });
  if (!q.data) return null;
  return { n: (q.data.items ?? []).length, more: !!q.data.page?.nextCursor };
}

export function useDocumentTitle(screen: string | null, signedIn: boolean) {
  const urgent = useUrgentTotal(signedIn);
  const count = urgent && urgent.n > 0 ? `(${urgent.more ? `${urgent.n}+` : urgent.n}) ` : '';
  const title = `${count}${screen ? `${screen} | ` : ''}${TAB_APP}`;
  useEffect(() => {
    document.title = title;
  }, [title]);
  useEffect(
    () => () => {
      document.title = TAB_APP;
    },
    [],
  );
}

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

export function ConnectionBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const [wasOffline, setWasOffline] = useState(false);
  const [back, setBack] = useState(false);
  if (!online && !wasOffline) setWasOffline(true);
  if (online && wasOffline) {
    setWasOffline(false);
    setBack(true);
  }
  useEffect(() => {
    if (!back) return;
    const t = setTimeout(() => setBack(false), BACK_MS);
    return () => clearTimeout(t);
  }, [back]);
  if (!online)
    return (
      <div role="alert" className="flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-6 py-2 text-sm" data-testid="offline-banner">
        <span className="breathe h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
        <strong>{m.offline}</strong>
        <span className="text-base-content/70">{m.offlineHint}</span>
      </div>
    );
  if (back)
    return (
      <div role="status" className="border-b border-success/30 bg-success/10 px-6 py-2 text-sm text-success" data-testid="online-again">
        {m.onlineAgain}
      </div>
    );
  return null;
}

/** '/' — 이 화면 검색 조건 첫 칸으로(검색 조건이 없는 화면이면 아무 일 없음) */
export function useSlashToSearch() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const first = document.querySelector<HTMLElement>('main form[data-list-part="top"] :is(input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea):not([disabled])');
      if (first) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === 'pmart-dark';
  const name = dark ? ui.theme.toLight : ui.theme.toDark;
  return (
    <button type="button" className="btn btn-ghost btn-xs h-8 w-8 p-0" onClick={toggle} aria-label={name} title={name} data-testid="theme-toggle">
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
        )}
      </svg>
    </button>
  );
}
