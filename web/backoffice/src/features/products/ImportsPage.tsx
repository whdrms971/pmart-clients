// 일괄 등록 — 파일 한 번 올리기 + 진행 현황(2026-11-19 사용자 "콘텐츠 일괄 등록이랑 상품 일괄 등록이 같잖아" → "그렇게 만들어",
// 같은 날 "이렇게만 나오고 다음 진행 같은 건 할 수가 없는 거 아님?" → 배치 번호를 주소에 남기고 카드마다 서버의 지금 상태와 다음 할 일).
// 근거(계약): 세 일괄 등록이 모두 같은 seed-v1.zip 을 받고 서비스마다 다른 부분만 읽는다.
//   - product `POST /product-import-batches`: product.json 의 product·skus 만("이미지·content 는 product-content-service 가 같은 묶음을 따로 받는다")
//   - product-content `POST /content-import-batches`: content 블록과 images/ 만, (source.system, seedProductId) 로 upsert — 같은 묶음을 다시 올려도 늘지 않음
//   - pricing `POST /price-import-batches`: 가격 — 승인 전 새 상품은 SKU_NOT_FOUND, 상품 승인 뒤 배치 화면 "다시 대조"로 푼다
//   그래서 화면은 한 파일을 고른 서비스마다 따로 보낸다(서비스마다 다른 Idempotency-Key, 결과도 따로 — 셋을 묶어 성공이라 하지 않는다).
// 진행 현황: 올린 뒤 배치 번호를 주소(?product=&content=&price=)에 남긴다 — 배치 화면에 갔다 돌아와도(뒤로) 카드가 남는다.
//   카드는 그 배치를 다시 읽어(GET …/{batchId}, 배치 화면과 같은 queryKey — 창으로 돌아오면 새로 읽음) 서버 상태 그대로와 다음 할 일을 보인다.
//   다음 할 일의 순서(상품 승인 → 콘텐츠·가격)는 안내만 — 서버가 판정한다(화면이 막지 않는다).
// 제출·승인은 배치마다 따로(배치 화면). 옛 주소(/products/import·/contents/import·/prices/import)와 배치 화면은 그대로 열린다.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { request } from '@pmart/web-core';
import { CommandFeedback, useCommand, type Command } from '@pmart/web-ui';
import { commandParams } from '../../api/command';
import type { components as Content } from '../../api/generated/product-content';
import type { components as Pricing } from '../../api/generated/pricing';
import type { components as Product } from '../../api/generated/product';
import { useApi } from '../../app/ApiContext';
import { PageHeader, StatusBadge, type Tone } from '../../shared/admin';
import { messages } from '../../shared/messages';
import { multipart, UploadLayout, ZipUpload } from './ProductImportPage';

const m = messages.products.imports;
type Part = 'product' | 'content' | 'price';
const PARTS: readonly Part[] = ['product', 'content', 'price'];
const BATCH_PATH: Readonly<Record<Part, string>> = { product: '/products/import', content: '/contents/import', price: '/prices/import' };

type ProductBatch = Product['schemas']['ImportBatch'];
type ContentBatch = Content['schemas']['ContentImportBatch'];
type PriceBatch = Pricing['schemas']['PriceImportBatch'];

