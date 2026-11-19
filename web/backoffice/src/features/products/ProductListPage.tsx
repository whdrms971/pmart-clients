// 상품 목록(카테고리·판매 상태 필터, 커서는 URL) + SKU·바코드로 찾기.
// 2026-11-19 쿠팡 윙 "상품 조회/수정" 참고: 판매 상태 숫자 카드 → 회색 검색 띠(상품명·카테고리 경로·바로 찾기) → 머리줄·정렬 → 줄(이름·카테고리 경로·판매가 ~·상태·[상품 수정 ⋮]). 시스템 ID(상품·카테고리 노드)는 줄에 안 보인다.
// 화면(2026-11-18 사용자 "밋밋하다 — Shopify·Medusa 상품 목록처럼"): 한 카드 안에 판매 상태 탭 → 찾기 줄(바로 찾기·카테고리) →
// 표(관리용 명칭 굵게·상품 ID 작게, 판매 상태 점 배지, 버전) → 아래 표시 수·더 보기. 머리말 오른쪽에 등록 버튼.
import { AuthedImage } from '../contents/AuthedImage';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { PmartFailure } from '@pmart/web-core';
import { SALE_STATES, type SaleState } from '../../api/models';
import { request } from '@pmart/web-core';
import { useApi } from '../../app/ApiContext';
import { FailureAlert } from '../../shared/Feedback';
import { SavedViews } from '../../shared/SavedViews';
import { messages as m } from '../../shared/messages';
import { QueryState } from '@pmart/web-ui';
import { toUiState } from '@pmart/web-ui';
import { countCell, PageHeader, StatCard, StatStrip, StatusBadge, type Tone } from '../../shared/admin';
import { SearchSelect } from '../../shared/SearchSelect';
import { formatKrw } from '@pmart/web-ui';
import { useProductPrices } from '../prices/productPrices';
import { PreviewDrawer, usePreview } from '../../shared/Preview';
import { ProductPreviewBody } from './ProductPreview';
import { LineIcon, tableClass } from './parts';

const l = m.products.listView;

export const SALE_TONE: Readonly<Record<SaleState, Tone>> = {
  ON_SALE: 'success',
  TEMPORARILY_SOLD_OUT: 'warning',
  SALE_STOPPED: 'error',
};

function Lookup() {
  const api = useApi();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [failure, setFailure] = useState<PmartFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const find = async (by: 'sku' | 'barcode') => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    setFailure(null);
    try {
      const productId =
        by === 'sku'
          ? (await request('GET', api.product.GET('/skus/{sku}', { params: { path: { sku: v } } }))).productId
          : (await request('GET', api.product.GET('/barcodes/{barcode}', { params: { path: { barcode: v } } }))).productId;
      if (productId) void navigate(`/products/${encodeURIComponent(productId)}`);
    } catch (e) {
      if (e instanceof PmartFailure) setFailure(e);
      else throw e;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="text-xs font-medium text-base-content/55">{m.products.quickFind}</div>
      <div className="join">
        <label className="input input-sm join-item flex items-center gap-2">
          <LineIcon name="search" className="h-4 w-4 text-base-content/40" />
          <input aria-label={m.products.skuLookup} className="grow" placeholder="E-00000001 / 8801234567890" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button type="button" className="btn btn-sm join-item" disabled={busy} onClick={() => void find('sku')}>
          {m.products.skuLookup}
        </button>
        <button type="button" className="btn btn-sm join-item" disabled={busy} onClick={() => void find('barcode')}>
          {m.products.barcodeLookup}
        </button>
      </div>
      {failure && <FailureAlert failure={failure} />}
    </div>
  );
}

