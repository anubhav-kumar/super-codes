/**
 * Top-bar sizing shared by the People and Companies lists. On a 393 px phone the bar holds the
 * People / Companies switch, the search button, "Add" and the account menu; the default chip and
 * button padding clipped "Companies" by about 8 px, so both are tightened below sm / md only.
 * (The arbitrary child selector outranks the chips' own px-4 without editing SegmentedControl.)
 */
export const CLIENTS_TABS_CLASS = 'max-sm:[&>button]:px-3';
export const ADD_BUTTON_CLASS = 'max-md:px-3';
