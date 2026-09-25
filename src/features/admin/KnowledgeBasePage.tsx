import { Database, ExternalLink, FileText, RefreshCw, Search, Upload, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { requestJson, toErrorInfo } from '@/api';
import { Button, Spinner, iconProps, smallIconProps, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { Badge, Section, fieldClass, labelClass } from './ui';

const ACCEPTED = '.pdf,.ppt,.pptx';
const EMBED_FIELDS = ['visual_layout_text', 'use_cases', 'tags', 'notes'] as const;
type VectorField = (typeof EMBED_FIELDS)[number];

interface KbUploadResult {
  fileName: string;
  status: 'success' | 'error';
  kbFileLink?: string | null;
  created?: boolean | null;
  message: string;
}

interface KbDocument {
  doc_id: string;
  file_name: string;
  num_slides: number;
  pages: { page_number: number; page_key: string; embedded: boolean }[];
}

interface VectorizeResponse {
  processed: number;
  failed: number;
  force: boolean;
  total_in_collection: number;
  /** field → "created" | "exists" | "error: …" */
  indexes: Record<string, string>;
}

interface RetrieveHit {
  slide_doc_id: string;
  score: number;
  layout_family?: string | null;
  section_label?: string | null;
  raw_file_link?: string | null;
  content_summary?: string | null;
  /** Secure link to the full slide document (needs the Bearer token). */
  slide_detailed_info: string;
  llm_reasoning?: {
    is_strong_match?: boolean;
    match_quality?: string;
    reasoning?: string;
    key_alignments?: string[];
    gaps?: string[];
  } | null;
}

/** doc_id → every slide, or specific slide numbers. */
type Selection = Record<string, 'all' | number[]>;

const pill = (on: boolean) =>
  cn('border px-2.5 py-0.5 text-2xs', on ? 'border-fg bg-fg text-bg' : 'border-hairline-strong hover:border-fg/60');

/** `/admin` — upload KB files, vectorize slide templates, test retrieval (admin-only backend routes). */
export function KnowledgeBasePage() {
  const toast = useToast();
  const fail = useCallback((error: unknown) => toast.show(toErrorInfo(error).message), [toast]);

  // Step 1 — upload
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<KbUploadResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Step 2 — vectorize
  const documents = useQuery({
    queryKey: ['admin', 'kb', 'documents'],
    queryFn: async () => (await requestJson<{ documents?: KbDocument[] }>('/admin/kb/documents')).documents ?? [],
  });
  const docs = documents.data ?? [];
  const loadingDocs = documents.isFetching;
  const loadDocuments = () => void documents.refetch();
  const [selected, setSelected] = useState<Selection>({});
  const [force, setForce] = useState(false);
  const [vectorizing, setVectorizing] = useState(false);
  const [vectorized, setVectorized] = useState<VectorizeResponse | null>(null);

  // Step 3 — retrieve
  const [query, setQuery] = useState('');
  const [vectorField, setVectorField] = useState<VectorField>('visual_layout_text');
  const [topK, setTopK] = useState(5);
  const [filterText, setFilterText] = useState('');
  const [withReasoning, setWithReasoning] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [retrieving, setRetrieving] = useState(false);
  const [hits, setHits] = useState<RetrieveHit[] | null>(null);

  const upload = async () => {
    setUploading(true);
    setResults([]);
    try {
      const form = new FormData();
      files.forEach((file) => form.append('files', file));
      const data = await requestJson<{ results?: KbUploadResult[] }>('/admin/kb/upload', { method: 'POST', body: form });
      const uploaded = data.results ?? [];
      setResults(uploaded);
      const failed = uploaded.filter((r) => r.status !== 'success').length;
      toast.show(failed ? `${uploaded.length - failed} succeeded, ${failed} failed.` : `Uploaded ${uploaded.length} file(s).`);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      loadDocuments();
    } catch (error) {
      fail(error);
    } finally {
      setUploading(false);
    }
  };

  const isPageSelected = (docId: string, page: number) => {
    const sel = selected[docId];
    return sel === 'all' || (sel?.includes(page) ?? false);
  };

  const toggleFile = (docId: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (docId in next) delete next[docId];
      else next[docId] = 'all';
      return next;
    });

  const togglePage = (doc: KbDocument, page: number) =>
    setSelected((prev) => {
      const all = doc.pages.map((p) => p.page_number);
      const cur = prev[doc.doc_id];
      let pages = cur === 'all' || cur === undefined ? all : cur;
      pages = (pages.includes(page) ? pages.filter((p) => p !== page) : [...pages, page]).sort((a, b) => a - b);
      return { ...prev, [doc.doc_id]: pages.length === all.length ? 'all' : pages };
    });

  const selectedSlides = Object.entries(selected).reduce(
    (n, [docId, sel]) => n + (sel === 'all' ? (docs.find((d) => d.doc_id === docId)?.pages.length ?? 0) : sel.length),
    0,
  );

  const vectorize = async () => {
    setVectorizing(true);
    setVectorized(null);
    try {
      const selections = Object.entries(selected).map(([doc_id, sel]) => ({ doc_id, pages: sel === 'all' ? null : sel }));
      const data = await requestJson<VectorizeResponse>('/admin/kb/vectorize', { method: 'POST', body: { selections, force } });
      setVectorized(data);
      const indexErrors = Object.values(data.indexes ?? {}).some((s) => s.startsWith('error'));
      toast.show(
        indexErrors
          ? `Embedded ${data.processed} slide(s), but the vector index reported an error.`
          : `Embedded ${data.processed} slide(s) (${data.failed} failed).`,
      );
      loadDocuments();
    } catch (error) {
      fail(error);
    } finally {
      setVectorizing(false);
    }
  };

  const retrieve = async () => {
    let filter: Record<string, unknown> | null = null;
    if (filterText.trim()) {
      try {
        filter = JSON.parse(filterText) as Record<string, unknown>;
        if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) throw new Error();
      } catch {
        toast.show('Filter must be a JSON object.');
        return;
      }
    }
    setRetrieving(true);
    setHits(null);
    try {
      const data = await requestJson<{ results?: RetrieveHit[] }>('/admin/kb/test-retrieve', {
        method: 'POST',
        body: {
          query: query.trim(),
          vector_field: vectorField,
          top_k: topK,
          filter,
          with_llm_reasoning: withReasoning,
          additional_information: withReasoning ? additionalInfo.trim() || null : null,
        },
      });
      setHits(data.results ?? []);
    } catch (error) {
      fail(error);
    } finally {
      setRetrieving(false);
    }
  };

  // The detail link is a backend URL that needs the admin token, so it can't be a plain <a>.
  const openDetail = async (link: string) => {
    try {
      const url = new URL(link, window.location.origin);
      const doc = await requestJson<unknown>(`${url.pathname}${url.search}`);
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
      if (!window.open(blobUrl, '_blank')) toast.show('Pop-up blocked.');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge base</h1>
        <p className="mt-1 font-sans text-sm text-fg-muted">Upload PDF, PPT or PPTX files, vectorize slide templates, and test retrieval.</p>
      </div>

      <Section title={<><Upload {...iconProps} /> Step 1 — Upload files</>} description="Select one or several files.">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          disabled={uploading}
          onChange={(e) => {
            const incoming = Array.from(e.target.files ?? []);
            setFiles((prev) => [...prev, ...incoming.filter((f) => !prev.some((p) => p.name === f.name))]);
          }}
          className="block w-full text-sm text-fg-muted file:mr-4 file:border-0 file:bg-fg file:px-4 file:py-2 file:text-sm file:text-bg"
        />
        {files.length > 0 && (
          <ul className="flex flex-col gap-1">
            {files.map((file) => (
              <li key={file.name} className="flex items-center justify-between border border-hairline px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText {...iconProps} className="shrink-0 text-fg-muted" />
                  <span className="truncate">{file.name}</span>
                </span>
                <button type="button" aria-label={`Remove ${file.name}`} disabled={uploading} onClick={() => setFiles((prev) => prev.filter((f) => f !== file))} className="text-fg-muted hover:text-fg">
                  <X {...iconProps} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button onClick={() => void upload()} disabled={uploading || files.length === 0} leadingIcon={uploading ? <Spinner size={16} state="active" /> : <Upload {...iconProps} />}>
            {uploading ? 'Uploading…' : `Upload${files.length ? ` (${files.length})` : ''}`}
          </Button>
        </div>
        {results.length > 0 && (
          <table className="w-full text-left text-xs">
            <tbody>
              {results.map((r) => (
                <tr key={r.fileName} className="border-b border-hairline last:border-0">
                  <td className="max-w-64 truncate px-2 py-2">{r.fileName}</td>
                  <td className="px-2 py-2"><Badge tone={r.status === 'success' ? 'strong' : 'danger'}>{r.status}</Badge></td>
                  <td className="px-2 py-2">{r.status === 'success' ? (r.created ? 'Created' : 'Updated') : r.message}</td>
                  <td className="px-2 py-2">
                    {r.kbFileLink ? (
                      <a href={r.kbFileLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                        Open <ExternalLink {...smallIconProps} />
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={<><Database {...iconProps} /> Step 2 — Vectorize slide templates</>}
        description="Embeds each slide's visual layout, use cases, tags and notes, and ensures the Atlas vector indexes. Only slides without embeddings run, unless you force a re-embed."
        action={
          <Button variant="outline" size="sm" onClick={loadDocuments} disabled={loadingDocs || vectorizing} leadingIcon={<RefreshCw {...iconProps} />}>
            Refresh
          </Button>
        }
      >
        {documents.isError ? (
          <p className="text-sm text-danger">{toErrorInfo(documents.error).message}</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-fg-muted">{loadingDocs ? 'Loading files…' : 'No files yet — upload PPTX files first.'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((doc) => (
              <li key={doc.doc_id} className="border border-hairline p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={doc.doc_id in selected} onChange={() => toggleFile(doc.doc_id)} disabled={vectorizing} className="size-4" />
                  <span className="truncate font-bold">{doc.file_name}</span>
                  <Badge>{doc.pages.filter((p) => p.embedded).length}/{doc.pages.length} embedded</Badge>
                </label>
                {doc.doc_id in selected && (
                  <div className="mt-3 flex flex-wrap gap-1.5 pl-6">
                    <button type="button" disabled={vectorizing} onClick={() => setSelected((prev) => ({ ...prev, [doc.doc_id]: 'all' }))} className={pill(selected[doc.doc_id] === 'all')}>
                      All slides
                    </button>
                    {doc.pages.map((p) => (
                      <button
                        key={p.page_key}
                        type="button"
                        disabled={vectorizing}
                        title={p.embedded ? 'Already embedded' : 'Not embedded yet'}
                        onClick={() => togglePage(doc, p.page_number)}
                        className={cn(pill(isPageSelected(doc.doc_id, p.page_number)), p.embedded && 'underline')}
                      >
                        {p.page_number}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={vectorizing} className="size-4" />
          Force re-embed selected slides
        </label>
        <div>
          <Button onClick={() => void vectorize()} disabled={vectorizing || selectedSlides === 0} leadingIcon={vectorizing ? <Spinner size={16} state="active" /> : <Database {...iconProps} />}>
            {vectorizing ? 'Vectorizing…' : `Vectorize (${selectedSlides} slides)`}
          </Button>
        </div>
        {vectorized && (
          <div className="border border-hairline p-3 text-sm">
            <p>
              Processed <strong>{vectorized.processed}</strong> · Failed <strong>{vectorized.failed}</strong> · Collection total{' '}
              <strong>{vectorized.total_in_collection}</strong>
              {vectorized.force ? ' · forced' : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(vectorized.indexes).map(([field, state]) => (
                <Badge key={field} tone={state.startsWith('error') ? 'danger' : 'muted'}>{field}: {state}</Badge>
              ))}
            </div>
            <p className="mt-2 text-2xs text-fg-muted">Atlas builds vector indexes asynchronously — wait until they are READY before retrieving.</p>
          </div>
        )}
      </Section>

      <Section
        title={<><Search {...iconProps} /> Step 3 — Semantic retrieve</>}
        description="Tests the production /kb/retrieve route: one embedded field, an optional metadata filter, optional LLM reasoning."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void retrieve();
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className={labelClass} htmlFor="kb-query">Query</label>
              <input id="kb-query" className={fieldClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. cover slide, KPI dashboard, timeline…" disabled={retrieving} />
            </div>
            <div className="sm:w-48">
              <label className={labelClass} htmlFor="kb-field">Vector field</label>
              <select id="kb-field" className={fieldClass} value={vectorField} onChange={(e) => setVectorField(e.target.value as VectorField)} disabled={retrieving}>
                {EMBED_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="sm:w-24">
              <label className={labelClass} htmlFor="kb-topk">Top K</label>
              <input id="kb-topk" type="number" min={1} max={50} className={fieldClass} value={topK} onChange={(e) => setTopK(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} disabled={retrieving} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="kb-filter">Filter (JSON, optional)</label>
            <textarea id="kb-filter" rows={2} className={cn(fieldClass, 'font-mono text-xs')} value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder='{ "layout_family": "title", "tags": { "$in": ["kpi"] } }' disabled={retrieving} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withReasoning} onChange={(e) => setWithReasoning(e.target.checked)} disabled={retrieving} className="size-4" />
            With LLM reasoning
          </label>
          {withReasoning && (
            <textarea rows={2} aria-label="Additional information" className={fieldClass} value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)} placeholder="Additional information for the reasoning model (optional)…" disabled={retrieving} />
          )}
          <div>
            <Button type="submit" disabled={retrieving || !query.trim()} leadingIcon={retrieving ? <Spinner size={16} state="active" /> : <Search {...iconProps} />}>
              {retrieving ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </form>

        {hits && (hits.length === 0 ? (
          <p className="text-sm text-fg-muted">No hits.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {hits.map((h) => (
              <li key={h.slide_doc_id} className="border border-hairline p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>score {h.score?.toFixed(3)}</Badge>
                  <Badge>{h.layout_family ?? '—'}</Badge>
                  <Badge>{h.section_label ?? '—'}</Badge>
                  {h.llm_reasoning?.match_quality && (
                    <Badge tone={h.llm_reasoning.is_strong_match ? 'strong' : 'muted'}>{h.llm_reasoning.match_quality}</Badge>
                  )}
                  <span className="ml-auto flex items-center gap-3 text-xs">
                    {h.raw_file_link && (
                      <a href={h.raw_file_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                        Open file <ExternalLink {...smallIconProps} />
                      </a>
                    )}
                    <button type="button" onClick={() => void openDetail(h.slide_detailed_info)} className="inline-flex items-center gap-1 text-accent hover:underline">
                      Open detail <ExternalLink {...smallIconProps} />
                    </button>
                  </span>
                </div>
                <p className="mt-2 font-sans text-fg-muted">{h.content_summary ?? '—'}</p>
                {h.llm_reasoning && (
                  <div className="mt-2 bg-muted p-2 font-sans">
                    <p>{h.llm_reasoning.reasoning}</p>
                    {!!h.llm_reasoning.key_alignments?.length && (
                      <p className="mt-1 text-xs text-fg-muted"><strong>Aligns:</strong> {h.llm_reasoning.key_alignments.join('; ')}</p>
                    )}
                    {!!h.llm_reasoning.gaps?.length && (
                      <p className="mt-1 text-xs text-fg-muted"><strong>Gaps:</strong> {h.llm_reasoning.gaps.join('; ')}</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
      </Section>
    </>
  );
}
