'use client';

// Styled dropdowns replacing native <select> and <datalist>, which browsers draw in their own
// old-style UI. The menu renders in a portal with fixed positioning, so panels with overflow
// hidden never clip it, and it opens upwards when there's no room below. Keyboard: arrows,
// Home/End, Enter/Space, Escape, Tab, and type-ahead. Keys handled here don't reach the
// app-wide single-key shortcuts (use-shortcuts.js).
import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_GAP = 6;
const MENU_MAX_H = 280;

// Fixed position for a menu under (or above) its anchor; follows scrolling and resizing.
function useMenuPosition(anchorRef, open) {
  const [pos, setPos] = useState(null);

  const update = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - MENU_GAP;
    const above = rect.top - MENU_GAP;
    const up = below < Math.min(MENU_MAX_H, 160) && above > below;
    setPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      minWidth: rect.width,
      maxHeight: Math.max(120, Math.min(MENU_MAX_H, up ? above : below) - 8),
      ...(up
        ? { bottom: window.innerHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);

  return pos;
}

// Closes the menu on a pointer press outside both the anchor and the menu.
function useOutsidePress(open, refs, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (refs.some((ref) => ref.current?.contains(event.target))) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, refs, onClose]);
}

function Menu({ id, menuRef, pos, label, activeId, children }) {
  if (!pos) return null;
  return createPortal(
    <ul
      id={id}
      ref={menuRef}
      role="listbox"
      aria-label={label}
      aria-activedescendant={activeId}
      tabIndex={-1}
      className="menu"
      style={pos}
    >
      {children}
    </ul>,
    document.body,
  );
}

function MenuOption({ id, selected, active, disabled, onPick, onHover, children, hint }) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      className={`menu-option${active ? ' active' : ''}`}
      // mousedown keeps focus on the trigger or input; the pick happens on click.
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={onHover}
      onClick={() => !disabled && onPick()}
    >
      <span className="menu-option-text">
        <span className="menu-option-label">{children}</span>
        {hint && <span className="menu-option-hint">{hint}</span>}
      </span>
      {selected && <Check className="menu-option-check" size={15} aria-hidden="true" />}
    </li>
  );
}

