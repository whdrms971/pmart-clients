// 화면 틀 보탬(2026-11-19 사용자 "더더 UI UX 업그레이드") — 여러 탭을 띄워 두고 일하는 관제·상담 화면을 위해.
// 1) 브라우저 탭 제목: 지금 화면 이름 + 기한 넘긴 접수 건 수 — 다른 탭에 있어도 탭 제목에서 급한 일이 보인다.
// 2) 인터넷 끊김 띠: 끊긴 동안 화면 숫자가 최신이 아님을 알린다(조회 실패를 정상처럼 보이지 않게). 다시 이어지면 잠깐 알리고 화면은 저절로 다시 읽는다(TanStack Query 재연결 다시 읽기).
import { useEffect, useState, useSyncExternalStore } from 'react';

import { messages } from '../shared/messages';
import { useUrgentTotal } from './MenuAlerts';

const m = messages.chrome;
const BASE = '통합백오피스'; // 탭 제목 "화면 | 통합백오피스"(2026-11-21 사용자)
const BACK_MS = 4_000;

/** 탭 제목 — "(3) 접수 건 | 통합백오피스". 숫자는 서버가 센 기한 넘김(50 넘으면 50+), 못 읽으면 숫자 없이 */
export function useDocumentTitle(screen: string | null) {
  const urgent = useUrgentTotal();
  useEffect(() => {
    const count = urgent && urgent.n > 0 ? `(${urgent.more ? `${urgent.n}+` : urgent.n}) ` : '';
    document.title = `${count}${screen ? `${screen} | ` : ''}${BASE}`;
  }, [screen, urgent]);
  useEffect(
    () => () => {
      document.title = BASE;
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
      <div role="alert" className="flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-6 py-2 text-sm text-warning-content" data-testid="offline-banner">
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