/** 판매 상태별 수(카드) — 상태마다 한 번씩 묻는다(서버가 전체를 세 주지 않아 COUNT_SIZE 까지 세고 넘으면 "N+") */
const COUNT_SIZE = 200;
function useSaleCounts() {
  const api = useApi();
  const states = ['', ...SALE_STATES] as const;
  const qs = useQueries({
    queries: states.map((st) => ({
      queryKey: ['product', 'counts', st],
      queryFn: async () => {
        const r = await request('GET', api.product.GET('/products', { params: { query: { size: COUNT_SIZE, ...(st ? { saleState: st } : {}) } } }));
        return { n: r.items?.length ?? 0, more: Boolean(r.page?.nextCursor) };
      },
    })),
  });
  return new Map(states.map((st, i) => [st, countCell(qs[i] ?? { isError: false })]));
}

// 정렬(2026-11-19 사용자 "이름순 해도 작동 안 함" — 목 두 상품이 이미 가나다 순이라 바뀐 게 안 보였다): 이 쪽 안에서. 가격 미설정·못 읽음은 맨 뒤
type Sort = 'server' | 'name' | 'nameDesc' | 'priceAsc' | 'priceDesc';
const SORTS: readonly Sort[] = ['server', 'name', 'nameDesc', 'priceAsc', 'priceDesc'];

