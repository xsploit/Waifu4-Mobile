type MenuFabProps = {
  onToggle: () => void;
  open: boolean;
};

export function MenuFab({ onToggle, open }: MenuFabProps) {
  return (
    <button
      className={`menu-fab ${open ? 'active' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      title="Menu"
      type="button"
    >
      <svg
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <line x1="3" x2="21" y1="12" y2="12" />
        <line x1="3" x2="21" y1="6" y2="6" />
        <line x1="3" x2="21" y1="18" y2="18" />
      </svg>
    </button>
  );
}
