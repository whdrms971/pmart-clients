// 상품 초안 1건: 새로 만들기 / 조회·수정·제출 준비 → PRODUCT 승인 요청 → 반영 결과(productId·SKU).
// 화면(2026-11-18 사용자 "밋밋하다 — Shopify·Medusa 처럼"): 머리(제목·상태 배지·단계 표시) 아래 넓은 화면 두 칸 —
// 왼쪽(2/3) 입력 폼(제목 있는 카드 묶음), 오른쪽(1/3) 검증 카드·다음 단계 카드(제출 준비·승인 요청)·발급 결과 카드. 동작은 그대로.
import { ProductPicker } from '../contents/ProductPicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { commandParams } from '../../api/command';
import type { ProductDraft, ProductDraftInput } from '../../api/models';
import { request } from '@pmart/web-core';
import { useApi } from '../../app/ApiContext';
import { CommandFeedback, reasonText } from '../../shared/Feedback';
import { messages as m } from '../../shared/messages';
import { QueryState } from '@pmart/web-ui';
import { toUiState } from '@pmart/web-ui';
import { useCommand } from '@pmart/web-ui';
import { RequestApproval } from '../approvals/RequestApproval';
import { ProductDraftForm } from './ProductDraftForm';
import { sameBaseInput } from './sameBase';
import { CodeLabel, NextAction, PageHeader, StatusBadge, type Tone } from '../../shared/admin';
import { Card, JumpLink, Steps, TitleWithId } from './parts';

const DRAFT_TONE: Readonly<Record<ProductDraft['state'], Tone>> = { DRAFT: 'neutral', SUBMITTED: 'warning', APPLIED: 'success', REJECTED: 'error' };

/** 초안 상태 배지(서버 state 를 이름으로) */
export function DraftStateBadge({ state }: { readonly state: ProductDraft['state'] }) {
  return (
    <StatusBadge tone={DRAFT_TONE[state] ?? 'ghost'}>
      <span title={state}>{m.products.draftStateName[state] ?? state}</span>
    </StatusBadge>
  );
}

