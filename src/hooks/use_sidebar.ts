import { useCallback, useState } from "react";

export function useSidebar(defaultOpen = true) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggle = useCallback(() => {
    setIsOpen((currentState) => !currentState);
  }, []);

  return {
    isOpen,
    toggle,
  };
}
