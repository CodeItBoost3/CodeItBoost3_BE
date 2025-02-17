export function calculateDday(createdAt) {
  const createdDate = new Date(createdAt);
  const today = new Date();
  const diffTime = today - createdDate;
  return `D+${Math.floor(diffTime / (1000 * 60 * 60 * 24))}`;
}