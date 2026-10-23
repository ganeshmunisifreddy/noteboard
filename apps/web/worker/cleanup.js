// Deletes every cache not named in `keep`.
export const deleteCachesExcept = async (cacheStorage, keep) => {
  const names = await cacheStorage.keys();
  await Promise.all(names.filter((name) => !keep.includes(name)).map((name) => cacheStorage.delete(name)));
};
