import { AppLauncher, UiTextProvider } from '@pmart/web-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { createBrowserRouter, createMemoryRouter, Link, NavLink, Outlet, RouterProvider, useLocation } from 'react-router';

import { env } from '../env';
import { DepartmentsPage } from '../features/departments/departments';
import { PermissionDetailPage, PermissionsPage } from '../features/permissions/PermissionsPage';
import { EmployeeDetailPage } from '../features/employees/EmployeeDetailPage';
import { EmployeeListPage } from '../features/employees/EmployeeListPage';
import { EmployeeRegisterPage } from '../features/employees/EmployeeRegisterPage';
import { LoginCallbackPage, LoginPage } from '../features/session/LoginPage';
import { SessionPage } from '../features/session/SessionPage';
import { useMe } from '../features/session/useMe';
import { messages as m } from '../shared/messages';
import { RequireSession, SessionProvider, useSession } from './SessionContext';
import { useMenuCollapsed } from '../shared/sideMenu';
import { HomePage } from './HomePage';
import { QuickFind } from './QuickFind';
import { ThemeToggle } from './ThemeToggle';
import { Toasts } from './Toasts';

const nav: ReadonlyArray<readonly [string, string]> = [
  ['/', m.nav.home],
  ['/employees', m.nav.employees],
  ['/employees/new', m.nav.register],
  ['/departments', m.nav.departments],
  ['/permissions', m.nav.permissions],
];

/** 접힌 메뉴(64px)의 메뉴별 아이콘 — 인사팀은 묶음이 하나라 백오피스처럼 묶음 아이콘만 남기면 쓸 데가 없어 메뉴마다 하나씩 */
const RAIL_ICON: Readonly<Record<string, string>> = {
  '/': 'M3 11 12 4l9 7M5 10v10h14V10',
  '/employees': 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  '/employees/new': 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 12-4.9M19 14v6M16 17h6',
  '/departments': 'M4 21V5l8-2 8 2v16M9 21v-5h6v5M8 9h2m4 0h2M8 13h2m4 0h2',
  '/permissions': 'M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6l-8-3Z',
};

/**
 * 메뉴로 다른 화면에 가면 새 화면을 맨 위부터 보인다(사용자 2026-11-17 — 아래쪽 메뉴를 누르면 스크롤을 다시 올려야 했다).
 * 같은 화면에서 거르기·탭(쿼리)만 바뀔 때는 그대로 둔다(경로가 바뀔 때만).
 */
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
  }, [pathname]);
  return null;
}

