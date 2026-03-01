export default function Knob({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[0.58rem] text-text-muted uppercase tracking-wide">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-[58px] cursor-pointer accent-accent-warm"
      />
      <div className="text-[0.62rem] text-accent font-mono">
        {fmt ? fmt(value) : value}
      </div>
    </div>
  )
}
