import { useCallback, useEffect, useRef } from 'react';

/** Prevents a response from updating a page after a newer request or route unmount. */
export function useRequestGuard(): {
  begin: () => number;
  isCurrent: (requestId: number) => boolean;
} {
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const begin = useCallback((): number => {
    generation.current += 1;
    return generation.current;
  }, []);
  const isCurrent = useCallback(
    (requestId: number): boolean => requestId === generation.current,
    [],
  );

  return { begin, isCurrent };
}