export function ProductListPage() {
  const api = useApi();
  // 오른쪽 미리보기(2026-11-19 관제 형식)
  const pv = usePreview();
  const [params, setParams] = useSearchParams();
  const saleState: SaleState | undefined = SALE_STATES.find((s) => s === params.get('saleState'));
  const categoryId = params.get('categoryId') ?? '';
  // 콘텐츠 게시 상태 거르기(2026-11-19 상품 묶음 합치기 — 콘텐츠 조회 화면 대신) — 이 쪽 안에서, 게시 카드 기준
  const contentFilter = (['published', 'missing'] as const).find((v) => v === params.get('content'));
  // 가격 미설정 거르기(2026-11-19 상품 하나씩 등록 다듬기) — 이 쪽 안에서, 서버 가격(notSet) 기준. 못 읽은 상품은 거르지 않고 남긴다
  const priceFilter = params.get('price') === 'notSet' ? ('notSet' as const) : undefined;
  const cursor = params.get('cursor') ?? undefined;
  const [text, setText] = useState('');
  const [sort, setSort] = useState<Sort>('server');
  const counts = useSaleCounts();

  const query = useQuery({
    queryKey: ['product', 'list', saleState, categoryId, cursor],
    queryFn: () =>
      request(
        'GET',
        api.product.GET('/products', {
          params: {
            query: {
              ...(saleState ? { saleState } : {}),
              ...(categoryId ? { categoryId } : {}),
              ...(cursor ? { cursor } : {}),
              size: 50,
            },
          },
        }),
      ),
  });
  // 카테고리 경로(대분류 > 중분류) — 줄·미리보기·고르기 칸에 노드 ID 대신(ADR-0070 덧붙임)
  const tree = useQuery({ queryKey: ['product', 'category-tree'], queryFn: () => request('GET', api.product.GET('/categories/tree', {})) });
  const pathOf = useMemo(() => new Map((tree.data?.nodes ?? []).map((n) => [n.categoryId, n.path ?? n.name])), [tree.data]);
  const catLabel = (id: string | undefined) => (id ? (pathOf.get(id) ?? (tree.isError ? '?' : '…')) : m.none);
  const ids = useMemo(() => (query.data?.items ?? []).flatMap((p) => (p.productId ? [p.productId] : [])), [query.data]);
  const priceOf = useProductPrices(ids);
  // 상품 카드(대표 이미지·고객용 이름, 2026-11-19 쿠팡 윙처럼 사진을 앞에) — GET /product-contents?productIds=(최대 100, 이 쪽 50개). 미게시는 missing → 상자 아이콘
  const cards = useQuery({
    queryKey: ['product-contents', 'cards', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: () => request('GET', api.content.GET('/product-contents', { params: { query: { productIds: ids } } })),
  });
  const cardOf = useMemo(() => new Map((cards.data?.items ?? []).flatMap((c) => (c.productId ? [[c.productId, c] as const] : []))), [cards.data]);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'cursor') next.delete('cursor');
    setParams(next);
  };
  const q = text.trim().toLowerCase().replace(/\s+/g, '');
  const filtered = saleState !== undefined || categoryId !== '' || q !== '' || contentFilter !== undefined || priceFilter !== undefined;
  const stateName = saleState ? m.products.saleStateName[saleState] : l.all;

  return (
    <section className="space-y-4">
      <PageHeader
        title={m.products.listTitle}
        actions={
          <>
            {/* 가격 관리는 메뉴 대신 여기서(2026-11-19 메뉴 정리) */}
            <Link className="btn btn-sm" to="/prices">
              {m.products.imports.priceManage}
            </Link>
            <Link className="btn btn-sm" to="/imports">
              {m.nav.imports}
            </Link>
            <Link className="btn btn-sm btn-primary" to="/products/drafts/new">
              {m.products.draftTitle}
            </Link>
          </>
        }
      />
      {/* 판매 상태 숫자 카드(2026-11-19 쿠팡 윙 상품 조회/수정 참고) — 누르면 그 상태로. 품절·판매중지가 있으면 색 */}
      <StatStrip label={m.products.saleState} testId="product-counts">
        <StatCard layout="row" label={l.all} value={counts.get('') ?? '…'} to="/products" active={!saleState} testId="product-count-all" />
        {SALE_STATES.map((st) => {
          const v = counts.get(st) ?? '…';
          const has = /^[1-9]/.test(v);
          return (
            <StatCard
              key={st}
              layout="row"
              label={m.products.saleStateName[st]}
              value={v}
              tone={has ? (st === 'ON_SALE' ? 'success' : st === 'TEMPORARILY_SOLD_OUT' ? 'warning' : 'error') : undefined}
              to={`/products?saleState=${st}`}
              active={saleState === st}
              testId={`product-count-${st}`}
            />
          );
        })}
      </StatStrip>
      {/* 내 보기(2026-11-18 Saleor 참고) — 지금 주소 조건을 이름 붙여 저장 */}
      <SavedViews listKey="products" />

      {/* 회색 검색 띠: 상품명(이 쪽 안에서 바로) · 카테고리(경로로 찾기) · SKU·바코드 바로 찾기 · 초기화 */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-box bg-base-300/40 px-4 py-3" role="group" aria-label={l.filters}>
        <label className="flex min-w-56 flex-col gap-1 text-xs font-medium text-base-content/60">
          {l.name}
          <span className="input input-sm flex w-64 items-center gap-2 bg-base-100">
            <LineIcon name="search" className="h-4 w-4 text-base-content/40" />
            <input className="grow" aria-label={l.name} placeholder={l.nameHint} value={text} onChange={(e) => setText(e.target.value)} />
          </span>
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-base-content/60">
          <span>{l.category}</span>
          <SearchSelect
            label={l.category}
            className="w-72"
            value={categoryId}
            allowEmpty={l.allCategories}
            options={(tree.data?.nodes ?? []).map((n) => ({ value: n.categoryId, label: n.path ?? n.name }))}
            loading={tree.isPending}
            onChange={(v) => setParam('categoryId', v)}
          />
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-base-content/60">
          {l.col.content}
          <select className="select select-sm w-36 bg-base-100" aria-label={l.col.content} value={contentFilter ?? ''} onChange={(e) => setParam('content', e.target.value)}>
            <option value="">{l.all}</option>
            <option value="published">{l.contentPublished}</option>
            <option value="missing">{l.contentMissingOnly}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-base-content/60">
          {l.col.price}
          <select className="select select-sm w-36 bg-base-100" aria-label={l.col.price} value={priceFilter ?? ''} onChange={(e) => setParam('price', e.target.value)}>
            <option value="">{l.all}</option>
            <option value="notSet">{l.priceNotSetOnly}</option>
          </select>
        </label>
        <Lookup />
        <button
          type="button"
          className="btn btn-sm btn-ghost text-base-content/60"
          disabled={!filtered}
          onClick={() => {
            setText('');
            setParams({});
          }}
        >
          {l.reset} ⟳
        </button>
      </div>

      <QueryState state={toUiState(query, (d) => (d.items?.length ?? 0) === 0)} onRetry={() => void query.refetch()} emptyText={m.products.listEmpty}>
        {(d) => {
          // 이름 찾기 — 관리용 명칭 또는 고객용 상품명(게시된 콘텐츠). 서버에 이름 검색이 없어 이 쪽 안에서만(백엔드 요청 2026-11-19 product-name-search)
          const nameOf = (p: (typeof all)[number]) => `${p.internalName ?? ''}${(p.productId && cardOf.get(p.productId)?.name) ?? ''}`.toLowerCase().replace(/\s+/g, '');
          const all = d.items ?? [];
          const items = all
            .filter((p) => !q || nameOf(p).includes(q))
            .filter((p) => !contentFilter || !cards.data || (contentFilter === 'published' ? Boolean(p.productId && cardOf.has(p.productId)) : Boolean(p.productId && (cards.data.missing ?? []).includes(p.productId))))
            .filter((p) => {
              if (!priceFilter || !p.productId) return true;
              const pr = priceOf.get(p.productId);
              return !pr || pr.loading || pr.failed || pr.notSet > 0;
            });
          // 빠진 것(불러온 쪽 기준) — 사진 미게시(게시 카드 missing)·가격 미설정(서버 notSet). 못 읽었거나 읽는 중이면 세지 않고 "…"
          const loadedIds = all.flatMap((p) => (p.productId ? [p.productId] : []));
          const noPhoto = cards.data ? loadedIds.filter((id) => (cards.data.missing ?? []).includes(id)).length : undefined;
          const priceDone = loadedIds.every((id) => { const pr = priceOf.get(id); return pr && !pr.loading; });
          const noPrice = priceDone ? loadedIds.filter((id) => (priceOf.get(id)?.notSet ?? 0) > 0).length : undefined;
          const more = Boolean(d.page?.nextCursor);
          const byName = (x: (typeof items)[number], y: (typeof items)[number]) => (x.internalName ?? '').localeCompare(y.internalName ?? '', 'ko');
          const priceKey = (p: (typeof items)[number]) => (p.productId ? priceOf.get(p.productId)?.min : undefined);
          const byPrice = (dir: 1 | -1) => (x: (typeof items)[number], y: (typeof items)[number]) => {
            const a = priceKey(x);
            const b = priceKey(y);
            if (a === undefined) return b === undefined ? 0 : 1;
            if (b === undefined) return -1;
            return dir * (a - b);
          };
          const rows =
            sort === 'name' ? [...items].sort(byName) : sort === 'nameDesc' ? [...items].sort((x, y) => byName(y, x)) : sort === 'priceAsc' ? [...items].sort(byPrice(1)) : sort === 'priceDesc' ? [...items].sort(byPrice(-1)) : items;
          return (
            <>
              {/* 목록 머리줄: 이름 · 총 N개 | 정렬 칩 · 표시 수 */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <h2 className="text-base font-bold">{stateName}</h2>
                  <span className="text-base-content/60">{l.total(rows.length, Boolean(d.page?.nextCursor))}</span>
                </div>
              </div>
              {/* 등록이 덜 된 상품(2026-11-19) — 눌러서 그것만 보기. 수는 불러온 쪽 기준, 더 있으면 "+" */}
              {(noPhoto !== 0 || noPrice !== 0) && (
                <div className="flex flex-wrap items-center gap-2 rounded-box border border-warning/30 bg-warning/5 px-3 py-2 text-sm" data-testid="product-missing">
                  <span className="font-medium">{l.missing.title}</span>
                  {noPhoto !== 0 && (
                    <button type="button" className="btn btn-xs rounded-full border-warning/40 bg-base-100" aria-pressed={contentFilter === 'missing'} onClick={() => setParam('content', contentFilter === 'missing' ? '' : 'missing')} data-testid="missing-photo">
                      {l.missing.photo(noPhoto === undefined ? (cards.isError ? '?' : '…') : `${noPhoto}${more ? '+' : ''}`)}
                    </button>
                  )}
                  {noPrice !== 0 && (
                    <button type="button" className="btn btn-xs rounded-full border-warning/40 bg-base-100" aria-pressed={priceFilter === 'notSet'} onClick={() => setParam('price', priceFilter ? '' : 'notSet')} data-testid="missing-price">
                      {l.missing.price(noPrice === undefined ? '…' : `${noPrice}${more ? '+' : ''}`)}
                    </button>
                  )}
                  <span className="text-xs text-base-content/50">{l.missing.basis}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {SORTS.map((s) => (
                    <button key={s} type="button" className={`btn btn-xs rounded-full ${sort === s ? 'btn-primary btn-outline' : 'btn-ghost border border-base-300'}`} aria-pressed={sort === s} onClick={() => setSort(s)}>
                      {l.sort[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm" data-testid="product-list-card">
                <div className="overflow-x-auto">
                  <table className={tableClass}>
                    <thead>
                      <tr>
                        <th>
                          {l.col.product}
                          <span className="block text-[11px] font-normal text-base-content/40">{l.col.productSub}</span>
                        </th>
                        <th className="text-right">
                          {l.col.price}
                          <span className="block text-[11px] font-normal text-base-content/40">{l.col.priceSub}</span>
                        </th>
                        <th>{m.products.saleState}</th>
                        <th>{l.col.content}</th>
                        <th className="w-44" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-sm text-base-content/60" data-testid="product-empty">
                            {l.noMatch}{' '}
                            <button type="button" className="link link-primary" onClick={() => setText('')}>
                              {l.showAll}
                            </button>
                          </td>
                        </tr>
                      )}
                      {rows.map((p, i) => {
                        const pr = p.productId ? priceOf.get(p.productId) : undefined;
                        return (
                          <tr key={p.productId ?? i} data-testid="product-row" {...pv.row(p.productId)}>
                            <td className="max-w-xl">
                              <div className="flex items-center gap-3">
                                <Thumb card={p.productId ? cardOf.get(p.productId) : undefined} name={p.internalName ?? ''} />
                                <div className="min-w-0">
                                  {/* 이름도 줄과 같게 — 누르면 오른쪽 미리보기(2026-11-20 사용자 "어떤 건 미리보기, 어떤 건 상세 — 일관성 없다") */}
                                  <p className="truncate font-semibold" title={p.internalName ?? undefined} data-testid="product-name">
                                    {p.internalName ?? m.none}
                                  </p>
                                  {(() => {
                                    const c = p.productId ? cardOf.get(p.productId) : undefined;
                                    return c?.name && c.name !== p.internalName ? <p className="truncate text-xs text-base-content/60">{l.customerName(c.name)}</p> : null;
                                  })()}
                                  <p className="truncate text-xs text-base-content/50" data-testid="product-category">
                                    {catLabel(p.primaryCategoryId)}
                                    {pr && pr.skus.length > 0 && ` · ${l.skuCount(pr.skus.length)}`}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="text-right" data-testid="product-price">
                              {!pr || pr.loading ? (
                                <span className="text-base-content/40">…</span>
                              ) : pr.failed ? (
                                <span className="text-base-content/40" title={l.priceFailed}>
                                  ?
                                </span>
                              ) : pr.min !== undefined ? (
                                <>
                                  <span className="block font-bold tabular-nums">{`${formatKrw(pr.min)}${pr.max !== undefined && pr.max > pr.min ? '~' : ''}`}</span>
                                  {pr.notSet > 0 && <span className="block text-xs font-semibold text-error">{l.someNotSet(pr.notSet)}</span>}
                                </>
                              ) : pr.notSet > 0 ? (
                                <span className="font-semibold text-error">{l.notSet}</span>
                              ) : (
                                <span className="text-base-content/40">{m.none}</span>
                              )}
                            </td>
                            <td>{p.saleState ? <StatusBadge tone={SALE_TONE[p.saleState]}>{m.products.saleStateName[p.saleState]}</StatusBadge> : m.none}</td>
                            {/* 콘텐츠 게시 상태(게시 카드 일괄 조회 — 못 읽으면 "?", 미게시로 바꾸지 않음) */}
                            <td data-testid="product-content-state">
                              {!cards.data ? (
                                <span className="text-base-content/40">{cards.isError ? '?' : '…'}</span>
                              ) : p.productId && cardOf.has(p.productId) ? (
                                <StatusBadge tone="success">{l.contentPublished}</StatusBadge>
                              ) : p.productId && (cards.data.missing ?? []).includes(p.productId) ? (
                                <StatusBadge tone="warning">{l.contentMissing}</StatusBadge>
                              ) : (
                                <span className="text-base-content/40">?</span>
                              )}
                            </td>
                            <td className="text-right" onClick={(e) => e.stopPropagation()}>
                              {p.productId && <RowActions productId={p.productId} />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 px-4 py-3 text-sm">
                  <span className="text-base-content/55">
                    {m.products.listShown(d.items?.length ?? 0, Boolean(d.page?.nextCursor))}
                    {q && d.page?.nextCursor && <span className="ml-2 text-warning">{l.searchThisPage}</span>}
                  </span>
                  {d.page?.nextCursor && (
                    <button type="button" className="btn btn-sm" onClick={() => setParam('cursor', d.page?.nextCursor ?? '')}>
                      {m.more}
                    </button>
                  )}
                </div>
              </div>
              {pv.id &&
                (() => {
                  const all = d.items ?? [];
                  const p = all.find((x) => x.productId === pv.id);
                  return (
                    <PreviewDrawer id={pv.id} ids={rows.flatMap((x) => (x.productId ? [x.productId] : []))} onMove={pv.open} onClose={pv.close} title={p?.internalName ?? m.none} detailTo={`/products/${encodeURIComponent(pv.id)}`}>
                      {/* SKU·바코드·가격·버전까지(2026-11-20) — 상세와 같은 조회 */}
                      <ProductPreviewBody productId={pv.id} category={catLabel(p?.primaryCategoryId)} imageId={cardOf.get(pv.id)?.mainImage?.imageId} customerName={cardOf.get(pv.id)?.name ?? undefined} />
                    </PreviewDrawer>
                  );
                })()}
            </>
          );
        }}
      </QueryState>
    </section>
  );
}

/** 대표 이미지 썸네일 — 게시된 콘텐츠의 MAIN 이미지(인증 필요해 AuthedImage), 없으면 상자 아이콘 */
function Thumb({ card, name }: { readonly card: { readonly mainImage?: { readonly imageId?: string } } | undefined; readonly name: string }) {
  const id = card?.mainImage?.imageId;
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-base-300 bg-base-200 text-base-content/45" data-testid="product-thumb">
      {id ? <AuthedImage imageId={id} alt={name} className="h-full w-full object-cover" /> : <LineIcon name="box" className="h-5 w-5" />}
    </span>
  );
}

/** 줄 행동(쿠팡 윙 "상품수정 ⋮") — 상품 수정은 상세로, ⋮ 는 가격·콘텐츠로 바로 */
function RowActions({ productId }: { readonly productId: string }) {
  const detail = `/products/${encodeURIComponent(productId)}`;
  return (
    <div className="join">
      <Link className="btn btn-sm join-item" to={detail} data-testid="product-edit">
        {l.edit}
      </Link>
      <div className="dropdown dropdown-end join-item">
        <button type="button" className="btn btn-sm join-item px-2" aria-label={l.more} title={l.more}>
          ⋮
        </button>
        <ul tabIndex={0} className="menu dropdown-content z-30 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-1 text-sm shadow-lg">
          <li>
            {/* 가격 — 그 상품의 가격 탭에서 바로 바꾼다(2026-11-20, 가격 관리 화면으로 보내지 않음) */}
            <Link to={`${detail}?tab=price`}>{l.menu.price}</Link>
          </li>
          <li>
            <Link to={`${detail}?tab=content`}>{l.menu.content}</Link>
          </li>
          <li>
            <Link to={`${detail}#sale-state-change`}>{l.menu.saleState}</Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
