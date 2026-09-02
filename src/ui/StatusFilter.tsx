import { statusVisualFor } from '../view/statusVisual';
import { ACTIVITY_FILTER_OPTIONS, StatusFilterValue } from './filterAgents';

export interface StatusFilterProps {
  value: StatusFilterValue;
  onChange: (next: StatusFilterValue) => void;
}

function FilterButton({
  option,
  value,
  onChange,
  label,
}: {
  option: StatusFilterValue;
  value: StatusFilterValue;
  onChange: (next: StatusFilterValue) => void;
  label: string;
}) {
  const visual = option === 'all' || option === 'online' ? null : statusVisualFor(option);
  return (
    <button
      type="button"
      className={value === option ? 'status-filter__btn is-active' : 'status-filter__btn'}
      data-testid={`status-filter-${option}`}
      aria-pressed={value === option}
      onClick={() => onChange(option)}
    >
      {visual ? (
        <span className="status-dot status-dot--sm" style={{ background: visual.hex }} aria-hidden />
      ) : null}
      {label}
    </button>
  );
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div className="status-filter" data-testid="status-filter" role="group" aria-label="Filtro de status">
      <div className="status-filter__group">
        <p className="status-filter__label">Presence</p>
        <div className="status-filter__row">
          <FilterButton option="all" value={value} onChange={onChange} label="All" />
          <FilterButton option="online" value={value} onChange={onChange} label="Online" />
          <FilterButton option="offline" value={value} onChange={onChange} label="Offline" />
        </div>
      </div>
      <div className="status-filter__group">
        <p className="status-filter__label">Status</p>
        <div className="status-filter__row">
          {ACTIVITY_FILTER_OPTIONS.map((option) => (
            <FilterButton
              key={option}
              option={option}
              value={value}
              onChange={onChange}
              label={option}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
