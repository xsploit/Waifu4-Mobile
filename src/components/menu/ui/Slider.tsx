type SliderProps = {
  disabled?: boolean;
  label: string;
  max?: number;
  min?: number;
  onInput: (value: number) => void;
  step?: number;
  value: number;
};

export function Slider({
  disabled = false,
  label,
  max = 1,
  min = 0,
  onInput,
  step = 0.1,
  value,
}: SliderProps) {
  return (
    <div className="slider-row">
      <span>{label}</span>
      <input
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onInput(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </div>
  );
}
