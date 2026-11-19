// 상품 상세·SKU·판매 상태 변경. 일시품절·판매 재개는 바로, 판매중지는 PRODUCT 승인 뒤 approvalId 와 함께(2026-10-30 결정).
// 화면(2026-11-18 사용자 "밋밋하다 — Shopify 상품 상세처럼"): 머리(제목·판매 상태 배지·관리용 명칭) 아래 넓은 화면 두 칸 —
// 왼쪽(2/3) SKU 표 카드·판매 상태 변경 카드, 오른쪽(1/3) 상품 요약 카드·작업 카드(콘텐츠 등록·정보 수정 시작). 동작은 그대로.
import { useProductPrices } from '../prices/productPrices';
import { PriceLookup } from '../prices/PricePage';
import { PriceChangeForm } from '../prices/PriceChangeForm';
import { SystemNumbers } from '../../shared/displayNumber';
import { ContentGallery, notPublished, useProductContent } from '../contents/ContentGallery';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';

import { commandParams } from '../../api/command';
import { SALE_STATES, type ChangeRequestBody, type ProductDetail, type SaleState } from '../../api/models';
import { ProblemFailure, request } from '@pmart/web-core';
import { settleCommand } from '@pmart/web-core';
import { useApi } from '../../app/ApiContext';
import { useSession } from '../../app/SessionContext';
import { CommandFeedback } from '../../shared/Feedback';
import { formatSeoul } from '@pmart/web-ui';
import { useRecordRecent } from '../../shared/recentViews';
import { ApprovalChosen, ApprovalPicker } from '../../shared/ApprovalPicker';
import { messages as m } from '../../shared/messages';
import { QueryState } from '@pmart/web-ui';
import { toUiState } from '@pmart/web-ui';
import { useCommand } from '@pmart/web-ui';
import { RequestApproval } from '../approvals/RequestApproval';
import { DetailHeader, NextAction, StatusBadge } from '../../shared/admin';
import { Card, EmptyState, JumpLink, tableClass, UnderlineTabs } from './parts';
import { SALE_TONE } from './ProductListPage';

/** handoff 2026-10-30 §4.3 판매중지 변경 요청 본문 */
export function saleStopApprovalBody(productId: string, reason: string): ChangeRequestBody {
  return {
    type: 'PRODUCT',
    targetService: 'product-service',
    targetRef: `SALE-STATE:${productId}`,
    allowedActions: ['CHANGE_SALE_STATE'],
    summary: `판매중지: ${reason}`,
    lines: [{ lineKey: productId, attributes: { saleState: 'SALE_STOPPED' } }],
  };
}

const fieldLabel = 'text-xs font-medium text-base-content/60';

