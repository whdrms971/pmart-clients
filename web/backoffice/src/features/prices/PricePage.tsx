// 기본 판매가격: 가격 관리 목록 + 오른쪽 서랍(지금 가격·이력·바로 바꾸기). 바꾸기는 PriceChangeForm(상품 상세 가격 탭과 같은 부품) —
// 2026-11-20 사용자 "바꾸기 누르면 상품 조회로 나가지고 맨 아래로 가고…" — 맨 아래 변경 카드·"반영 확인"(승인 번호 다시 넣기)은 뺐다.
// 금액은 서버 값을 표시만 한다. PRICE_NOT_SET 은 0원이 아니라 "미설정(판매 불가)".
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { ProblemFailure } from '@pmart/web-core';
import type { ChangeRequestBody } from '../../api/models';
import { request } from '@pmart/web-core';
import { useApi } from '../../app/ApiContext';
import { formatKrw, formatSeoul } from '@pmart/web-ui';
import { messages as m } from '../../shared/messages';
import { QueryState } from '@pmart/web-ui';
import { toUiState } from '@pmart/web-ui';
import { PageHeader, StatusBadge, type Tone } from '../../shared/admin';
import { Card, LineIcon } from '../products/parts';
import { PreviewDrawer } from '../../shared/Preview';
import { PriceChangeForm } from './PriceChangeForm';
import { PriceList } from './PriceList';

const SKU_PATTERN = /^[EB]-\d{8}$/;
const PRICE_NOT_SET = 'PRICE_NOT_SET';

/** datetime-local(서울 기준 입력) → ISO-8601 +09:00 */
export const seoulInputToIso = (v: string) => (v ? `${v.length === 16 ? `${v}:00` : v}+09:00` : '');

const VERSION_TONE: Readonly<Record<string, Tone>> = { SCHEDULED: 'info', EFFECTIVE: 'success', SUPERSEDED: 'ghost', REJECTED: 'error' };

/**
 * 이 SKU 가 어떤 상품인지(2026-11-18 작업 따라 해 보기 — 가격 화면에 상품명이 없어 무엇의 가격인지 모른다).
 * 상품 조회 화면과 같은 계약 조회: GET /skus/{sku} → GET /products/{productId}(상품 상세와 같은 queryKey). 못 읽으면 숨기지 않고 "상품을 확인하지 못했어요".
 */
function SkuProduct({ sku }: { readonly sku: string }) {
  const api = useApi();
  const skuQ = useQuery({ queryKey: ['product', 'sku', sku], queryFn: () => request('GET', api.product.GET('/skus/{sku}', { params: { path: { sku } } })) });
  const productId = skuQ.data?.productId;
  const productQ = useQuery({
    queryKey: ['product', 'detail', productId ?? ''],
    enabled: Boolean(productId),
    queryFn: () => request('GET', api.product.GET('/products/{productId}', { params: { path: { productId: productId ?? '' } } })),
  });
  if (skuQ.isError || productQ.isError)
    return <p className="text-sm text-base-content/55" data-testid="sku-product">{m.prices.productUnknown}</p>;
  if (!productId) return null;
  return (
    <Link to={`/products/${encodeURIComponent(productId)}`} className="group inline-flex items-center gap-2 rounded-box border border-base-300 bg-base-100 px-4 py-2.5 shadow-sm hover:border-primary/40" data-testid="sku-product">
      <LineIcon name="box" className="h-4 w-4 text-base-content/50" />
      <span className="font-semibold">{productQ.data?.internalName ?? '…'}</span>
      <span className="text-sm text-primary group-hover:underline">{m.prices.openProduct} →</span>
    </Link>
  );
}

