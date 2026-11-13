import { useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { FIELD_ERROR_CLASSES } from '../../../components/ui/fieldStyles';
import { listMerchants } from '../../../services/adminApi';

const RESULT_LIMIT = 8;

// Search merchants (the same GET /admin/merchants the Merchants page uses) and
// pick the ones an announcement goes to.
function MerchantPicker({ selected, onChange, error }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  async function search() {
    setSearching(true);
    setFailed(false);
    try {
      const params = { page: 1, limit: RESULT_LIMIT };
      if (query.trim()) params.search = query.trim();
      const res = await listMerchants(params);
      setResults(res?.merchants || []);
    } catch {
      setFailed(true);
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  const isSelected = (merchant) => selected.some((m) => m._id === merchant._id);
  const add = (merchant) => !isSelected(merchant) && onChange([...selected, merchant]);
  const remove = (merchant) => onChange(selected.filter((m) => m._id !== merchant._id));

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            id="announcement-merchant-search"
            label="Find merchants"
            type="search"
            placeholder="Business, name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search();
              }
            }}
          />
        </div>
        <Button variant="secondary" icon={<Search size={16} />} loading={searching} onClick={search}>
          Search
        </Button>
      </div>

      {failed && <p className="text-sm text-danger">Couldn&apos;t search merchants. Try again.</p>}

      {results && (
        <div className="rounded-lg border border-border">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No merchants match.</p>
          ) : (
            <ul aria-label="Search results" className="max-h-56 divide-y divide-border overflow-y-auto">
              {results.map((merchant) => (
                <li key={merchant._id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{merchant.businessName}</p>
                    <p className="truncate text-xs text-muted-foreground">{merchant.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Plus size={14} />}
                    disabled={isSelected(merchant)}
                    onClick={() => add(merchant)}
                    aria-label={`Add ${merchant.businessName}`}
                  >
                    {isSelected(merchant) ? 'Added' : 'Add'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <p className="text-[13px] font-semibold text-foreground">
          Selected <span className="font-normal text-muted-foreground">({selected.length})</span>
        </p>
        {selected.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No merchants added yet.</p>
        ) : (
          <ul aria-label="Selected merchants" className="mt-2 flex flex-wrap gap-2">
            {selected.map((merchant) => (
              <li
                key={merchant._id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-xs font-medium text-foreground"
              >
                {merchant.businessName}
                <button
                  type="button"
                  onClick={() => remove(merchant)}
                  aria-label={`Remove ${merchant.businessName}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin/40"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p id="announcement-merchants-error" className={FIELD_ERROR_CLASSES}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default MerchantPicker;
