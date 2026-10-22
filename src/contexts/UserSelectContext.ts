import { createContext } from 'react';
export const UserSelectContext = createContext<(username: string) => void>(() => {});

export const NavigationContext = createContext({ home: () => {}, bridge: () => {} });