/** compact = 오른쪽 서랍 안(좁다) — 현재 기본가·이력을 위아래로 */
export function PriceLookup({ sku, compact = false, withProduct = true }: { readonly sku: string; readonly compact?: boolean; readonly withProduct?: boolean }) {
  const api = useApi();
  const price = useQuery({
    queryKey: ['pricing', 'price', sku],
    queryFn: () => request('GET', api.pricing.GET('/prices/{sku}', { params: { path: { sku } } })),
  });
  const history = useQuery({
    queryKey: ['pricing', 'versions', sku],
    queryFn: () => request('GET', api.pricing.GET('/price-versions/{sku}', { params: { path: { sku }, query: { size: 50 } } })),
  });
  const notSet = price.error instanceof ProblemFailure && price.error.problem.code === PRICE_NOT_SET;

  // 왼쪽(2/3): 현재 기본가 큰 숫자 + 예약된 다음 가격, 오른쪽(1/3): 가격 이력 세로 줄(최신 위)
  return (
    <div className="space-y-4">
    {/* 상품 상세 가격 탭에서는 이미 그 상품이라 뺀다 */}
    {withProduct && <SkuProduct sku={sku} />}
    <div className={compact ? 'space-y-4' : 'grid items-start gap-4 lg:grid-cols-3'}>
      <Card title={m.prices.current} aside={<span className="rounded bg-base-200 px-2 py-0.5 font-mono text-xs">{sku}</span>} className={compact ? '' : 'lg:col-span-2'}>
        {notSet ? (
          <div role="status" data-state="not-set" className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-warning">
            <LineIcon name="tag" className="h-6 w-6 shrink-0" />
            <span className="font-medium">{m.prices.notSet}</span>
          </div>
        ) : (
          <QueryState state={toUiState(price)} onRetry={() => void price.refetch()}>
            {(p) => (
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                  <p className="text-4xl font-bold tracking-tight tabular-nums" data-testid="base-price">
                    {formatKrw(p.basePrice)}
                  </p>
                  <span className="pb-1.5 font-mono text-sm text-base-content/50">{`v${p.priceVersion}`}</span>
                </div>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div className="space-y-0.5">
                    <dt className="text-xs text-base-content/50">{m.prices.effectiveFrom}</dt>
                    <dd className="font-medium">{formatSeoul(p.effectiveFrom)}</dd>
                  </div>
                  {p.nextChange?.basePrice !== undefined && (
                    <div className="space-y-0.5 rounded-lg border border-info/30 bg-info/5 px-3 py-2">
                      <dt className="text-xs text-info">{m.prices.next}</dt>
                      <dd className="font-medium">{`${formatKrw(p.nextChange.basePrice)}${p.nextChange.effectiveFrom ? ` · ${formatSeoul(p.nextChange.effectiveFrom)}` : ''}`}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </QueryState>
        )}
      </Card>
      <Card title={m.prices.history}>
        <QueryState state={toUiState(history, (d) => (d.items?.length ?? 0) === 0)} onRetry={() => void history.refetch()} emptyText={m.prices.noHistory}>
          {(h) => (
            <ol className="relative space-y-4 border-l border-base-300 pl-4">
              {(h.items ?? []).map((v, i) => (
                <li key={v.priceVersion ?? i} className="relative">
                  <span className={`absolute -left-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-base-100 ${v.state === 'EFFECTIVE' ? 'bg-success' : v.state === 'SCHEDULED' ? 'bg-info' : 'bg-base-300'}`} aria-hidden="true" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums">{v.basePrice === undefined ? m.none : formatKrw(v.basePrice)}</span>
                    {v.state ? <StatusBadge tone={VERSION_TONE[v.state] ?? 'ghost'}>{m.prices.versionState[v.state]}</StatusBadge> : m.none}
                  </div>
                  <p className="text-xs text-base-content/50">
                    <span className="font-mono">{`v${v.priceVersion ?? m.none}`}</span>
                    {` · ${v.effectiveFrom ? formatSeoul(v.effectiveFrom) : m.none}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </QueryState>
      </Card>
    </div>
    </div>
  );
}

interface Line {
  sku: string;
  basePrice: string;
  effectiveFrom: string;
}


/** handoff 2026-10-30 §4.5 PRICE 변경 요청 본문. requestedAmount = attributes.basePrice. */
export function priceChangeBody(lines: readonly Line[], requestedEffectiveFrom: string, refId: string): ChangeRequestBody {
  const common = seoulInputToIso(requestedEffectiveFrom);
  return {
    type: 'PRICE',
    targetService: 'pricing-service',
    targetRef: `PRICE-${refId}`,
    allowedActions: ['APPLY_PRICE_VERSION'],
    summary: `기본가 변경 ${lines.length}건`,
    ...(common ? { requestedEffectiveFrom: common } : {}),
    lines: lines.map((l) => {
      const amount = Number(l.basePrice);
      const at = seoulInputToIso(l.effectiveFrom);
      return {
        lineKey: l.sku,
        requestedAmount: amount,
        attributes: { sku: l.sku, basePrice: amount, ...(at ? { effectiveFrom: at } : {}) },
      };
    }),
  };
}

export function PricePage() {
  const [params, setParams] = useSearchParams();
  const sku = params.get('sku') ?? '';
  const valid = SKU_PATTERN.test(sku);
  // 서랍(2026-11-20 사용자 "바꾸기 누르면 상품 조회로 나가지고·맨 아래로 가고") — 줄을 누르든 "가격 변경"을 누르든 오른쪽 서랍 한 곳에서
  // 지금 가격·이력과 바꾸기를 함께. 여러 개 고르면 같은 서랍에 그 SKU 들. 아래 단추는 그 상품의 "가격" 탭으로.
  const [drawer, setDrawer] = useState<{ ids: readonly string[]; productId: string } | null>(null);
  const [bulk, setBulk] = useState<readonly string[] | null>(null);
  // 주소로 바로 열었을 때(?sku=)도 그 상품을 안다 — 상품 조회와 같은 조회(GET /skus/{sku})
  const api = useApi();
  const skuQ = useQuery({ queryKey: ['product', 'sku', sku], enabled: valid && !drawer?.productId, queryFn: () => request('GET', api.product.GET('/skus/{sku}', { params: { path: { sku } } })) });
  const productId = drawer?.productId || skuQ.data?.productId || '';
  const setSku = (next: string | null) =>
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        if (next) q.set('sku', next);
        else q.delete('sku');
        return q;
      },
      { replace: true },
    );
  const startChange = (skus: string[]) => {
    if (skus.length === 1 && skus[0]) {
      setBulk(null);
      setSku(skus[0]);
    } else {
      setSku(null);
      setBulk(skus);
    }
  };
  return (
    <section className="space-y-5">
      <PageHeader
        title={m.prices.title}
        actions={
          <>
            {/* 오른쪽 위 바로 가기(쿠팡 윙처럼) — 요청한 가격 변경의 심사·반영은 승인함에서 */}
            <Link className="btn btn-sm" to="/approvals?type=PRICE">
              {m.prices.list.card.approvals}
            </Link>
            <Link className="btn btn-sm" to="/prices/import">
              {m.prices.importTitle}
            </Link>
          </>
        }
      />
      {/* 가격 관리 목록(2026-11-19 쿠팡 윙 가격관리 참고) — 숫자 카드·안내·검색 띠·목록 */}
      <PriceList
        openSku={valid ? sku : ''}
        onChange={startChange}
        onOpen={(next, ids, productId) => {
          setBulk(null);
          setDrawer({ ids, productId });
          setSku(next);
        }}
      />
      {/* 줄을 누르면 오른쪽에 현재 기본가·예약·이력(예전 SKU 조회 화면 그대로) */}
      {sku && valid && (
        <PreviewDrawer
          id={sku}
          ids={drawer?.ids ?? [sku]}
          onMove={(next) => setSku(next)}
          onClose={() => setSku(null)}
          title={m.prices.list.drawerTitle(sku)}
          {...(productId ? { detailTo: `/products/${encodeURIComponent(productId)}?tab=price`, detailLabel: m.prices.form.productPrice } : {})}
        >
          <div className="space-y-5">
            <section className="space-y-2" aria-label={m.prices.form.title}>
              <h3 className="text-sm font-bold">{m.prices.form.title}</h3>
              <PriceChangeForm key={sku} skus={[sku]} />
            </section>
            <PriceLookup key={sku} sku={sku} compact withProduct={false} />
          </div>
        </PreviewDrawer>
      )}
      {bulk && bulk.length > 0 && (
        <PreviewDrawer id={bulk.join(',')} ids={[]} onMove={() => undefined} onClose={() => setBulk(null)} title={m.prices.form.bulkTitle(bulk.length)}>
          <PriceChangeForm key={bulk.join(',')} skus={bulk} />
        </PreviewDrawer>
      )}
    </section>
  );
}
