type Choice = { value: string; label: string };

/** Same selection semantics for board size and CPU difficulty. */
export function ChoiceGroup({ id, label, value, options, onChange }: {
  id: string; label: string; value: string; options: readonly Choice[]; onChange: (value: string) => void;
}) {
  return <fieldset className="ui-choice-group" data-choice-group={id}>
    <legend>{label}</legend>
    <div>{options.map(option => <button key={option.value} type="button" value={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      <span className="ui-choice-check" aria-hidden="true">{value === option.value ? "✓" : ""}</span>{option.label}
    </button>)}</div>
  </fieldset>;
}
