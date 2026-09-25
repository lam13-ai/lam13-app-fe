import { Copy, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { request, requestJson, toErrorInfo } from '@/api';
import { Button, Spinner, iconProps, smallIconProps, useToast } from '@/components/ui';
import { Badge, Section, fieldClass, labelClass } from './ui';

interface ApiKey {
  id: string;
  key: string;
  service: string;
  owner: string;
  active: boolean;
  created_at: string;
  last_used_at?: string | null;
  usage_count: number;
}

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/** `/admin/api-keys` — create keys for services calling /kothar_fn, list them, deactivate them. */
export function ApiKeysPage() {
  const toast = useToast();
  const [service, setService] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const keysQuery = useQuery({
    queryKey: ['admin', 'api-keys'],
    queryFn: () => requestJson<ApiKey[]>('/admin/monitor/api-keys'),
  });
  const keys = keysQuery.data ?? [];
  const loading = keysQuery.isFetching;
  const loadKeys = () => void keysQuery.refetch();

  const fail = useCallback((error: unknown) => toast.show(toErrorInfo(error).message), [toast]);
  const copy = (value: string) =>
    navigator.clipboard.writeText(value).then(
      () => toast.show('Copied to clipboard.'),
      () => toast.show('Could not copy.'),
    );

  const create = async () => {
    if (!service.trim()) return;
    setCreating(true);
    setNewKey(null);
    try {
      const data = await requestJson<{ key: string }>(`/admin/create-key?service=${encodeURIComponent(service.trim())}`, {
        method: 'POST',
      });
      setNewKey(data.key);
      setService('');
      toast.show('API key created. Copy it now — it is shown only once.');
      loadKeys();
    } catch (error) {
      fail(error);
    } finally {
      setCreating(false);
    }
  };

  const deactivate = async (key: ApiKey) => {
    if (!window.confirm(`Deactivate the API key for "${key.service}"? Clients using it will stop working.`)) return;
    try {
      await request(`/admin/api-key?key_id=${encodeURIComponent(key.id)}`, { method: 'DELETE' });
      toast.show('API key deactivated.');
      loadKeys();
    } catch (error) {
      fail(error);
    }
  };

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API keys</h1>
        <p className="mt-1 font-sans text-sm text-fg-muted">
          Keys that let external services call <code>/kothar_fn/kb/retrieve</code>.
        </p>
      </div>

      <Section
        title={<><KeyRound {...iconProps} /> Create a key</>}
        description="Name the service the key is for (e.g. kothar_fn, prod, an Azure function)."
      >
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="flex-1">
            <label className={labelClass} htmlFor="service">Service</label>
            <input id="service" className={fieldClass} value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. kothar_fn" disabled={creating} />
          </div>
          <Button type="submit" disabled={creating || !service.trim()} leadingIcon={creating ? <Spinner size={16} state="active" /> : <KeyRound {...iconProps} />}>
            {creating ? 'Creating…' : 'Create key'}
          </Button>
        </form>

        {newKey && (
          <div className="border border-accent/40 bg-accent-wash p-3 text-sm">
            <p className="mb-2 font-bold">Copy this key now — it is shown in full only once.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all bg-bg px-2 py-1 text-xs">{newKey}</code>
              <Button variant="outline" size="sm" onClick={() => void copy(newKey)} leadingIcon={<Copy {...iconProps} />}>
                Copy
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="All keys"
        description="Stored encrypted; the values below are decrypted for you."
        action={
          <Button variant="outline" size="sm" onClick={loadKeys} disabled={loading} leadingIcon={<RefreshCw {...iconProps} />}>
            Refresh
          </Button>
        }
      >
        {keysQuery.isError ? (
          <p className="text-sm text-danger">{toErrorInfo(keysQuery.error).message}</p>
        ) : keysQuery.isPending ? (
          <Spinner size={20} state="active" label="Loading keys" />
        ) : keys.length === 0 ? (
          <p className="text-sm text-fg-muted">No API keys yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-fg-muted">
                <tr className="border-b border-hairline">
                  {['Service', 'Owner', 'Key', 'Status', 'Usage', 'Last used', ''].map((h) => (
                    <th key={h} className="px-2 py-2 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-hairline last:border-0">
                    <td className="px-2 py-2 font-bold">{k.service}</td>
                    <td className="px-2 py-2">{k.owner}</td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1">
                        <code className="max-w-40 truncate" title={k.key}>{k.key}</code>
                        <button type="button" aria-label="Copy key" onClick={() => void copy(k.key)} className="text-fg-muted hover:text-fg">
                          <Copy {...smallIconProps} />
                        </button>
                      </span>
                    </td>
                    <td className="px-2 py-2"><Badge tone={k.active ? 'strong' : 'muted'}>{k.active ? 'active' : 'inactive'}</Badge></td>
                    <td className="px-2 py-2">{k.usage_count}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-fg-muted">{fmtDate(k.last_used_at)}</td>
                    <td className="px-2 py-2 text-right">
                      {k.active && (
                        <Button variant="ghost" size="sm" onClick={() => void deactivate(k)} leadingIcon={<Trash2 {...iconProps} />} className="text-danger">
                          Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