export function ImportsPage() {
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const [pick, setPick] = useState<ReadonlySet<Part>>(new Set(PARTS));
  const [file, setFile] = useState<File | null>(null);
  const product = useCommand((f: File, key) => request('POST', api.product.POST('/product-import-batches', { ...commandParams(key), body: { file: '' }, ...multipart({ file: f }) })));
  const content = useCommand((f: File, key) => request('POST', api.content.POST('/content-import-batches', { ...commandParams(key), body: { file: '' }, ...multipart({ file: f }) })));
  const price = useCommand((f: File, key) => request('POST', api.pricing.POST('/price-import-batches', { ...commandParams(key), body: { file: '' }, ...multipart({ file: f }) })));
  const cmds = { product, content, price } as const;
  const busy = PARTS.some((p) => cmds[p].busy);

  // 접수된 배치 번호를 주소로 — 셋이 따로 끝나도 한 번에 합쳐 쓴다(덮어쓰기 경합 없게)
  const doneId = (p: Part) => {
    const ph = cmds[p].phase;
    return ph.kind === 'done' ? ((ph.result as { batchId?: string }).batchId ?? '') : '';
  };
  const ids = { product: doneId('product'), content: doneId('content'), price: doneId('price') };
  useEffect(() => {
    if (!ids.product && !ids.content && !ids.price) return;
    setParams(
      (q) => {
        const n = new URLSearchParams(q);
        for (const p of PARTS) if (ids[p]) n.set(p, ids[p]);
        return n;
      },
      { replace: true },
    );
    // 배치 번호가 바뀔 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.product, ids.content, ids.price]);
  const batchOf = (p: Part) => params.get(p) ?? '';

  const upload = async (f: File) => {
    setFile(f);
    // 새 파일 — 지난 배치 번호는 주소에서 뺀다(고른 곳만 새로)
    setParams(
      (q) => {
        const n = new URLSearchParams(q);
        for (const p of PARTS) if (pick.has(p)) n.delete(p);
        return n;
      },
      { replace: true },
    );
    // 요청마다 파일 사본 — 한 파일을 세 요청이 동시에 읽다가 한쪽 스트림이 끊기는 일을 막는다
    const bytes = await f.arrayBuffer();
    const copy = () => new File([bytes], f.name, { type: f.type });
    // 서로 기다리지 않고 따로 보낸다 — 하나가 늦거나 실패해도 나머지 결과는 그대로
    for (const p of PARTS) if (pick.has(p)) void cmds[p].run(copy());
  };
  const toggle = (p: Part) =>
    setPick((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const shown = PARTS.filter((p) => batchOf(p) !== '' || cmds[p].phase.kind !== 'idle');
  return (
    <section className="space-y-4">
      <PageHeader title={m.title} description={m.intro} />
      <UploadLayout steps={m.steps} intro={m.caution} cautions={[m.cautionOrder]}>
        <fieldset className="flex flex-wrap items-center gap-4 py-3" aria-label={m.pickLabel} data-testid="imports-pick">
          <legend className="sr-only">{m.pickLabel}</legend>
          <span className="text-sm font-medium">{m.pickLabel}</span>
          {PARTS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={pick.has(p)} disabled={busy} onChange={() => toggle(p)} />
              {m.part[p]}
              <span className="text-xs text-base-content/50">{m.partReads[p]}</span>
            </label>
          ))}
        </fieldset>
        {pick.size === 0 ? (
          <p className="py-3 text-sm text-warning" data-testid="imports-none">
            {m.pickNone}
          </p>
        ) : (
          <ZipUpload busy={busy} onUpload={(f) => void upload(f)} />
        )}
      </UploadLayout>
      {shown.length > 0 && (
        <section aria-label={m.resultTitle} className="space-y-3" data-testid="imports-results">
          <h2 className="text-lg font-bold">{m.resultTitle}</h2>
          <p className="text-sm text-base-content/60">{m.resultIntro}</p>
          <div className="grid gap-3 lg:grid-cols-3">
            {shown.map((p, i) => (
              <article key={p} className="space-y-3 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm" data-testid={`imports-result-${p}`}>
                <h3 className="flex items-center gap-2 font-semibold">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  {m.part[p]}
                </h3>
                {batchOf(p) ? <BatchStatus part={p} batchId={batchOf(p)} productBatchId={batchOf('product')} /> : <Sending part={p} command={cmds[p] as Command<File, unknown>} file={file} />}
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

/** 보내는 중·거절·결과 불명 — 접수되면(배치 번호) BatchStatus 로 바뀐다 */
function Sending({ part, command, file }: { readonly part: Part; readonly command: Command<File, unknown>; readonly file: File | null }) {
  return (
    <>
      <CommandFeedback command={command} />
      {/* 거절은 확정 — 이것만 새로 보낸다(새 키). 결과 불명은 위 "같은 요청으로 결과 확인"(같은 키) */}
      {command.phase.kind === 'rejected' && file && (
        <button type="button" className="btn btn-sm" onClick={() => void command.run(file)} data-testid={`imports-retry-${part}`}>
          {m.retry}
        </button>
      )}
    </>
  );
}

/** 상품 배치가 반영됐는지(콘텐츠·가격 다음 할 일 안내용) — 같은 화면에서 상품 배치를 올렸을 때만 안다 */
function useProductApplied(productBatchId: string): boolean | undefined {
  const api = useApi();
  const q = useQuery({
    queryKey: ['product', 'import-batch', productBatchId],
    enabled: productBatchId !== '',
    queryFn: () => request('GET', api.product.GET('/product-import-batches/{batchId}', { params: { path: { batchId: productBatchId } } })),
  });
  if (!productBatchId || !q.data) return undefined;
  return q.data.state === 'APPLIED' || q.data.state === 'PARTIALLY_APPLIED';
}

const STATE_TONE: Readonly<Record<string, Tone>> = {
  VALIDATED: 'warning',
  UPLOADED: 'warning',
  DRAFT: 'warning',
  SUBMITTED: 'info',
  APPLIED: 'success',
  PUBLISHED: 'success',
  PARTIALLY_APPLIED: 'warning',
  PARTIALLY_PUBLISHED: 'warning',
  REJECTED: 'error',
};

function BatchStatus({ part, batchId, productBatchId }: { readonly part: Part; readonly batchId: string; readonly productBatchId: string }) {
  const api = useApi();
  const productApplied = useProductApplied(part === 'product' ? '' : productBatchId);
  const q = useQuery({
    queryKey: part === 'product' ? ['product', 'import-batch', batchId] : part === 'content' ? ['content', 'import-batch', batchId] : ['pricing', 'import-batch', batchId],
    queryFn: (): Promise<ProductBatch | ContentBatch | PriceBatch> =>
      part === 'product'
        ? request('GET', api.product.GET('/product-import-batches/{batchId}', { params: { path: { batchId } } }))
        : part === 'content'
          ? request('GET', api.content.GET('/content-import-batches/{batchId}', { params: { path: { batchId } } }))
          : request('GET', api.pricing.GET('/price-import-batches/{batchId}', { params: { path: { batchId } } })),
  });
  const open = (label: string, primary: boolean) => (
    <Link className={`btn btn-sm ${primary ? 'btn-primary' : ''}`} to={`${BATCH_PATH[part]}/${encodeURIComponent(batchId)}`} data-testid={`imports-open-${part}`}>
      {label}
    </Link>
  );
  if (q.isPending) return <p className="text-sm text-base-content/50">…</p>;
  if (q.isError)
    return (
      <div className="space-y-2 text-sm" data-testid={`imports-failed-${part}`}>
        <p className="text-warning">{m.readFailed}</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm" onClick={() => void q.refetch()}>
            {m.reread}
          </button>
          {open(m.openBatch, false)}
        </div>
      </div>
    );
  const b = q.data;
  const state = b.state;
  const badge = (
    <StatusBadge tone={STATE_TONE[state] ?? 'ghost'} testId={`imports-state-${part}`}>
      {m.state[state]}
    </StatusBadge>
  );
  // 다음 할 일 — 서버 상태 그대로 고른다
  let next: string;
  let action: { label: string; primary: boolean };
  if (part === 'product') {
    const pb = b as ProductBatch;
    next = state === 'VALIDATED' ? (pb.invalidCount > 0 ? m.todo.productFix(pb.invalidCount) : m.todo.productSubmit) : state === 'SUBMITTED' ? m.todo.waitApproval : state === 'REJECTED' ? m.todo.rejected : m.todo.productApplied;
    action = state === 'VALIDATED' ? { label: m.act.submit, primary: true } : { label: m.openBatch, primary: false };
  } else if (part === 'content') {
    next =
      state === 'UPLOADED'
        ? productApplied === false
          ? m.todo.afterProduct
          : m.todo.contentSubmit
        : state === 'SUBMITTED'
          ? m.todo.waitApproval
          : state === 'REJECTED'
            ? m.todo.rejected
            : m.todo.contentPublished;
    action = state === 'UPLOADED' && productApplied !== false ? { label: m.act.submit, primary: true } : { label: m.openBatch, primary: false };
  } else {
    const prb = b as PriceBatch;
    const noSku = prb.lines.filter((l) => l.status === 'SKU_NOT_FOUND').length;
    next =
      state === 'DRAFT'
        ? noSku > 0
          ? productApplied === true
            ? m.todo.priceRecheck(noSku)
            : m.todo.afterProductPrice(noSku)
          : m.todo.priceSubmit
        : state === 'SUBMITTED'
          ? m.todo.waitApproval
          : state === 'REJECTED'
            ? m.todo.rejected
            : m.todo.priceApplied;
    action = state === 'DRAFT' && (noSku === 0 || productApplied === true) ? { label: noSku > 0 ? m.act.recheck : m.act.submit, primary: true } : { label: m.openBatch, primary: false };
  }
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">{badge}</div>
      <p role="status">
        {part === 'product'
          ? m.sum.product((b as ProductBatch).productCount, (b as ProductBatch).validCount, (b as ProductBatch).invalidCount)
          : part === 'content'
            ? m.sum.content((b as ContentBatch).productCount, (b as ContentBatch).imageCount, (b as ContentBatch).createdCount, (b as ContentBatch).unchangedCount)
            : m.sum.price((b as PriceBatch).lineCount, (b as PriceBatch).submittableCount)}
      </p>
      <p className="rounded bg-base-200/60 px-2 py-1.5 text-xs" data-testid={`imports-next-${part}`}>
        <span className="font-semibold">{m.nextLabel}</span> {next}
      </p>
      {open(action.label, action.primary)}
    </div>
  );
}