function SaleStateChange({ product }: { readonly product: ProductDetail }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const productId = product.productId ?? '';
  const [saleState, setSaleState] = useState<SaleState>(product.saleState === 'ON_SALE' ? 'TEMPORARILY_SOLD_OUT' : 'ON_SALE');
  const [reason, setReason] = useState('');
  const [approvalId, setApprovalId] = useState('');
  const [approvalBody, setApprovalBody] = useState<ChangeRequestBody | null>(null);

  const change = useCommand(
    async (v: { saleState: SaleState; reason: string; approvalId: string; version: number | undefined }, key) => {
      const r = await settleCommand(
        key,
        () =>
          request(
            'POST',
            api.product.POST('/products/{productId}/sale-state-changes', {
              ...commandParams(key, { path: { productId }, version: v.version }),
              body: { saleState: v.saleState, reason: v.reason, ...(v.approvalId ? { approvalId: v.approvalId } : {}) },
            }),
          ),
        (requestId) =>
          request(
            'GET',
            api.product.GET('/products/{productId}/sale-state-changes/{requestId}', {
              params: { path: { productId, requestId } },
            }),
          ),
      );
      await queryClient.invalidateQueries({ queryKey: ['product'] });
      return r;
    },
  );

  const stop = saleState === 'SALE_STOPPED';
  return (
    <Card
      id="sale-state-change"
      title={m.products.changeSaleState}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={change.busy || !reason.trim()}
          onClick={() =>
            void change.run({ saleState, reason: reason.trim(), approvalId: stop ? approvalId.trim() : '', version: product.version })
          }
        >
          {m.products.applyChange}
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className={fieldLabel}>{m.products.saleState}</span>
          <select
            className="select select-sm w-full"
            value={saleState}
            onChange={(e) => setSaleState(SALE_STATES.find((s) => s === e.target.value) ?? 'ON_SALE')}
          >
            {SALE_STATES.map((s) => (
              <option key={s} value={s}>
                {m.products.saleStateName[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className={fieldLabel}>{m.reasonLabel}</span>
          <input className="input input-sm w-full" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      {stop && (
        <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm">{m.products.stopNeedsApproval}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className={fieldLabel}>{m.products.approvalIdLabel}</span>
            <input className="input input-sm w-full max-w-sm" value={approvalId} onChange={(e) => setApprovalId(e.target.value)} />
            <ApprovalChosen approvalId={approvalId} />
          </label>
          <ApprovalPicker type="PRODUCT" selectedId={approvalId} onPick={setApprovalId} />
          {approvalBody ? (
            <RequestApproval body={approvalBody} onRequested={(r) => r.approvalId && setApprovalId(r.approvalId)} />
          ) : (
            <button
              type="button"
              className="btn btn-sm"
              disabled={!reason.trim()}
              onClick={() => setApprovalBody(saleStopApprovalBody(productId, reason.trim()))}
            >
              {m.approvals.requestApproval}
            </button>
          )}
        </div>
      )}
      <CommandFeedback command={change}>
        {() => (
          <div role="status" className="alert alert-success alert-soft">
            {m.products.changeApplied}
          </div>
        )}
      </CommandFeedback>
    </Card>
  );
}

/**
 * 상품 정보 수정 시작(product 0.3.0 `POST /products/{productId}/edit-drafts`, 백엔드 요청 2026-11-17 request-product-edit).
 * 서버가 현재 승인 값으로 채운 수정 초안을 만들면 그 초안 화면으로 간다. 이미 열린 수정 초안이 있으면(409 EDIT_DRAFT_EXISTS) 그 초안으로 안내.
 */
function EditStart({ productId }: { readonly productId: string }) {
  const api = useApi();
  const navigate = useNavigate();
  const start = useCommand((_: null, key) =>
    request('POST', api.product.POST('/products/{productId}/edit-drafts', { ...commandParams(key, { path: { productId } }) })).then((d) => {
      void navigate(`/products/drafts/${encodeURIComponent(d.draftId)}`);
      return d;
    }),
  );
  const failure = start.phase.kind === 'rejected' ? start.phase.failure : null;
  const existing =
    failure instanceof ProblemFailure && failure.problem.code === 'EDIT_DRAFT_EXISTS'
      ? failure.problem.details.find((x) => x.field === 'existingDraftId')?.reason
      : undefined;
  // 0.3.2: MD 가 아니면 403 — 일반 권한 문구 대신 'MD 만' 안내(백엔드 알림 2026-11-17 notice-product-edit-md-only)
  const notMd = failure instanceof ProblemFailure && failure.problem.code === 'FORBIDDEN';
  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-sm btn-block" disabled={start.busy} onClick={() => void start.run(null)}>
        {m.products.editStart}
      </button>
      {existing ? (
        <div role="alert" className="alert alert-warning alert-soft flex-col items-start text-sm" data-testid="product-edit-exists">
          <span>{m.products.editDraftExists}</span>
          <Link className="link" to={`/products/drafts/${encodeURIComponent(existing)}`}>
            {m.products.editDraftOpen(existing)}
          </Link>
        </div>
      ) : notMd ? (
        <div role="alert" className="alert alert-warning alert-soft text-sm" data-testid="product-edit-not-md">
          {m.products.editForbidden}
        </div>
      ) : (
        <CommandFeedback command={start} />
      )}
    </div>
  );
}

/** 오른쪽 요약 카드의 한 줄(이름 위·값 아래) */
function Fact({ label, children, testId }: { readonly label: string; readonly children: ReactNode; readonly testId?: string }) {
  return (
    // 항목 이름(작고 흐리게, 왼쪽)과 값(크고 굵게, 오른쪽)을 한 줄에, 줄마다 구분선(2026-11-20 사용자 "폰트 크기 다르게 해서 나눠지는 거 구별 잘 되게")
    <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-3 py-2.5">
      <dt className="text-[13px] text-base-content/55">{label}</dt>
      <dd className="min-w-0 break-words text-[15px] font-semibold" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

// 센터 취급 탭은 뺐다(2026-11-20 — 다른 화면 링크뿐이었고, 그 화면은 센터가 있는 사람만 쓴다)
type ProductTab = 'info' | 'content' | 'price';
const PRODUCT_TABS: readonly ProductTab[] = ['info', 'content', 'price'];

export function ProductDetailPage() {
  const { productId = '' } = useParams();
  const api = useApi();
  // 판매 상태 변경·상품 정보 수정 시작(product 0.3.2)은 MD 만(백엔드 알림 2026-11-15 product-menu-operator-admin) — 그 밖 역할(OPERATOR_ADMIN)에는 버튼을 숨긴다. 판정은 서버(403).
  const canChangeSaleState = useSession().session?.roles.includes('MD') ?? false;
  const query = useQuery({
    queryKey: ['product', 'detail', productId],
    queryFn: () => request('GET', api.product.GET('/products/{productId}', { params: { path: { productId } } })),
  });
  const p0 = query.data;
  // 등록 덜 된 것(2026-11-19) — 게시 콘텐츠 없음(404 NOT_FOUND·CONTENT_NOT_PUBLISHED), SKU 가격 미설정(서버 notSet). 못 읽으면 말하지 않는다
  const content = useProductContent(productId);
  const noContent = content.isError && notPublished(content.error);
  const price = useProductPrices(productId ? [productId] : []).get(productId);
  const noPriceSku = price && !price.loading && !price.failed && price.notSet > 0 ? (p0?.skus ?? []).map((s) => s.sku)[0] : undefined;
  const [params, setParams] = useSearchParams();
  const tab: ProductTab = PRODUCT_TABS.find((t) => t === params.get('tab')) ?? 'info';
  const setTab = (t: ProductTab) =>
    setParams(
      (q) => {
        const n = new URLSearchParams(q);
        if (t === 'info') n.delete('tab');
        else n.set('tab', t);
        return n;
      },
      { replace: true },
    );

  const hash = useLocation().hash;
  useEffect(() => {
    if (!p0 || !hash) return;
    requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }, [p0, hash]);

  // 최근 본 항목(2026-11-18) — 서버 응답을 받은 뒤에만 남긴다
  useRecordRecent('product', productId, p0?.internalName ?? null);
  // 카테고리 경로(상품 등록·조회와 같은 queryKey)
  const tree = useQuery({ queryKey: ['product', 'category-tree'], queryFn: () => request('GET', api.product.GET('/categories/tree', {})) });
  const catPath = (id: string) => (tree.data?.nodes ?? []).find((n) => n.categoryId === id)?.path ?? (tree.isError ? '?' : tree.isPending ? '…' : m.products.categoryGone);
  return (
    <section className="space-y-4">
      <DetailHeader
        back={{ to: '/products', label: m.products.listTitle }}
        // 제목은 관리용 명칭만 — 상품 ID 는 아래 "시스템 번호" 접기에(ADR-0070 덧붙임, 2026-11-19)
        title={p0?.internalName ?? m.products.detailTitleNoId}
        badges={
          p0 ? (
            <>
              {p0.saleState && <StatusBadge tone={SALE_TONE[p0.saleState]}>{m.products.saleStateName[p0.saleState]}</StatusBadge>}
              {p0.version !== undefined && <span className="badge badge-ghost badge-sm font-mono">{`v${p0.version}`}</span>}
            </>
          ) : null
        }
        summary={p0?.skus ? m.products.skuCount(p0.skus.length) : undefined}
        actions={
          <>
            {/* 옵션 = 같은 기초상품의 다른 판매 단위(E 낱개/B 묶음) — 조합 생성기 대신(2026-11-18 사용자 결정, sameBase.ts) */}
            <Link className="btn btn-sm" to={`/products/drafts/new?sameBaseAs=${encodeURIComponent(productId)}`} title={m.products.sameBase.hint}>
              {m.products.sameBase.action}
            </Link>
            <Link className="btn btn-sm btn-primary" to={`/contents/drafts/new?productId=${encodeURIComponent(productId)}`}>
              {m.products.addContent}
            </Link>
          </>
        }
      />
      <SystemNumbers
        ids={[
          { label: m.products.sys.product, id: productId },
          { label: m.products.sys.baseProduct, id: p0?.baseProductId },
          { label: m.products.sys.primaryCategory, id: p0?.primaryCategoryId },
          { label: m.products.sys.approval, id: p0?.approvalId },
        ]}
      />
      <QueryState state={toUiState(query)} onRetry={() => void query.refetch()}>
        {(p) => (
          <div className="space-y-4">
          {noContent || noPriceSku ? (
            <NextAction tone="warning" title={m.products.next.unfinished} body={[noContent ? m.products.next.noContent : null, noPriceSku ? m.products.next.noPrice(price?.notSet ?? 0) : null].filter(Boolean).join(' ')}>
              {noContent && (
                <Link className="btn btn-sm btn-warning" to={`/contents/drafts/new?productId=${encodeURIComponent(productId)}`} data-testid="next-photo">
                  {m.products.next.photo}
                </Link>
              )}
              {noPriceSku && (
                <button type="button" className="btn btn-sm" onClick={() => setTab('price')} data-testid="next-price">
                  {m.products.next.price}
                </button>
              )}
            </NextAction>
          ) : null}
          {/* 다음 할 일(2026-11-18): 서버 판매 상태가 판매중이 아니고 바꿀 수 있는 사람(MD)일 때만 — 그 밖에는 없음 */}
          {canChangeSaleState && p.saleState && p.saleState !== 'ON_SALE' && (
            <NextAction tone="warning" title={m.products.next.saleNotOn(m.products.saleStateName[p.saleState])} body={m.products.next.saleNotOnBody}>
              <JumpLink to="sale-state-change">{m.products.go.saleState}</JumpLink>
            </NextAction>
          )}
          {/* 상세 탭(2026-11-19 상품 묶음 합치기 1단계 — 백엔드 백오피스 제안 + 사용자 "조회부터"): 기본 정보 / 고객 화면 / 가격 / 센터 취급. 원천·수정 단추는 탭마다 따로 */}
          <UnderlineTabs<ProductTab> label={m.products.tabs.label} value={tab} onChange={setTab} options={PRODUCT_TABS.map((t) => ({ value: t, label: m.products.tabs[t] }))} />
          {tab === 'info' && (
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                {/* 상품 사진(2026-11-19 사용자 "상품 조회 안에서도 사진") — 게시된 콘텐츠의 사진, 없으면 등록 안내 */}
                {/* "고객 화면 탭에서 보기" 링크는 뺐다(2026-11-20 사용자 — 바로 옆 탭을 누르면 된다) */}
                <Card title={m.contents.gallery.title}>
                  <ContentGallery productId={productId} />
                </Card>
                <Card title={m.products.skus} aside={<span className="text-xs text-base-content/55">{m.products.skuCount(p.skus?.length ?? 0)}</span>}>
                  {(p.skus?.length ?? 0) === 0 ? (
                    <EmptyState icon="tag">{m.products.noSkus}</EmptyState>
                  ) : (
                    <div className="-mx-5 -my-4 overflow-x-auto">
                      <table className={tableClass}>
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>{m.products.unitType}</th>
                            <th>{m.products.weightG}</th>
                            <th>{m.products.net.label}</th>
                            <th>{m.products.storageType}</th>
                            <th>{m.products.preview.barcodes}</th>
                            <th>{m.products.saleState}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(p.skus ?? []).map((s) => (
                            <tr key={s.sku}>
                              <td>
                                <button type="button" className="font-mono font-medium text-primary hover:underline" onClick={() => setTab('price')} data-testid="sku-to-price">
                                  {s.sku}
                                </button>
                              </td>
                              <td>
                                <p>{m.products.unitName[s.unitType]}</p>
                                <p className="text-xs text-base-content/50">{`${m.products.unitsPerSku} ${s.unitsPerSku}`}</p>
                              </td>
                              <td>{s.weightG ?? m.notSet}</td>
                              {/* 내용량 — 없으면 "없음"(개수로만 파는 상품은 원래 비움, 고객 화면에 단위 가격이 안 나옴) */}
                              <td data-testid="sku-net-content">{s.netContent ? m.products.net.show(s.netContent.amount, s.netContent.unit) : m.none}</td>
                              <td>{s.logistics?.storageType ? <span className="badge badge-sm badge-info badge-soft">{m.products.storageName[s.logistics.storageType]}</span> : m.none}</td>
                              <td>
                                {(s.barcodes ?? []).length === 0 ? (
                                  m.none
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {(s.barcodes ?? []).map((b) => (
                                      <span key={b} className="rounded bg-base-200 px-1.5 py-0.5 font-mono text-xs">
                                        {b}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td>
                                <StatusBadge tone={SALE_TONE[s.saleState]}>{m.products.saleStateName[s.saleState]}</StatusBadge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
                {canChangeSaleState ? (
                  <SaleStateChange key={p.productId} product={p} />
                ) : (
                  <p className="rounded-box border border-dashed border-base-300 bg-base-100 p-4 text-sm text-base-content/60">{m.products.saleStateMdOnly}</p>
                )}
              </div>
  
              <div className="space-y-4">
                <Card title={m.products.summaryTitle}>
                  <dl className="-my-2 divide-y divide-base-200">
                    <Fact label={m.products.internalName}>{p.internalName ?? m.none}</Fact>
                    <Fact label={m.products.saleState} testId="sale-state">
                      {p.saleState ? m.products.saleStateName[p.saleState] : m.none}
                    </Fact>
                    <Fact label={m.products.version}>{p.version === undefined ? m.none : `v${p.version}`}</Fact>
                    {/* 카테고리는 노드 ID 대신 경로(대분류 > 중분류 > 소분류, 2026-11-19) — 트리를 못 읽으면 "?" */}
                    <Fact label={m.products.primaryCategory}>
                      <span data-testid="primary-category">{p.primaryCategoryId ? catPath(p.primaryCategoryId) : m.none}</span>
                    </Fact>
                    <Fact label={m.products.categories}>
                      {(p.categoryIds ?? []).length === 0 ? (
                        m.none
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {(p.categoryIds ?? []).map((c) => (
                            <span key={c} className="rounded bg-base-200 px-1.5 py-0.5 text-xs font-normal" data-testid="exposed-category">
                              {catPath(c)}
                            </span>
                          ))}
                        </span>
                      )}
                    </Fact>
                    <Fact label={m.products.sys.approval}>
                      {p.approvalId ? (
                        <Link className="link link-primary text-sm" to={`/approvals/${encodeURIComponent(p.approvalId)}`} data-testid="product-approval">
                          {m.products.openApproval} ›
                        </Link>
                      ) : (
                        m.none
                      )}
                    </Fact>
                    <Fact label={m.products.publishedAt}>{p.publishedAt ? formatSeoul(p.publishedAt) : m.none}</Fact>
                  </dl>
                </Card>
                <Card title={m.products.actionsTitle}>
                  {/* 고객용 상품명·설명·이미지는 콘텐츠(product-content-service, DISPLAY 승인)로 따로 등록한다(머리 오른쪽 버튼). */}
                  {canChangeSaleState ? <EditStart productId={productId} /> : <p className="text-sm text-base-content/60">{m.products.editMdOnly}</p>}
                </Card>
              </div>
            </div>
          )}
          {tab === 'content' && (
            <Card
              title={m.products.tabs.content}
              aside={
                <Link className="btn btn-sm btn-primary" to={`/contents/drafts/new?productId=${encodeURIComponent(productId)}`} data-testid="tab-content-edit">
                  {m.products.tabs.contentEdit}
                </Link>
              }
            >
              <ContentGallery productId={productId} withText />
            </Card>
          )}
          {tab === 'price' && (
            <div className="space-y-4" data-testid="tab-price">
              {/* 이 탭 안에서 바로 바꾼다(2026-11-20 사용자 "가격도 여기서 바로 바꿀 수 있게") — 가격 관리 화면으로 보내지 않는다 */}
              <Card title={m.prices.form.title}>
                <PriceChangeForm skus={(p.skus ?? []).map((sk) => sk.sku)} labels={Object.fromEntries((p.skus ?? []).map((sk) => [sk.sku, m.products.unitName[sk.unitType]]))} />
              </Card>
              {(p.skus ?? []).map((sk) => (
                <div key={sk.sku} className="space-y-2">
                  <h3 className="font-semibold">
                    <span className="font-mono">{sk.sku}</span>
                    <span className="ml-2 text-sm font-normal text-base-content/55">{m.products.unitName[sk.unitType]}</span>
                  </h3>
                  <PriceLookup sku={sk.sku} withProduct={false} />
                </div>
              ))}
            </div>
          )}
          </div>
        )}
      </QueryState>
    </section>
  );
}
