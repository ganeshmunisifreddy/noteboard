import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import type { SyntheticEvent } from 'react';

// React bubbles events from portals (menus, the date picker) to the card,
// column or tile behind them, so only a press on the element itself, outside
// a text field, may start a drag or open its menu.
export const ownPress = (event: SyntheticEvent) => {
  const target = event.target as Element;
  return event.currentTarget.contains(target) && !target.closest('input, textarea, select');
};

// dnd-kit's drag listeners, ignoring presses that aren't the element's own.
export const ownListeners = (listeners: DraggableSyntheticListeners) =>
  Object.fromEntries(
    Object.entries(listeners ?? {}).map(([name, handler]) => [
      name,
      (event: SyntheticEvent) => {
        if (ownPress(event)) handler(event);
      },
    ]),
  );