/** 초안 상태·검증 결과·검증 문제(서버 값 그대로). 검증 값은 한국어 이름(마우스를 올리면 VALID/INVALID 코드). */
export function DraftProblems({ draft }: { readonly draft: ProductDraft }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <DraftStateBadge state={draft.state} />
        <span className="text-xs text-base-content/55">{m.products.validation}</span>
        <span className={`badge badge-sm font-mono ${draft.validationState === 'VALID' ? 'badge-success badge-soft' : 'badge-error badge-soft'}`}>
          <CodeLabel code={draft.validationState} names={m.products.validationName} />
        </span>
      </div>
      {(draft.problems?.length ?? 0) > 0 && (
        <ul className="space-y-1 rounded-lg bg-error/5 px-3 py-2 text-error" aria-label={m.products.problems}>
          {(draft.problems ?? []).map((p, i) => (
            <li key={`${p.code}-${i}`} className="flex gap-1.5">
              <span aria-hidden="true">•</span>
              <span>{`${reasonText(p.code)}${p.field ? ` (${p.field})` : ''}${p.detail ? ` — ${p.detail}` : ''}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 초안 ID 로 열기(BR-26: 초안 목록 API 가 없다) — 머리 오른쪽 작은 폼 */
export function OpenById({ base }: { readonly base: string }) {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState('');
  return (
    <form
      className="join"
      title={m.products.openDraftHint}
      onSubmit={(e) => {
        e.preventDefault();
        if (openId.trim()) void navigate(`${base}/${encodeURIComponent(openId.trim())}`);
      }}
    >
      <input aria-label={m.products.openDraft} placeholder={m.products.openDraft} className="input input-sm join-item w-44" value={openId} onChange={(e) => setOpenId(e.target.value)} />
      <button type="submit" className="btn btn-sm join-item">
        {m.search}
      </button>
    </form>
  );
}

/**
 * 등록 방식 고르기(2026-11-19 쿠팡 윙 상품 등록 "어떤 방식으로 등록하시겠어요?" 참고) — 이미 있는 네 길을 큰 카드로.
 * 직접 입력(아래 폼) · 상품 JSON 으로 채우기(폼 안 파일 칸으로) · 일괄 등록(seed-v1.zip 화면) · 같은 기초상품으로(상품 고르면 ?sameBaseAs=).
 */
function StartChooser() {
  const navigate = useNavigate();
  const [pickBase, setPickBase] = useState(false);
  const c = m.products.start;
  const card = (key: string, icon: string, title: string, body: string, active: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={`start-${key}`}
      className={`flex flex-col items-center gap-2 rounded-box border px-4 py-5 text-center transition hover:-translate-y-0.5 ${active ? 'border-primary bg-primary/5 text-primary' : 'border-base-300 bg-base-100'}`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={icon} />
      </svg>
      <span className="font-semibold">{title}</span>
      <span className="text-xs text-base-content/55">{body}</span>
    </button>
  );
  return (
    <section aria-label={c.title} className="space-y-3" data-testid="start-chooser">
      <div>
        <h2 className="text-lg font-bold">{c.title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {card('direct', 'M4 20h4L19 9l-4-4L4 16v4Zm11-15 4 4', c.direct, c.directBody, !pickBase, () => {
          setPickBase(false);
          document.getElementById('product-form-start')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        })}
        {card('json', 'M14 3v5h5M14 3H6v18h12V8l-4-5ZM9 13h6M9 17h4', c.json, c.jsonBody, false, () => {
          setPickBase(false);
          const input = document.querySelector<HTMLInputElement>(`input[aria-label="${m.products.jsonFill}"]`);
          input?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          input?.focus();
        })}
        {card('import', 'M12 15V4m0 0-4 4m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3', c.bulk, c.bulkBody, false, () => void navigate('/imports'))}
        {card('sameBase', 'M8 8h11v11H8zM5 16V5h11', c.sameBase, c.sameBaseBody, pickBase, () => setPickBase((p) => !p))}
        {/* 사진·설명 등록(2026-11-19 사용자 "상품 등록할 때 사진 등록하던 게 없어졌다" — 메뉴 정리로 콘텐츠 등록 메뉴를 뺀 뒤 입구) */}
        {card('photo', 'M4 7h3l2-2h6l2 2h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', c.photo, c.photoBody, false, () => void navigate('/contents/drafts/new'))}
      </div>
      {pickBase && (
        <div className="max-w-xl rounded-box border border-primary/40 bg-primary/5 p-4" data-testid="start-same-base">
          <ProductPicker label={c.sameBasePick} value="" onChange={(id) => id && void navigate(`/products/drafts/new?sameBaseAs=${encodeURIComponent(id)}`)} />
        </div>
      )}
    </section>
  );
}

export function NewProductDraftPage() {
  const api = useApi();
  const navigate = useNavigate();
  // ?sameBaseAs=<상품 ID>: 그 상품의 기초상품에 붙는 새 상품(다른 판매 단위) — 공통 칸만 채워 연다(sameBase.ts)
  const sameBaseAs = useSearchParams()[0].get('sameBaseAs') ?? '';
  const source = useQuery({
    queryKey: ['product', 'detail', sameBaseAs],
    enabled: sameBaseAs !== '',
    queryFn: () => request('GET', api.product.GET('/products/{productId}', { params: { path: { productId: sameBaseAs } } })),
  });
  const create = useCommand((body: ProductDraftInput, key) =>
    request('POST', api.product.POST('/product-drafts', { ...commandParams(key), body })).then((d) => {
      void navigate(`/products/drafts/${encodeURIComponent(d.draftId)}`);
      return d;
    }),
  );

  return (
    <section className="space-y-4">
      <PageHeader title={m.products.draftTitle} actions={<OpenById base="/products/drafts" />} />
      {sameBaseAs === '' && <StartChooser />}
      <div id="product-form-start" className="scroll-mt-4">
        <Steps steps={m.products.draftSteps} now={0} />
      </div>
      <div className="mx-auto max-w-5xl space-y-4">
        {sameBaseAs === '' ? (
          <ProductDraftForm submitLabel={m.products.create} busy={create.busy} onSubmit={(input) => void create.run(input)} />
        ) : (
          // 원본 상품을 못 읽으면 빈 폼으로 바꾸지 않는다(기초상품 연결이 빠진 채 새 기초상품이 생기지 않게)
          <QueryState state={toUiState(source)} onRetry={() => void source.refetch()}>
            {(p) => (
              <div className="space-y-4">
                <NextAction title={m.products.sameBase.title(p.internalName ?? sameBaseAs)} body={m.products.sameBase.body}>
                  <Link className="btn btn-sm" to={`/products/${encodeURIComponent(sameBaseAs)}`}>
                    {m.products.sameBase.back}
                  </Link>
                </NextAction>
                <p className="text-xs text-base-content/60" data-testid="same-base-id">
                  {m.products.sameBase.baseId(p.baseProductId ?? m.none)}
                </p>
                <ProductDraftForm key={sameBaseAs} initial={sameBaseInput(p)} submitLabel={m.products.create} busy={create.busy} onSubmit={(input) => void create.run(input)} />
              </div>
            )}
          </QueryState>
        )}
        <CommandFeedback command={create} />
      </div>
    </section>
  );
}

/**
 * 다음 할 일(2026-11-18 사용자 "직관적이지 않다") — 서버 초안 state·validationState·approvalId 만으로 하나를 고른다.
 * 버튼은 이 쪽에 이미 있는 구역(폼·다음 단계 카드)이나 링크(승인·만든 상품)로만 간다.
 */
function DraftNextAction({ draft: d }: { readonly draft: ProductDraft }) {
  const approval = d.approvalId ? (
    <Link className="btn btn-sm" to={`/approvals/${encodeURIComponent(d.approvalId)}`}>
      {m.products.openApproval}
    </Link>
  ) : null;
  if (d.state === 'DRAFT') {
    return d.validationState === 'VALID' ? (
      <NextAction title={m.products.next.submit} body={m.products.next.submitBody}>
        <JumpLink to="draft-next">{m.products.go.next}</JumpLink>
      </NextAction>
    ) : (
      <NextAction tone="warning" title={m.products.next.fix(d.problems?.length ?? 0)} body={d.input ? m.products.next.fixBody : undefined}>
        {d.input && <JumpLink to="draft-form">{m.products.go.form}</JumpLink>}
      </NextAction>
    );
  }
  if (d.state === 'SUBMITTED') {
    return approval ? (
      <NextAction title={m.products.next.waitApproval}>{approval}</NextAction>
    ) : (
      <NextAction title={m.products.next.requestApproval}>
        <JumpLink to="draft-next">{m.products.go.next}</JumpLink>
      </NextAction>
    );
  }
  if (d.state === 'APPLIED') {
    return (
      <NextAction tone="success" title={m.products.next.applied} body={m.products.next.appliedBody}>
        {/* 승인 뒤 이어서 — 사진·설명(콘텐츠 초안, 이 상품으로) → 가격(첫 SKU) */}
        {d.resultProductId && (
          <Link className="btn btn-sm btn-primary" to={`/contents/drafts/new?productId=${encodeURIComponent(d.resultProductId)}`} data-testid="applied-photo">
            {m.products.next.photo}
          </Link>
        )}
        {/* 승인 뒤 가격 — 가격 관리 화면이 아니라 그 상품의 가격 탭(2026-11-20) */}
        {d.resultProductId && (
          <Link className="btn btn-sm" to={`/products/${encodeURIComponent(d.resultProductId)}?tab=price`} data-testid="applied-price">
            {m.products.next.price}
          </Link>
        )}
        {d.resultProductId && (
          <Link className="btn btn-sm" to={`/products/${encodeURIComponent(d.resultProductId)}`}>
            {m.products.openResult}
          </Link>
        )}
      </NextAction>
    );
  }
  return (
    <NextAction tone="error" title={m.products.next.rejected}>
      {approval}
    </NextAction>
  );
}

const stepOf = (d: ProductDraft) => (d.state === 'APPLIED' ? 4 : d.state === 'SUBMITTED' ? 3 : d.validationState === 'VALID' ? 2 : 1);

export function ProductDraftPage() {
  const { draftId = '' } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const key = ['product', 'draft', draftId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => request('GET', api.product.GET('/product-drafts/{draftId}', { params: { path: { draftId } } })),
  });

  const update = useCommand(async ({ body, version }: { body: ProductDraftInput; version: number }, k) => {
    const d = await request(
      'PUT',
      api.product.PUT('/product-drafts/{draftId}', { ...commandParams(k, { path: { draftId }, version: version }), body }),
    );
    queryClient.setQueryData(key, d);
    return d;
  });
  const submit = useCommand(async (_: null, k) => {
    const r = await request(
      'POST',
      api.product.POST('/product-drafts/{draftId}/submissions', { ...commandParams(k, { path: { draftId } }) }),
    );
    await queryClient.invalidateQueries({ queryKey: key });
    return r;
  });

  return (
    <section className="space-y-4">
      <PageHeader title={<TitleWithId title={query.data ? query.data.input?.product.internalName || m.products.unnamed : ''} id={m.products.draftDetail(draftId)} />} actions={<OpenById base="/products/drafts" />} />
      <QueryState state={toUiState(query)} onRetry={() => void query.refetch()}>
        {(d) => (
          <>
            <Steps steps={m.products.draftSteps} now={stepOf(d)} />
            <DraftNextAction draft={d} />
            {/* 같은 기초상품에 붙는 새 상품(2026-11-18) — 심사하는 사람이 어느 기초상품의 다른 판매 단위인지 본다 */}
            {!d.input?.targetProductId && d.input?.product.baseProductId && (
              <p className="rounded-box border border-base-300 bg-base-200/40 px-4 py-2 text-sm" data-testid="draft-base-product">
                {m.products.sameBase.baseId(d.input.product.baseProductId)}
              </p>
            )}
            {/* product 0.3.0 수정 초안(edit-drafts): input.targetProductId = 고칠 상품 */}
            {d.input?.targetProductId && (
              <div className="space-y-1 rounded-box border border-info/30 bg-info/5 px-4 py-3 text-sm" data-testid="product-edit-note">
                <p className="font-bold">
                  {`${m.products.editOf} — `}
                  <Link className="link" to={`/products/${encodeURIComponent(d.input.targetProductId)}`}>
                    {d.input.targetProductId}
                  </Link>
                </p>
                <p className="opacity-80">{m.products.editNote}</p>
              </div>
            )}
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <div id="draft-form" className="scroll-mt-4 space-y-4 lg:col-span-2">
                {d.state === 'DRAFT' && d.input ? (
                  <ProductDraftForm
                    key={d.version}
                    initial={d.input}
                    edit={Boolean(d.input.targetProductId)}
                    submitLabel={m.products.update}
                    busy={update.busy}
                    onSubmit={(body) => void update.run({ body, version: d.version })}
                  />
                ) : (
                  <Card title={m.products.formBasic}>
                    <p className="text-sm font-medium">{d.input?.product.internalName ?? m.none}</p>
                    <p className="text-xs text-base-content/55">{m.products.skuCount(d.input?.skus.length ?? 0)}</p>
                  </Card>
                )}
                <CommandFeedback command={update} />
              </div>

              <div className="space-y-4">
                <Card title={m.products.state}>
                  <DraftProblems draft={d} />
                </Card>
                <Card id="draft-next" title={m.products.nextTitle}>
                  {d.state === 'DRAFT' && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-block"
                      disabled={submit.busy || d.validationState !== 'VALID'}
                      onClick={() => void submit.run(null)}
                    >
                      {m.products.submit}
                    </button>
                  )}
                  <CommandFeedback command={submit}>
                    {(r) => (
                      <div className="space-y-2">
                        <p role="status" className="text-sm">
                          {m.products.locked}
                        </p>
                        <RequestApproval body={r.approvalRequest} />
                      </div>
                    )}
                  </CommandFeedback>
                  {d.approvalId && (
                    <p className="text-sm">
                      <Link className="link link-primary" to={`/approvals/${encodeURIComponent(d.approvalId)}`}>
                        {m.approvals.open}
                      </Link>
                    </p>
                  )}
                </Card>
                <Card title={m.products.result}>
                  {d.state === 'APPLIED' && d.resultProductId ? (
                    <div className="space-y-2 text-sm">
                      <Link className="link link-primary font-mono" to={`/products/${encodeURIComponent(d.resultProductId)}`}>
                        {d.resultProductId}
                      </Link>
                      <div className="flex flex-wrap gap-1">
                        {(d.resultSkus ?? []).map((s) => (
                          <span key={s} className="rounded bg-base-200 px-1.5 py-0.5 font-mono text-xs">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-base-content/60">
                      {m.products.resultPending}
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => void query.refetch()}>
                        {m.checkAgain}
                      </button>
                    </p>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
      </QueryState>
    </section>
  );
}
