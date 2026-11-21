// 첫 화면 대시보드. 숫자는 이미 있는 서버 조회에서만 — 매출처럼 서버에 없는 값은 만들지 않는다(백엔드 요청 2026-11-18-backend-dashboard-metrics).
// 역할로 보이는 메뉴의 칸만 그린다(판정은 서버, 403 이면 "?").
// 2판(2026-11-18 사용자 "대시보드가 아직 약하다 — Eum·추천 사이트 조합"): 짜임
//   머리(인사·자동 갱신) → 한눈에 숫자 카드 넷(가로) → [7일 주문 막대 | 오늘 주문 상태 도넛] → [내 할 일 | 최근 활동]
//   → 운영 위험 → [지금 배송 | 심사 대기 유형별] → 최근 주문 → 처리 기한 지킴 날짜별. (통계를 위로 — 사용자 2026-11-18)
// 개인정보: 주문 목록은 서버가 가린 값만(연락처 열은 보이지 않는다).
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import { ProblemFailure, request } from '@pmart/web-core';
import { useApi } from './ApiContext';
import { ALERT_SIZE, useAlertCount, type AlertKey } from './MenuAlerts';
import { ApprovalTypes, LiveSummary, RiskPanel } from './DashboardSections';
import { Insight, LineChart, Meter } from './Charts';
import { DashboardStatus } from './DashboardStatus';
import { DisplayNumber } from '../shared/displayNumber';
import { ActivityFeed, LiveStat, MetricsPanel, OrdersWeekChart, SalesPanel, ShortageTop, TopProducts, WorkCountsPanel, useWorkCounts, workText, type WorkSum, RefreshBar, RiskStat, SlaStat, StatusDonut, TodayOrdersStat, slaQuery } from './DashboardWidgets';
import { visibleGroups } from './nav';
import { useSession } from './SessionContext';
import { slaText } from '../features/cases/CaseSlaPage';
import { statusTone } from '../features/orders/OrderLookupPages';
import { messages } from '../shared/messages';
import { addSeoulDays, label, seoulDayEnd, seoulDayStart, seoulToday, when, won } from '../shared/ops';
import { DataTable, Section, StatusBadge } from '../shared/admin';
import { DashboardLayoutProvider, ResetLayout, Widget } from '../shared/WidgetMenu';
import { DashboardBoard } from './DashboardBoard';

const m = messages.dashboard;
const DAYS = 7;

const countText = (n: number, more: boolean, size: number) => (more ? `${size}+` : String(n));

/**
 * 내 할 일 한 줄(2026-11-18 사용자 작업 따라 해 보기 — "첫 화면에서 내가 할 일이 안 보인다", BO-28 "로그인·내 할 일").
 * 개수는 메뉴 알림과 같은 서버 조회(캐시 공유) — 0 이면 "없음", 못 읽으면 "?"(0 이 아님). 누르면 그 일만 걸러 둔 목록으로.
 */
