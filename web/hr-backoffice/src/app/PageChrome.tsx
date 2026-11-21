// 화면 틀 보탬(2026-11-19 사용자 "계속 넣어" — 백오피스 #214 와 같게, 이 앱에서 따로 고친다).
// 1) 브라우저 탭 제목: 지금 화면 이름 + 계정 발급 실패 수(첫 화면 숫자 띠와 같은 조회 — 서버가 센 수).
// 2) 인터넷 끊김 띠: 끊긴 동안 화면 숫자가 최신이 아님을 알린다. 다시 이어지면 잠깐 알리고 화면은 저절로 다시 읽는다.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { request } from '@pmart/web-core';

import { messages } from '../shared/messages';
import { useApi } from './ApiContext';
import { useSession } from './SessionContext';

const m = messages.chrome;
const BASE = '인사백오피스'; // 탭 제목 "화면 | 인사백오피스"(2026-11-21 사용자)
const BACK_MS = 4_000;

/** 탭 제목 — "(2) 직원 목록 | 인사백오피스". 숫자는 계정 발급 실패(서버 counts), 못 읽으면 숫자 없이 */
export function useDocumentTitle(screen: string | null) {
  const api = useApi();
  const { session } = useSession();
  const hr = !!session?.roles.includes('HR_ADMIN');
  const q = useQuery({
    queryKey: ['hr', 'employee-counts'],
    queryFn: () => request('GET', api.hr.GET('/hr/employees/counts', { params: { query: { endingWithinDays: 7 } } })),
    enabled: hr,
  });
  const failed = hr ? q.data?.provisioningFailed : undefined;
  // 서버가 다 세지 못했으면(complete=false) 수 뒤에 + (첫 화면 숫자 띠와 같게)
  const count = failed && failed.value > 0 ? `(${failed.value}${failed.complete ? '' : '+'}) ` : '';
  useEffect(() => {
    document.title = `${count}${screen ? `${screen} | ` : ''}${BASE}`;
  }, [screen, count]);
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
      <div role="alert" className="flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-6 py-2 text-sm" data-testid="offline-banner">
        <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
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
