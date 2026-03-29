export function usePageLoading(...states: boolean[]) {
  return states.some(Boolean);
}
