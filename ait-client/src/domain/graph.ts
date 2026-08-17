import type { AppState, Word } from "../types";

export function graphLayout(cards: Word[], relations: AppState["relations"]) {
  const positions = cards.map((card, index) => {
    const angle = (index / Math.max(cards.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = cards.length <= 3 ? 86 : 168;
    return {
      id: card.id,
      x: 360 + Math.cos(angle) * radius,
      y: 260 + Math.sin(angle) * radius * 0.72,
    };
  });
  const positionMap = new Map(positions.map((position) => [position.id, position]));
  const edges = relations.filter(
    (relation) => positionMap.has(relation.fromWordId) && positionMap.has(relation.toWordId),
  );
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const forces = positions.map(() => ({ x: 0, y: 0 }));
    positions.forEach((from, fromIndex) => {
      positions.forEach((to, toIndex) => {
        if (fromIndex === toIndex) return;
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        const distance = Math.max(30, Math.hypot(dx, dy));
        const force = 720 / (distance * distance);
        forces[fromIndex].x += (dx / distance) * force;
        forces[fromIndex].y += (dy / distance) * force;
      });
    });
    edges.forEach((edge) => {
      const fromIndex = positions.findIndex((position) => position.id === edge.fromWordId);
      const toIndex = positions.findIndex((position) => position.id === edge.toWordId);
      if (fromIndex < 0 || toIndex < 0) return;
      const from = positions[fromIndex];
      const to = positions[toIndex];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = Math.min(1.1, (distance - 150) / 900);
      forces[fromIndex].x += (dx / distance) * force;
      forces[fromIndex].y += (dy / distance) * force;
      forces[toIndex].x -= (dx / distance) * force;
      forces[toIndex].y -= (dy / distance) * force;
    });
    positions.forEach((position, index) => {
      position.x = Math.max(58, Math.min(662, position.x + forces[index].x * 11));
      position.y = Math.max(54, Math.min(466, position.y + forces[index].y * 11));
    });
  }
  return positionMap;
}

export function graphColorClass(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `graph-color-${Math.abs(hash) % 6}`;
}
