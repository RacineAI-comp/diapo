// Shared icon primitive, the single source of truth for Material Icons glyphs across the editor.
// Replaces the four near-identical `icon()`/`mi()` span helpers that were copy-pasted around.
// Material Icons ligatures are enabled globally via .material-icons in cunningham-style.css.
interface Props {
  name: string;
  /** Optional visual size in px (defaults to the inherited font-size from .material-icons). */
  size?: number;
  className?: string;
  /** When the icon is purely decorative (sits next to a label) keep it aria-hidden (default). */
  label?: string;
}

export function Icon({ name, size, className, label }: Props) {
  return (
    <span
      className={`material-icons${className ? ' ' + className : ''}`}
      style={size ? { fontSize: size } : undefined}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {name}
    </span>
  );
}

/** Convenience for the many `icon={<Icon name="x" />}` button props. */
export const icon = (name: string) => <Icon name={name} />;
