// A reminder notification was clicked: bring Noteboard forward and open the
// note (or Upcoming). An open window navigates itself, keeping its state;
// otherwise a new window opens.
export const openFromNotification = async (clients, origin, url) => {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.find((client) => new URL(client.url).origin === origin);
  if (open) {
    // Ask first: some browsers refuse focus() without a user gesture.
    open.postMessage({ type: 'open-reminder', url });
    await open.focus().catch(() => {});
    return;
  }
  await clients.openWindow(new URL(url, origin).href);
};
