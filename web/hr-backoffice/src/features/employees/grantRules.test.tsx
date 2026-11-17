// 권한 요청 입력 규칙(hr 0.6.0 HR-2) — 센터 칸은 centerScoped 대로, 한 요청에 역할 한 번, 이미 가진 권한 경고, 400·409 줄별 표시
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderAt } from '../../test/render';
import { lastDayOf, overlappingGrants, parseConflict } from './grantRules';

/** 등록 화면 기본 정보(정규직·본사 부서 HR) */
async function fillBasics() {
  await userEvent.type(screen.getByLabelText('이름'), '나검사');
  await userEvent.type(screen.getByLabelText(/메일 ID/), 'grant.check');
  await userEvent.type(screen.getByLabelText('부서 코드'), 'CS');
  fireEvent.change(screen.getByLabelText('근무 시작일'), { target: { value: '2026-12-01' } });
}

describe('규칙 계산', () => {
  it('마지막 날 = validUntil 전날(서울), 겹침은 같은 역할·센터·기간', () => {
    expect(lastDayOf('2027-03-01T00:00:00+09:00')).toBe('2027-02-28');
    expect(lastDayOf(null)).toBeNull();
    expect(lastDayOf('2026-11-17T06:30:00Z')).toBe('2026-11-17'); // 회수(서울 15:30) — 그날까지 유효였다
    const g = { grantId: 'G1', approvalId: 'A', approverId: 'X', role: 'MFC_WORKER', centers: ['C1'], validFrom: '2026-09-01T00:00:00+09:00', validUntil: '2027-03-01T00:00:00+09:00', appliedAt: '2026-09-01T00:00:00Z' };
    const now = Date.parse('2026-11-17T00:00:00+09:00');
    expect(overlappingGrants([g], { role: 'MFC_WORKER', centers: ['C1'], validFrom: '', validTo: '' }, true, now)).toHaveLength(1);
    expect(overlappingGrants([g], { role: 'MFC_WORKER', centers: ['C2'], validFrom: '', validTo: '' }, true, now)).toHaveLength(0); // 다른 센터
    expect(overlappingGrants([g], { role: 'MFC_WORKER', centers: ['C1'], validFrom: '2027-03-01', validTo: '' }, true, now)).toHaveLength(0); // 끝난 다음 날부터
    expect(parseConflict('existingGrantId=G1;role=MFC_WORKER;centers=C1;validFrom=x;validUntil=none;extension=true')).toEqual({ existingGrantId: 'G1', extension: true });
  });
});

describe('직원 등록 — 요청 권한', () => {
  it('센터가 필요 없는 역할은 센터 칸 대신 안내, 센터 역할에서 바꾸면 고른 센터를 비우고 보내지 않는다', async () => {
    const view = renderAt('/employees/new');
    await fillBasics();
    await userEvent.click(screen.getByRole('button', { name: '권한 추가' }));
    expect(screen.getByTestId('grant-no-center')).toHaveTextContent('역할을 고르면');
    await userEvent.selectOptions(screen.getByLabelText('역할'), 'MFC_WORKER');
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled(); // 센터 필수
    await userEvent.click(screen.getByRole('button', { name: '센터' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /MFC-BSN-01/ }));
    await userEvent.selectOptions(screen.getByLabelText('역할'), 'MD');
    expect(screen.getByTestId('grant-no-center')).toHaveTextContent('센터가 필요 없어요');
    expect(screen.queryByRole('button', { name: '센터' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '등록' }));
    await waitFor(() => expect(view.mutations('/hr/employees')).toHaveLength(1));
    expect(((await view.mutations('/hr/employees')[0]!.json()) as { requestedGrants: unknown[] }).requestedGrants).toEqual([{ role: 'MD' }]);
  });

  it('같은 역할은 한 줄만 — 다른 줄에서 이미 고른 역할은 고를 수 없다', async () => {
    renderAt('/employees/new');
    await fillBasics();
    await userEvent.click(screen.getByRole('button', { name: '권한 추가' }));
    await userEvent.selectOptions(screen.getAllByLabelText('역할')[0]!, 'MD');
    await userEvent.click(screen.getByRole('button', { name: '권한 추가' }));
    const second = screen.getAllByLabelText('역할')[1]!;
    const md = within(second).getAllByRole('option').find((o) => (o as HTMLOptionElement).value === 'MD') as HTMLOptionElement;
    expect(md.disabled).toBe(true);
    expect(md.textContent).toContain('이미 다른 줄에 있음');
  });
});

describe('권한 관리 — 추가·변경 요청', () => {
  it('지금 가진 권한(마지막 날)을 보이고, 같은 역할·센터를 고르면 미리 경고 — 다른 센터면 경고 없음', async () => {
    renderAt('/permissions/OP-picker-1');
    const current = await screen.findByTestId('current-grants');
    expect(within(current).getByTestId('current-grant')).toHaveTextContent('MFC-BSN-01 · 2026-09-01 ~ 2027-02-28');
    const form = screen.getByRole('form', { name: '권한 추가·변경 요청' });
    await userEvent.selectOptions(within(form).getByLabelText('역할'), 'MFC_WORKER');
    await userEvent.click(within(form).getByRole('button', { name: '센터' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: /MFC-BSN-01/ }));
    expect(within(form).getByTestId('grant-overlap')).toHaveTextContent('2027-02-28까지');
    await userEvent.click(within(form).getByRole('checkbox', { name: /MFC-BSN-01/ }));
    await userEvent.click(within(form).getByRole('checkbox', { name: /MFC-SEL-01/ }));
    expect(within(form).queryByTestId('grant-overlap')).not.toBeInTheDocument();
  });

  it('409 GRANT_ALREADY_ACTIVE — 서버 문장을 그대로, 겹친 기존 권한 줄을 강조(연장 버튼은 없다)', async () => {
    renderAt('/permissions/OP-picker-1');
    const form = await screen.findByRole('form', { name: '권한 추가·변경 요청' });
    await userEvent.selectOptions(within(form).getByLabelText('역할'), 'MFC_WORKER');
    await userEvent.click(within(form).getByRole('button', { name: '센터' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: /MFC-BSN-01/ }));
    await userEvent.type(within(form).getByLabelText('요청 사유'), '같은 권한 다시');
    await userEvent.click(within(form).getByRole('button', { name: '승인 요청' }));
    expect(await within(form).findByTestId('grant-problem-detail')).toHaveTextContent('끝난 다음 날부터로 요청하거나');
    expect(within(form).getByTestId('current-grant')).toHaveAttribute('data-conflict', 'true');
    expect(within(form).queryByRole('button', { name: /연장/ })).not.toBeInTheDocument();
  });
});
