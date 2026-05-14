import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { setNavigateImpl } from '../helpers/navigation.js';

/**
 * Captures React Router's `useNavigate` and current `useLocation` into the
 * module-level navigation helper, so `bundle.utils.navigate` (called from
 * Kinetic form scripts that live outside the React tree) can perform real
 * SPA navigations and auto-derive a `backPath` from the user's current page.
 *
 * The impl is registered once on mount; a ref holds the latest navigate/
 * location pair so each call reads current values without re-registering on
 * every route change (which would leave a brief null window between effects).
 *
 * Mount once inside the HashRouter.
 */
export const NavBridge = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef({ navigate, location });
  ref.current = { navigate, location };
  useEffect(() => {
    setNavigateImpl((to, { backTo, replace, state } = {}) => {
      const { navigate, location } = ref.current;
      const backPath =
        backTo === null || backTo === false
          ? undefined
          : (backTo ?? location.pathname + location.search);
      navigate(to, {
        replace,
        state: { ...state, ...(backPath ? { backPath } : {}) },
      });
    });
    return () => setNavigateImpl(null);
  }, []);
  return null;
};