function Layout() {
  const { session } = useSession();
  // 메뉴에는 이름을 보인다(운영자 ID 는 길다). 이름을 아직 못 받았거나 인사 기록이 없으면 "내 세션"만.
  const me = useMe();
  const myName = me.data?.name;
  const { pathname } = useLocation();
  // 메뉴 접기(2026-11-19 사용자 "인사팀은 왜 메뉴 바를 접는 옵션이 없어?" — 백오피스 #171 과 같게, 기억은 이 브라우저에만)
  const [collapsed, toggleMenu] = useMenuCollapsed();
  // 머리줄 위치(가장 긴 메뉴 경로 — /employees/new 는 직원 등록, /employees/xxx 는 직원 목록)
  const current = [...nav].sort((x, y) => y[0].length - x[0].length).find(([to]) => pathname === to || pathname.startsWith(`${to}/`));
  // 화면 틀(2026-11-18 — PC 5 요청 "관리자 형식", 사본: rider-backoffice App.tsx Layout PR #93 461ff31 — 이 앱에서 따로 고친다)
  return (
    <div className="flex min-h-screen bg-base-200">
      <ScrollToTopOnNavigate />
      {/* 메뉴는 화면 높이에 고정하고 길면 메뉴만 따로 스크롤(오른쪽 화면을 내려도 메뉴는 그 자리) */}
      <aside className={`sticky top-0 flex h-screen shrink-0 flex-col self-start overflow-y-auto bg-neutral text-neutral-content transition-[width] ${collapsed ? 'w-16' : 'w-60'}`} data-testid="side-menu" data-collapsed={collapsed}>
        <div className={`flex h-14 shrink-0 items-center gap-1 border-b border-neutral-content/10 ${collapsed ? 'justify-center px-1' : 'justify-between pl-5 pr-2'}`}>
          {!collapsed && (
            <Link to="/" className="truncate text-base font-bold text-neutral-content" aria-label={m.goHome}>
              {m.appTitle}
            </Link>
          )}
          <button type="button" className="btn btn-ghost btn-sm h-8 w-8 p-0 text-neutral-content/70 hover:bg-neutral-content/10" onClick={toggleMenu} aria-label={collapsed ? m.nav.expand : m.nav.collapse} title={collapsed ? m.nav.expand : m.nav.collapse} data-testid="menu-toggle">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {collapsed ? <path d="m9 6 6 6-6 6M4 4v16" /> : <path d="m15 6-6 6 6 6M20 4v16" />}
            </svg>
          </button>
        </div>
        {collapsed ? (
          <nav aria-label="메뉴" className="flex flex-1 flex-col items-center gap-1 py-3">
            {nav.map(([to, label]) => {
              const active = current?.[0] === to;
              return (
                <Link key={to} to={to} aria-label={label} title={label} aria-current={active ? 'page' : undefined} className={`flex h-10 w-10 items-center justify-center rounded-lg ${active ? 'bg-accent/20 text-accent' : 'text-neutral-content/80 hover:bg-neutral-content/10'}`} data-testid={`nav-rail-${to === '/' ? 'home' : to.slice(1).replace('/', '-')}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={RAIL_ICON[to]} />
                  </svg>
                </Link>
              );
            })}
          </nav>
        ) : (
          // 메뉴(2026-11-19 사용자 "백오피스 화면이랑 같게"): 백오피스 묶음 모양 — 굵은 묶음 이름 + 아이콘, 들여 쓴 하위 메뉴, 선택은 민트 막대. 묶음이 하나라 늘 펼침
        <nav aria-label="메뉴" className="flex-1 py-3">
          <div className="mx-2 mb-1 rounded-lg bg-neutral-content/5" data-testid="nav-group-hr">
            <p className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] font-bold ${current ? 'text-accent' : 'text-neutral-content'}`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="8" r="3.5" />
                <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6.5 6.5 0 0 0-2.5-5.1" />
              </svg>
              <span>{m.nav.group}</span>
            </p>
            <ul className="pb-2">
              {nav.map(([to, label]) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end
                    className={({ isActive }) =>
                      `my-0.5 ml-5 mr-1 flex items-center gap-1 rounded-r-lg border-l-4 py-2 pl-4 pr-3 text-[13px] transition-colors active:scale-[0.98] ${isActive ? 'border-accent bg-accent/20 font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]' : 'border-neutral-content/10 text-neutral-content/70 hover:bg-neutral-content/10 hover:text-neutral-content'}`
                    }
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-base-300 bg-base-100 px-6">
          <p className="truncate text-sm text-base-content/60" data-testid="page-title">
            {current ? (
              <>
                {m.nav.group} <span className="px-1 text-base-content/30">›</span>
                <span className="font-semibold text-base-content">{current[1]}</span>
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-2 text-sm">
            {/* 직원 바로 찾기(Ctrl+K, 2026-11-19 — 백오피스 번호 찾기 자리) — 로그인했을 때만 */}
            {session && <QuickFind />}
            {env.isMock && <span className="badge badge-accent badge-sm">{m.mockBadge}</span>}
            {/* 밝은/어두운 테마(2026-11-18, 백오피스와 같음) */}
            <ThemeToggle />
            {/* 로그인 직원 — 이름(없으면 "내 세션"). 로그인 시험이 이 링크 이름으로 찾는다 */}
            <NavLink to={session ? '/session' : '/login'} className={session ? 'btn btn-ghost btn-xs font-normal' : 'btn btn-primary btn-xs'}>
              {session ? (myName ? `${m.nav.session}: ${myName}` : m.nav.session) : m.nav.login}
            </NavLink>
            {/* 직원 웹 앱 바꾸기(백엔드 요청 all/2026-11-17-request-app-launcher) — 2026-11-18 사용자: Google 앱 런처처럼 머리줄 맨 오른쪽("내 세션" 오른쪽, 사용자 2026-11-18). 링크만, 세션을 읽지 않는다 */}
            <AppLauncher current="hr-backoffice" />
          </div>
        </header>
        <main className="min-w-0 flex-1 space-y-4 p-6">
          {/* 안내만 한다 — 화면을 막지 않고, 판정은 서버(403 → 이용할 수 없는 화면) */}
          {session && !session.roles.includes('HR_ADMIN') && (
            <p role="note" className="alert alert-warning text-sm">
              {m.noHrRole}
            </p>
          )}
          <Outlet />
        </main>
        {/* 처리 결과 알림(2026-11-18, 백오피스와 같음) */}
        <Toasts />
      </div>
    </div>
  );
}

const guarded = (element: ReactNode) => <RequireSession>{element}</RequireSession>;

const routes = [
  { path: '/login', element: <LoginPage /> },
  // employee-auth 복귀 주소(백엔드 허용 목록의 <출처>/auth/callback)
  { path: '/auth/callback', element: <LoginCallbackPage /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: guarded(<HomePage />) },
      { path: 'session', element: guarded(<SessionPage />) },
      { path: 'employees', element: guarded(<EmployeeListPage />) },
      { path: 'employees/new', element: guarded(<EmployeeRegisterPage />) },
      { path: 'employees/:operatorId', element: guarded(<EmployeeDetailPage />) },
      { path: 'departments', element: guarded(<DepartmentsPage />) },
      { path: 'permissions', element: guarded(<PermissionsPage />) },
      { path: 'permissions/:operatorId', element: guarded(<PermissionDetailPage />) },
    ],
  },
];

/** 재시도는 pmartFetch(429·retryable) 규칙만 따른다. TanStack Query 의 자동 재시도는 끈다. */
export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

export function App({
  queryClient = createQueryClient(),
  memory = false,
  initialPath = '/',
  initialToken,
}: {
  readonly queryClient?: QueryClient;
  readonly memory?: boolean;
  readonly initialPath?: string;
  /** 테스트에서 바로 세션을 시작한다. */
  readonly initialToken?: string;
}) {
  const router = memory ? createMemoryRouter(routes, { initialEntries: [initialPath] }) : createBrowserRouter(routes);
  return (
    <QueryClientProvider client={queryClient}>
      <UiTextProvider problem={m.problem} reason={m.reason}>
        <SessionProvider {...(initialToken ? { initialToken } : {})}>
          <RouterProvider router={router} />
        </SessionProvider>
      </UiTextProvider>
    </QueryClientProvider>
  );
}