function TaskRow({ alert, title, to, tone, group, exact }: { readonly alert: AlertKey; readonly title: string; readonly to: string; readonly tone: 'error' | 'warning' | 'info'; readonly group: string; readonly exact?: { readonly sum: WorkSum | null | undefined } }) {
  const alertQ = useAlertCount(alert);
  // exact 가 있으면(관리자) bff work-counts 의 정확한 지금 건수 — 쪽 상한에 걸리면 "N건 이상", 원천 실패 "?".
  // 없으면 메뉴 알림과 같은 첫 쪽 셈(50 넘으면 "50+").
  const sum = exact?.sum;
  const n = exact ? (sum ? sum.value : null) : (alertQ.data?.n ?? null);
  const failed = exact ? sum === null : alertQ.isError;
  const has = n !== null && n > 0;
  const text = exact ? (sum ? workText(sum) : sum === null ? '?' : '…') : alertQ.data ? countText(alertQ.data.n, alertQ.data.more, ALERT_SIZE) : alertQ.isError ? '?' : '…';
  // 2026-11-20 AWS 개편(대시보드 숫자 칸): 한 상자 안에 칸 사이 세로 선, 회색 이름 + 큰 숫자(점선 밑줄 링크). 색은 숫자에만
  const num = has ? { error: 'text-error', warning: 'text-[color-mix(in_oklab,var(--color-warning)_60%,var(--color-base-content))]', info: 'text-base-content' }[tone] : 'text-base-content/40';
  return (
    <Link
      to={to}
      data-testid={`dash-kpi-${alert}`}
      data-tone={has ? tone : 'none'}
      data-group={group}
      className="group flex min-w-0 flex-col gap-1 px-5 py-1"
    >
      <span className="flex items-center gap-1.5 truncate text-sm text-base-content/70">
        {has && tone !== 'info' && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'error' ? 'bg-error' : 'bg-warning'}`} aria-hidden="true" />}
        {title}
      </span>
      <span className={`self-start text-[28px] font-semibold leading-tight tracking-tight group-hover:text-primary ${num}`} {...(failed ? { title: m.failed } : {})}>
        {n === 0 ? '0' : text}
      </span>
      <span className={`text-xs ${has ? 'text-primary group-hover:underline' : 'text-base-content/50'}`}>{failed ? m.failedShort : n === 0 ? m.noneLeft : has ? `${m.go} →` : ' '}</span>
    </Link>
  );
}

function SlaCard({ from, to, days }: { readonly from: string; readonly to: string; readonly days: readonly string[] }) {
  const api = useApi();
  const q = useQuery(slaQuery(api, from, to));
  let body: ReactNode;
  if (q.isPending) body = <p className="text-sm text-base-content/50">…</p>;
  else if (q.isError)
    // 503 은 "원천에 닿지 않음"(0건 아님) — 백엔드 알림 2026-11-18 notice-metrics-case-sla §2
    body = (
      <p className="text-sm text-warning" data-testid="dash-sla-failed">
        {q.error instanceof ProblemFailure && q.error.problem.status === 503 ? m.slaUnreachable : m.slaFailed}
      </p>
    );
  else {
    let numerator = 0;
    let denominator = 0;
    let unjudged = 0;
    for (const t of q.data.totals ?? []) {
      numerator += t.numerator;
      denominator += t.denominator;
      unjudged += t.unjudged ?? 0;
    }
    const t = slaText({ numerator, denominator });
    const overdue = q.data.currentOverdue ? q.data.currentOverdue.reduce((n, o) => n + o.overdue, 0) : null;
    // 종류별(기한이 종류마다 달라 한 숫자로만 보이지 않는다 — 같은 알림 §2). 서버 분자·분모를 종류로 묶어 더한 값, 분모 큰 순 4개.
    const byKind = new Map<string, { n: number; d: number }>();
    for (const p of q.data.points ?? []) {
      const k = p.segment?.kind ?? '';
      const cur = byKind.get(k) ?? { n: 0, d: 0 };
      byKind.set(k, { n: cur.n + p.numerator, d: cur.d + p.denominator });
    }
    // 2026-11-20: 낮은 순(먼저 봐야 할 것 위) — 판정할 건이 없는 종류는 아래
    const rate = (v: { n: number; d: number }) => (v.d === 0 ? 2 : v.n / v.d);
    const kinds = [...byKind.entries()].sort((a, b) => rate(a[1]) - rate(b[1]) || b[1].d - a[1].d).slice(0, 4);
    const worst = kinds.find(([, v]) => v.d > 0);
    const byDay = new Map((q.data.totals ?? []).map((tt) => [tt.bucket.slice(0, 10), tt]));
    body = (
      <div className="space-y-4">
        <div className="grid items-end gap-6 sm:grid-cols-[12rem_1fr]">
          <div className="space-y-2">
            <div>
              <p className="text-[34px] font-semibold leading-tight tracking-tight" data-testid="dash-sla-ratio">{t.ratio}</p>
              <p className="text-xs text-base-content/55">{t.count}</p>
              {unjudged > 0 && <p className="text-xs text-base-content/55" data-testid="dash-sla-unjudged">{m.slaUnjudged(unjudged)}</p>}
            </div>
            <p className="text-sm">
              {m.overdueNow}{' '}
              <span className={`font-semibold ${overdue && overdue > 0 ? 'text-error' : ''}`} data-testid="dash-sla-overdue">
                {overdue === null ? m.unknown : `${overdue}건`}
              </span>
            </p>
          </div>
          <LineChart
            testId="dash-sla-trend"
            testIdPoint="dash-sla-day"
            label={m.sla}
            height="h-28"
            avg={denominator > 0 ? { value: numerator / denominator, text: m.slaAvg(t.ratio) } : null}
            points={days.map((d, i) => {
              const b = byDay.get(d);
              const r = b && b.denominator > 0 ? b.numerator / b.denominator : null;
              return { key: d, title: d, label: i === days.length - 1 ? m.today : d.slice(5).replace('-', '.'), value: r, tip: [[b ? slaText(b).ratio : m.slaNoClosed, m.sla] as const, [b ? slaText(b).count : '—', m.slaClosed] as const] };
            })}
          />
        </div>
        {worst && <Insight>{m.slaWorst(label(messages.cases.kindName, worst[0] || null), slaText({ numerator: worst[1].n, denominator: worst[1].d }).ratio)}</Insight>}
        {kinds.length > 0 && (
          <div className="space-y-1.5" data-testid="dash-sla-kinds">
            <p className="text-xs font-medium text-base-content/55">{m.slaByKindLow}</p>
            {kinds.map(([k, v]) => {
              const kt = slaText({ numerator: v.n, denominator: v.d });
              const pct = v.d === 0 ? null : Math.round((v.n / v.d) * 100);
              return (
                <div key={k} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate" title={k}>
                    {label(messages.cases.kindName, k || null)}
                  </span>
                  <Meter value={pct === null ? null : pct / 100} tone={pct !== null && k === worst?.[0] ? 'danger' : 'neutral'} className="-mt-1 w-full" />
                  <span className="whitespace-nowrap text-xs tabular-nums text-base-content/65">{`${kt.ratio} · ${kt.count}`}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  return (
    <Section title={m.sla} aside={<Link className="link text-xs" to="/case-sla">{m.more}</Link>} testId="dash-sla">
      {body}
    </Section>
  );
}

function RecentOrders({ from, to }: { readonly from: string; readonly to: string }) {
  const api = useApi();
  const q = useQuery({
    queryKey: ['dashboard', 'recent-orders', from, to],
    queryFn: () => request('GET', api.orders.GET('/orders/lookups', { params: { query: { createdFrom: seoulDayStart(from), createdTo: seoulDayEnd(to), page: 0, size: 6 } } })),
  });
  return (
    <Section title={m.recentOrders} aside={<Link className="link text-xs" to="/orders">{m.more}</Link>} testId="dash-recent-orders">
      {q.isPending ? (
        <p className="text-sm text-base-content/50">…</p>
      ) : q.isError ? (
        <p className="text-sm text-warning">{m.ordersFailed}</p>
      ) : q.data.items.length === 0 ? (
        <p className="text-sm text-base-content/55">{m.noOrders}</p>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th>{messages.orders.orderNumberCol}</th>
              <th>{messages.orders.status}</th>
              <th>{messages.orders.confirmedAt}</th>
              <th>{messages.orders.mfcId}</th>
              <th className="text-right">{messages.orders.approvedAmount}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((o) => (
              <tr key={o.orderId} data-testid="dash-order-row">
                <td>
                  <Link className="link text-sm" to={`/orders/${encodeURIComponent(o.orderId)}`}>
                    <DisplayNumber number={o.orderNumber} systemId={o.orderId} />
                  </Link>
                </td>
                <td>
                  <StatusBadge tone={statusTone(o.status)}>{label(messages.orders.statusName, o.status)}</StatusBadge>
                </td>
                <td>{when(o.confirmedAt)}</td>
                <td>{o.mfcId}</td>
                <td className="text-right tabular-nums">{won(o.approvedAmount)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Section>
  );
}

export function DashboardPage() {
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const paths = new Set(visibleGroups(roles).flatMap((g) => g.items.map((i) => i.to)));
  const can = (p: string) => paths.has(p);
  const claimsCases = roles.includes('RIDER_OPS') || roles.includes('OPERATOR_ADMIN');
  // 지금 일 건수(bff 0.15.0 work-counts) — 관리자만(그 밖 403이라 부르지 않는다)
  const admin = roles.includes('OPERATOR_ADMIN');
  const wc = useWorkCounts(admin);
  const exact = (sum: WorkSum | null | undefined) => (admin ? { sum } : undefined);
  const today = seoulToday();
  const days = Array.from({ length: DAYS }, (_, i) => addSeoulDays(today, i - (DAYS - 1)));
  const weekFrom = days[0]!;

  // 내 할 일 — 급한 것부터(기한 넘김 → 아무도 안 맡음 → 처리 대기 → 답변 대기 → 심사 대기). 역할로 보이는 메뉴만.
  const tasks: ReactNode[] = [];
  if (can('/cases') && claimsCases) tasks.push(<TaskRow key="overdue" alert="casesOverdue" title={m.casesOverdue} to="/cases?tab=overdue" tone="error" group="support" {...(exact(wc.sum('CASES', 'OVERDUE')) ? { exact: exact(wc.sum('CASES', 'OVERDUE'))! } : {})} />);
  if (can('/cases') && claimsCases) tasks.push(<TaskRow key="unassigned" alert="casesUnassigned" title={m.casesUnassigned} to="/cases?tab=unassigned" tone="warning" group="support" {...(exact(wc.sum('CASES', 'UNASSIGNED')) ? { exact: exact(wc.sum('CASES', 'UNASSIGNED'))! } : {})} />);
  if (can('/pending')) tasks.push(<TaskRow key="pending" alert="pending" title={m.pending} to="/pending" tone="warning" group="pending" {...(exact(wc.sum('PENDING_WORK', 'COUNT')) ? { exact: exact(wc.sum('PENDING_WORK', 'COUNT'))! } : {})} />);
  if (can('/inquiries')) tasks.push(<TaskRow key="inq" alert="inquiries" title={m.inquiries} to="/inquiries?status=RECEIVED" tone="info" group="cs" {...(exact(wc.sum('INQUIRIES', 'AWAITING_ANSWER', 'CUSTOMER')) ? { exact: exact(wc.sum('INQUIRIES', 'AWAITING_ANSWER', 'CUSTOMER'))! } : {})} />);
  if (can('/rider-inquiries')) tasks.push(<TaskRow key="rinq" alert="riderInquiries" title={m.riderInquiries} to="/rider-inquiries?status=RECEIVED" tone="info" group="support" {...(exact(wc.sum('INQUIRIES', 'AWAITING_ANSWER', 'RIDER')) ? { exact: exact(wc.sum('INQUIRIES', 'AWAITING_ANSWER', 'RIDER'))! } : {})} />);
  if (can('/approvals')) tasks.push(<TaskRow key="apv" alert="approvals" title={m.approvals} to="/approvals?reviewState=REVIEW_PENDING" tone="info" group="approval" {...(exact(wc.sum('APPROVALS', 'DECIDABLE_BY_ME')) ? { exact: exact(wc.sum('APPROVALS', 'DECIDABLE_BY_ME'))! } : {})} />);

  // 한눈에 숫자 카드(오른쪽 세로) — Eum 숫자 카드 + 오늘 주문은 어제 대비·7일 추세선
  const stats: ReactNode[] = [];
  if (can('/orders')) stats.push(<TodayOrdersStat key="orders" days={days} />);
  if (can('/live-delivery')) stats.push(<LiveStat key="live" />);
  if (can('/case-sla')) stats.push(<SlaStat key="sla" from={weekFrom} to={today} />);
  if (can('/pending')) stats.push(<RiskStat key="risk" />);

  const activity = { approvals: can('/approvals'), cases: can('/cases'), inquiries: can('/inquiries') };
  const hasActivity = activity.approvals || activity.cases || activity.inquiries;

  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));

  // 탭(2026-11-18 사용자 "스크롤을 내려서 봐야 할 정도로 양이 많다" — Shopify·Medusa 처럼 첫 화면은 지금 할 일, 통계는 따로).
  // 한눈에(기본) = 숫자 카드 · 최근 본 · 내 할 일 | 최근 활동 / 운영 = 지금 배송·심사 유형·지금 일 전체·운영 위험·기한 지킴 / 매출·통계 = 주문 추세·매출·최근 주문·지표.
  // 볼 것이 없는 탭은 숨긴다. 고른 탭은 주소(?tab=)에 — 안 보이는 탭 주소면 한눈에. 고른 탭의 덩어리만 그려서 그 조회만 부른다.
  const showOps = can('/live-delivery') || can('/approvals') || can('/pending') || can('/case-sla') || admin;
  const showSales = can('/orders') || admin;
  // 보드(2026-11-20 사용자 "보드로 보기") — 내 할 일과 같은 서버 조회로 칸, 볼 일이 하나라도 있는 역할만.
  // 2026-11-21 사용자 "한눈에탭 밑에다가 보드 내용 그대로 붙이고 보드탭은 없애" — 탭을 없애고 한눈에 숫자 칸 아래에 붙인다(옛 ?tab=board 주소는 한눈에로).
  const board = { cases: can('/cases') && claimsCases, inquiries: can('/inquiries'), riderInquiries: can('/rider-inquiries'), approvals: can('/approvals') };
  const showBoard = board.cases || board.inquiries || board.riderInquiries || board.approvals;
  const tabs = [{ id: 'overview', label: m.tabs.overview }, ...(showOps ? [{ id: 'ops', label: m.tabs.ops }] : []), ...(showSales ? [{ id: 'sales', label: m.tabs.sales }] : [])] as const;
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'overview';

  return (
    <DashboardLayoutProvider>
    <section className="space-y-5" data-testid="dashboard">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{m.hello(hour)}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ResetLayout />
          <RefreshBar />
        </div>
      </header>

      {/* 숫자 띠(2026-11-19 사용자가 보여 준 배송 관제 화면 참고 — 탭과 상관없이 늘 맨 위, 급한 것부터). 누르면 그 일만 모은 목록 */}
      {tasks.length > 0 && (
        <section aria-labelledby="dash-my-work" data-testid="dash-my-work" className="rounded-box border border-base-300 bg-base-100 pb-4 pt-4">
          <h2 id="dash-my-work" className="px-5 pb-3 text-lg font-bold">
            {m.myWork}
          </h2>
          {/* 칸 사이 세로 선(AWS 리소스 숫자 칸) */}
          <div className="grid grid-cols-2 gap-y-4 md:grid-cols-3 2xl:grid-cols-6 [&>a]:border-l [&>a]:border-base-300">{tasks}</div>
        </section>
      )}

      {/* 이상 없음 / 이상 N — 기한 지난 접수 건·약속 넘긴 배송(서버 숫자), 못 읽으면 "확인 못 함" */}
      <DashboardStatus cases={can('/cases') && claimsCases} live={can('/live-delivery')} />

      {/* 가운데 = 탭 내용, 오른쪽 = 최근 활동(넓은 화면에서 붙어 있음) */}
      <div className={`grid items-start gap-5 ${hasActivity ? 'xl:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
      <div className="min-w-0 space-y-5">
      {tabs.length > 1 && (
        <div role="tablist" aria-label={m.tabs.label} className="flex gap-1 border-b border-base-300" data-testid="dash-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${tab === t.id ? 'border-primary font-bold text-primary' : 'border-transparent text-base-content/60 hover:text-base-content'}`}
              onClick={() => setParams(t.id === 'overview' ? {} : { tab: t.id }, { replace: true })}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <div role="tabpanel" aria-label={m.tabs.overview} className="space-y-5">
          {/* 숫자 카드(가로) — 누르면 그 화면으로 */}
          {stats.length > 0 && (
            <div className="pm-stat-strip flex flex-wrap gap-px overflow-hidden rounded-box border border-base-300 bg-base-300" aria-label={m.glance} data-testid="dash-glance">
              {stats}
            </div>
          )}

          {/* 보드 — 지금 처리할 건(2026-11-21 보드 탭을 여기로) */}
          {showBoard && <DashboardBoard {...board} />}

          {/* 최근 본 항목 줄은 뺐다(2026-11-20 사용자 "대시보드가 메인인데 없어 보이게 떠 있어야 하니") — 통합 조회·배송 확인 빈 화면에만 */}

          {tasks.length === 0 && stats.length === 0 && !hasActivity && !showBoard && <p className="text-sm text-base-content/60">{m.nothing}</p>}
        </div>
      )}

      {tab === 'ops' && (
        <div role="tabpanel" aria-label={m.tabs.ops} className="space-y-5">
          {/* 두 기둥을 따로 쌓는다(높이가 달라도 빈 틈 없이) —
              왼쪽: 지금 배송(늦음·라이더 없음·전달 실패) → 진행 중 배송 상태별(관리자), 오른쪽: 심사 대기 유형별 → 지금 일 전체(관리자) */}
          {(can('/live-delivery') || can('/approvals') || admin) && (
            <div className="grid items-start gap-4 lg:grid-cols-3">
              {(can('/live-delivery') || admin) && (
                <div className={`space-y-4 ${can('/approvals') || admin ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
                  {can('/live-delivery') && <Widget id="live"><LiveSummary /></Widget>}
                  {admin && <Widget id="work-deliveries"><WorkCountsPanel part="deliveries" /></Widget>}
                  {/* 운영 위험도 왼쪽 기둥 아래 — 오른쪽(심사 대기 + 지금 일 전체)과 높이가 비슷해진다 */}
                  {can('/pending') && <Widget id="risk"><RiskPanel /></Widget>}
                </div>
              )}
              {(can('/approvals') || admin) && (
                <div className="space-y-4">
                  {can('/approvals') && <Widget id="approval-types"><ApprovalTypes /></Widget>}
                  {admin && <Widget id="work-tiles"><WorkCountsPanel part="tiles" /></Widget>}
                </div>
              )}
            </div>
          )}

          {/* 운영 위험만 볼 수 있고 왼쪽 기둥이 없는 역할(처리 대기 메뉴만)일 때 */}
          {can('/pending') && !(can('/live-delivery') || admin) && <Widget id="risk"><RiskPanel /></Widget>}

          {/* 처리 기한 지킴(최근 7일) — 아래 한 줄 */}
          {can('/case-sla') && <Widget id="sla"><SlaCard from={weekFrom} to={today} days={days} /></Widget>}
        </div>
      )}

      {tab === 'sales' && (
        <div role="tabpanel" aria-label={m.tabs.sales} className="space-y-5">
          {/* 2026-11-20 그림 개편: 맨 위 매출 숫자 줄(관리자) → 7일 주문 | 오늘 상태 → 상품별 판매 | 지표 → 최근 주문 */}
          {admin && <Widget id="sales"><SalesPanel from={weekFrom} to={today} /></Widget>}

          {can('/orders') && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Widget id="orders-week"><OrdersWeekChart days={days} admin={admin} /></Widget>
              </div>
              <Widget id="status-donut"><StatusDonut today={today} admin={admin} /></Widget>
            </div>
          )}

          {(admin || can('/case-sla')) && (
            <div className={`grid items-start gap-4 ${admin && can('/case-sla') ? 'xl:grid-cols-2' : ''}`}>
              {admin && <Widget id="top-products"><TopProducts from={weekFrom} to={today} /></Widget>}
              {can('/case-sla') && <Widget id="metrics"><MetricsPanel from={weekFrom} to={today} /></Widget>}
            </div>
          )}

          {/* bff 0.23.0 결품 많은 상품(관리자) */}
          {admin && <Widget id="shortage-top"><ShortageTop from={weekFrom} to={today} /></Widget>}

          {can('/orders') && <Widget id="recent-orders"><RecentOrders from={weekFrom} to={today} /></Widget>}
        </div>
      )}
      </div>
      {/* 오른쪽 패널 — 최근 활동(승인·접수 건·문의, 최신 순). 넓은 화면에선 내려도 붙어 있다 */}
      {hasActivity && (
        <aside className="xl:sticky xl:top-4" data-testid="dash-side">
          <ActivityFeed {...activity} />
        </aside>
      )}
      </div>
    </section>
    </DashboardLayoutProvider>
  );
}