function nextEnabled(options, from, step) {
  for (let i = 1; i <= options.length; i++) {
    const index = (from + step * i + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

// options: [{ value, label, hint?, disabled? }]. onChange(value) fires only on a new value.
export function Select({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  label,
  size = 'md',
  className = '',
  icon: Icon,
}) {
  const autoId = useId();
  const triggerId = id ?? `${autoId}-trigger`;
  const menuId = `${autoId}-menu`;
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const pos = useMenuPosition(triggerRef, open);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const close = useCallback(() => setOpen(false), []);
  useOutsidePress(open, [triggerRef, menuRef], close);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${autoId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, autoId]);

  const openMenu = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : nextEnabled(options, -1, 1));
    setOpen(true);
  };

  const pick = (index) => {
    const option = options[index];
    setOpen(false);
    triggerRef.current?.focus();
    if (option && !option.disabled && option.value !== value) onChange(option.value);
  };

  const typeAhead = (char) => {
    const now = Date.now();
    typed.current = {
      text: (now - typed.current.at < 700 ? typed.current.text : '') + char.toLowerCase(),
      at: now,
    };
    const start = open ? active : selectedIndex;
    for (let i = 1; i <= options.length; i++) {
      const index = (start + i + options.length) % options.length;
      const option = options[index];
      if (!option.disabled && String(option.label).toLowerCase().startsWith(typed.current.text)) {
        return index;
      }
    }
    return -1;
  };

  const onKeyDown = (event) => {
    if (disabled || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    if (typeof key !== 'string') return;

    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
        event.preventDefault();
        event.stopPropagation();
        openMenu();
      } else if (key.length === 1) {
        // Type-ahead on a closed menu changes the value directly, as a native select does.
        event.stopPropagation();
        const index = typeAhead(key);
        if (index >= 0 && options[index].value !== value) onChange(options[index].value);
      }
      return;
    }

    if (key === 'Tab') {
      setOpen(false);
      return;
    }
    event.stopPropagation();
    if (key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const next = nextEnabled(options, active, key === 'ArrowDown' ? 1 : -1);
      if (next >= 0) setActive(next);
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault();
      const next =
        key === 'Home' ? nextEnabled(options, -1, 1) : nextEnabled(options, options.length, -1);
      if (next >= 0) setActive(next);
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (active >= 0) pick(active);
    } else if (key.length === 1) {
      const index = typeAhead(key);
      if (index >= 0) setActive(index);
    }
  };

  return (
    <>
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        className={`select-trigger size-${size} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        {Icon && <Icon className="select-icon" size={15} aria-hidden="true" />}
        <span className={selected ? 'select-value' : 'select-value placeholder'}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <Menu
          id={menuId}
          menuRef={menuRef}
          pos={pos}
          label={label}
          activeId={active >= 0 ? `${autoId}-opt-${active}` : undefined}
        >
          {options.map((option, index) => (
            <MenuOption
              key={option.value}
              id={`${autoId}-opt-${index}`}
              selected={index === selectedIndex}
              active={index === active}
              disabled={option.disabled}
              hint={option.hint}
              onHover={() => !option.disabled && setActive(index)}
              onPick={() => pick(index)}
            >
              {option.label}
            </MenuOption>
          ))}
        </Menu>
      )}
    </>
  );
}

// Suggestion menu for a text input (replaces <datalist>). Spread inputProps onto the <input>.
// suggestions: strings already filtered for the current text. onPick(value) fires on a choice;
// Enter without a highlighted suggestion is left to the input's form.
export function useSuggestions({ inputRef, suggestions, onPick, label }) {
  const autoId = useId();
  const menuId = `${autoId}-menu`;
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const visible = open && suggestions.length > 0;
  const pos = useMenuPosition(inputRef, visible);

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);
  useOutsidePress(visible, [inputRef, menuRef], close);

  // A new list of suggestions starts with nothing highlighted.
  const key = suggestions.join('\n');
  useEffect(() => setActive(-1), [key]);

  useEffect(() => {
    if (!visible || active < 0) return;
    document.getElementById(`${autoId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [visible, active, autoId]);

  const pick = (index) => {
    const value = suggestions[index];
    close();
    if (value !== undefined) onPick(value);
  };

  const inputProps = {
    role: 'combobox',
    autoComplete: 'off',
    'aria-autocomplete': 'list',
    'aria-expanded': visible,
    'aria-controls': visible ? menuId : undefined,
    'aria-activedescendant': visible && active >= 0 ? `${autoId}-opt-${active}` : undefined,
    onFocus: () => setOpen(true),
    onInput: () => setOpen(true),
    onBlur: close,
    onKeyDown: (event) => {
      const k = event.key;
      if (typeof k !== 'string') return;
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        event.preventDefault();
        if (!visible) {
          setOpen(true);
          return;
        }
        const n = suggestions.length;
        setActive((current) =>
          k === 'ArrowDown' ? (current + 1) % n : current <= 0 ? n - 1 : current - 1,
        );
      } else if (k === 'Enter' && visible && active >= 0) {
        event.preventDefault();
        pick(active);
      } else if (k === 'Escape' && visible) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    },
  };

  const menu = visible ? (
    <Menu
      id={menuId}
      menuRef={menuRef}
      pos={pos}
      label={label}
      activeId={active >= 0 ? `${autoId}-opt-${active}` : undefined}
    >
      {suggestions.map((value, index) => (
        <MenuOption
          key={value}
          id={`${autoId}-opt-${index}`}
          selected={false}
          active={index === active}
          onHover={() => setActive(index)}
          onPick={() => pick(index)}
        >
          {value}
        </MenuOption>
      ))}
    </Menu>
  ) : null;

  return { inputProps, menu };
}
