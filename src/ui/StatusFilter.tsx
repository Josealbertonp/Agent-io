import { statusVisualFor } from '../view/statusVisual';
import { STATUS_FILTER_OPTIONS, StatusFilterValue } from './filterAgents';

export interface StatusFilterProps {
  value: StatusFilterValue;
  onChange: (next: StatusFilterValue) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div className="status-filter" data-testid="status-filter" role="group" aria-label="Filtro de status">
      {STATUS_FILTER_OPTIONS.map((option) => {
        const visual = option === 'all' ? null : statusVisualFor(option);
        const label = option === 'all' ? 'todos' : visual?.label ?? option;
        return (
          <button
            key={option}
            type="button"
            className={value === option ? 'status-filter__btn is-active' : 'status-filter__btn'}
            data-testid={`status-filter-${option}`}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {visual ? (
              <span className="status-dot" style={{ background: visual.hex }} aria-hidden>
                {visual.icon}
              </span>
            ) : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
