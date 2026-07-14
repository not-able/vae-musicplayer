export function findQueueInsertionIndex(
  pointerY: number,
  itemMidpoints: readonly number[]
): number {
  const nextItemIndex = itemMidpoints.findIndex((midpoint) => pointerY < midpoint);

  return nextItemIndex === -1 ? itemMidpoints.length : nextItemIndex;
}
