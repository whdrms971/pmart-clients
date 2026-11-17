// 권한 요청 입력 규칙(hr-service 0.6.0 · employee-auth 0.11.0 — 백엔드 요청 hr-backoffice/2026-11-17-request-grant-request-validation, HR-2).
// 화면 검사는 입력 도움일 뿐 — 판정은 서버(400 VALIDATION_FAILED·409 GRANT_ALREADY_ACTIVE).
// - 센터: 역할 목록 `centerScoped` 대로(역할 코드를 화면에 고정하지 않는다). true 면 1개 이상 필수, false 면 보내지 않는다.
// - 한 요청에 역할은 한 번(여러 센터는 한 줄의 centers 에).
// - 이미 가진 권한: 같은 역할 + 센터가 겹치고(센터가 필요 없는 역할은 센터 상관없음) + 기간이 지금 이후로 겹치면. validUntil 은 "이 시각부터 무효"라
//   마지막 날 = 서울 날짜로 그 전날.
import { ProblemFailure, type EmployeeGrant, type EmployeeRole } from '@pmart/web-core';

const DAY = 86_400_000;
const KST = 9 * 3_600_000;

export const needsCenter = (roles: readonly EmployeeRole[], code: string): boolean => roles.find((r) => r.code === code)?.centerScoped ?? false;

/** 서울 날짜 YYYY-MM-DD */
const seoulDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10);
/** 서울 날짜 YYYY-MM-DD 의 0시(UTC ms) */
const seoulStart = (date: string) => Date.parse(`${date}T00:00:00+09:00`);

/**
 * validUntil(이 시각부터 무효) → 마지막 날(서울 날짜) = 그 직전 순간의 날짜. 없으면 null(기한 없음).
 * 자정에 끝나면 전날, 회수처럼 낮에 끝나면 그날(하루를 빼면 회수된 줄이 하루 일찍 끝난 것처럼 보인다 — 검토 지적 2026-11-17).
 */
export const lastDayOf = (validUntil: string | null | undefined): string | null => (validUntil ? seoulDate(Date.parse(validUntil) - 1) : null);

/** 끝나지 않은 권한(유효하거나 시작 전) — 회수된 줄은 validUntil = 회수 시각이라 자연히 빠진다 */
export const activeGrants = (grants: readonly EmployeeGrant[], now: number): EmployeeGrant[] =>
  grants.filter((g) => !g.revokedAt && (!g.validUntil || Date.parse(g.validUntil) > now));

export interface GrantDraftLike {
  readonly role: string;
  readonly centers: readonly string[];
  readonly validFrom: string;
  readonly validTo: string;
}

/**
 * 이 요청과 겹치는 이미 가진 권한(미리 경고용 — 서버가 정본). 요청 기간을 비우면 서버는 근무 기간으로 보므로(정규직은 끝 없음) 끝을 열어 둔다.
 * 요청 시작을 비우면 오늘부터로 본다.
 */
export function overlappingGrants(existing: readonly EmployeeGrant[], draft: GrantDraftLike, centerScoped: boolean, now: number): EmployeeGrant[] {
  if (!draft.role) return [];
  const start = draft.validFrom ? seoulStart(draft.validFrom) : now;
  const end = draft.validTo ? seoulStart(draft.validTo) + DAY : Number.POSITIVE_INFINITY;
  return activeGrants(existing, now).filter((g) => {
    if (g.role !== draft.role) return false;
    if (centerScoped && !g.centers.some((c) => draft.centers.includes(c))) return false;
    const gStart = Date.parse(g.validFrom);
    const gEnd = g.validUntil ? Date.parse(g.validUntil) : Number.POSITIVE_INFINITY;
    return start < gEnd && gStart < end;
  });
}

/** 400·409 의 줄별 문제 — `details[].field` 가 `<list>[i]…` 인 것. index -1 = 목록 전체(예: 같은 역할 두 줄) */
export interface LineProblem {
  readonly index: number;
  readonly part: 'role' | 'centers' | 'line' | 'list';
  readonly reason: string;
}

export function lineProblems(failure: unknown, list: 'grants' | 'requestedGrants'): LineProblem[] {
  if (!(failure instanceof ProblemFailure)) return [];
  return failure.problem.details.flatMap((d): LineProblem[] => {
    const field = d.field ?? '';
    if (field === list) return [{ index: -1, part: 'list', reason: d.reason ?? '' }];
    const hit = new RegExp(`^${list}\\[(\\d+)\\](?:\\.(role|centers))?$`).exec(field);
    if (!hit) return [];
    const part = hit[2] === 'role' ? 'role' : hit[2] === 'centers' ? 'centers' : 'line';
    return [{ index: Number(hit[1]), part, reason: d.reason ?? '' }];
  });
}

/** 409 GRANT_ALREADY_ACTIVE reason `existingGrantId=…;role=…;centers=A,B;validFrom=…;validUntil=…|none;extension=true|false` */
export function parseConflict(reason: string): { existingGrantId?: string; extension: boolean } {
  const kv = new Map(
    reason
      .split(';')
      .map((p) => p.split('='))
      .filter((p): p is [string, string] => p.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()] as const),
  );
  const id = kv.get('existingGrantId');
  return { ...(id ? { existingGrantId: id } : {}), extension: kv.get('extension') === 'true' };
}

/** 서버가 준 사람이 읽는 문장(있으면 그대로 보인다 — 요청서 §5) */
export const problemDetail = (failure: unknown): string | null =>
  failure instanceof ProblemFailure && failure.problem.detail ? failure.problem.detail : null;
