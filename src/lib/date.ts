export function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
