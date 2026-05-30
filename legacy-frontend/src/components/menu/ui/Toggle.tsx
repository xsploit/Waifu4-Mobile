type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <label className="switch">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="sw-slider" />
    </label>
  );
}
