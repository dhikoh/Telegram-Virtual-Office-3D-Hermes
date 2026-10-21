import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { useOfficeStore } from '../../stores/office';

interface Props {
  agentId: string;
  currentModel: string | null;
  availableModels: string[];
  refreshKey?: number;
}

/** A new agent gets a fresh session; late requests cannot overwrite another agent. */
export function ModelPriorityEditor(props: Props) {
  return <PrioritySession key={props.agentId} {...props} />;
}

function PrioritySession({ agentId, currentModel, availableModels, refreshKey }: Props) {
  const { t } = useTranslation();
  const fetchInitialData = useOfficeStore((s) => s.fetchInitialData);
  const [models, setModels] = useState<string[]>([]);
  const [savedModels, setSavedModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState('');
  const generation = useRef(0);

  useEffect(() => {
    const token = ++generation.current;
    setLoading(true);
    setLoaded(false);
    setSaving(false);
    setError(null);
    setSuccess(false);
    void api.getAgentModelPriority(agentId).then((result) => {
      if (generation.current !== token) return;
      setModels(result.models);
      setSavedModels(result.models);
      setLoaded(true);
    }).catch((err: unknown) => {
      if (generation.current === token) setError(err instanceof Error ? err.message : t('modelPriority.loadError'));
    }).finally(() => {
      if (generation.current === token) setLoading(false);
    });
    return () => { generation.current++; };
  }, [agentId, currentModel, refreshKey, retry, t]);

  const move = (index: number, step: number) => {
    const next = [...models];
    [next[index], next[index + step]] = [next[index + step]!, next[index]!];
    setModels(next);
    setSuccess(false);
  };
  const save = async () => {
    const token = generation.current;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.saveAgentModelPriority(agentId, models);
      if (generation.current !== token) return;
      const result = await api.getAgentModelPriority(agentId);
      if (generation.current !== token) return;
      if (JSON.stringify(result.models) !== JSON.stringify(models) || result.current_model !== models[0]) {
        throw new Error(t('modelPriority.mismatch'));
      }
      await fetchInitialData();
      if (generation.current !== token) return;
      setSavedModels(result.models);
      setSuccess(true);
    } catch (err: unknown) {
      if (generation.current === token) setError(err instanceof Error ? err.message : t('modelPriority.saveError'));
    } finally {
      if (generation.current === token) setSaving(false);
    }
  };
  const buttonClass = 'min-h-[44px] min-w-[44px] rounded-lg border border-office-border text-office-text disabled:opacity-40';
  const candidates = [...new Set(availableModels.filter((model) => model.trim() && !models.includes(model)))];
  const blocked = saving || !loaded;
  return (
    <section aria-label={t('modelPriority.title')} className="flex flex-col gap-2 rounded-xl border border-office-border bg-office-inset p-3">
      <h3 className="text-xs font-semibold text-office-text">{t('modelPriority.title')}</h3>
      <p className="text-[11px] text-office-muted">{t('modelPriority.help', { max: 5 })}</p>
      {loading ? <p role="status" className="text-xs text-office-muted">{t('modelPriority.loading')}</p> : (
        <>
          <ol className="flex flex-col gap-1">
            {models.map((model, index) => (
              <li key={model} data-model={model} className="flex items-center gap-1 text-xs text-office-text">
                <span className="min-w-0 flex-1 break-all font-mono">{model}</span>
                {index === 0 && <span className="rounded bg-office-accent/10 px-1.5 py-1 text-[10px] text-office-accent-ink">{t('modelPriority.primary')}</span>}
                <button type="button" className={buttonClass} disabled={saving || index === 0} aria-label={t('modelPriority.up', { model })} onClick={() => move(index, -1)}><ArrowUp aria-hidden className="mx-auto h-3.5 w-3.5" /></button>
                <button type="button" className={buttonClass} disabled={saving || index === models.length - 1} aria-label={t('modelPriority.down', { model })} onClick={() => move(index, 1)}><ArrowDown aria-hidden className="mx-auto h-3.5 w-3.5" /></button>
                <button type="button" className={buttonClass} disabled={saving} aria-label={t('modelPriority.remove', { model })} onClick={() => { setModels(models.filter((entry) => entry !== model)); setSuccess(false); }}><X aria-hidden className="mx-auto h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ol>
          {!models.length && <p className="text-xs text-office-muted">{t('modelPriority.empty')}</p>}
          {!availableModels.some((model) => model.trim()) && <p className="text-xs text-office-muted">{t('modelPriority.noModels')}</p>}
          {models.length >= 5 && <p className="text-xs text-office-muted">{t('modelPriority.limit', { max: 5 })}</p>}
          <div className="flex gap-2">
            <select aria-label={t('modelPriority.select')} value={candidates.includes(selected) ? selected : ''} disabled={blocked || models.length >= 5 || !candidates.length} onChange={(event) => setSelected(event.target.value)} className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-office-border bg-office-surface px-2 text-xs text-office-text disabled:opacity-40">
              <option value="">{t('modelPriority.select')}</option>
              {candidates.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
            <button type="button" className={`${buttonClass} px-2 text-xs`} disabled={blocked || models.length >= 5 || !candidates.includes(selected)} onClick={() => { if (models.length < 5 && candidates.includes(selected)) { setModels([...models, selected]); setSelected(''); setSuccess(false); } }}>{t('modelPriority.add')}</button>
          </div>
          <button type="button" className={`${buttonClass} text-xs font-semibold`} disabled={saving || !models.length || JSON.stringify(models) === JSON.stringify(savedModels)} onClick={() => void save()}>{t(saving ? 'modelPriority.saving' : 'modelPriority.save')}</button>
        </>
      )}
      {error && <div role="alert" className="text-xs text-office-danger">{error}<button type="button" className={`${buttonClass} ml-2 px-2`} disabled={saving || loading} onClick={() => setRetry((value) => value + 1)}>{t('modelPriority.retry')}</button></div>}
      {success && <p role="status" className="text-xs text-office-success">{t('modelPriority.saved')}</p>}
    </section>
  );
}
