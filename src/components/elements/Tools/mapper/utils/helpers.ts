import type { Coordinates, Origin, Graph, MapNode, DijkstraResult, PathResult } from './types';

// Distance calculations
export const dist2d = (a: Coordinates, b: Coordinates): number => {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
};

export const dist3d = (a: Coordinates, b: Coordinates): number => {
  return Math.sqrt(
    (b.x - a.x) ** 2 + 
    (b.y - a.y) ** 2 + 
    ((b.z || 0) - (a.z || 0)) ** 2
  );
};

// Convert GPS to local coordinates
export const toLocal = (
  lat: number, 
  lng: number, 
  alt: number | null, 
  origin: Origin | null
): Coordinates => {
  if (!origin) return { x: 0, y: 0, z: 0 };
  const dLat = lat - origin.lat;
  const dLng = lng - origin.lng;
  const y = dLat * 111320;
  const x = dLng * 111320 * Math.cos(origin.lat * Math.PI / 180);
  const z = (alt || 0) - (origin.alt || 0);
  return { x, y, z };
};

// Dijkstra's algorithm for pathfinding
export const dijkstra = (graph: Graph, startId: string, endId: string): DijkstraResult => {
  const distances: { [key: string]: number } = {};
  const previous: { [key: string]: string | null } = {};
  const unvisited = new Set<string>();

  // Initialize
  Object.keys(graph).forEach(nodeId => {
    distances[nodeId] = Infinity;
    previous[nodeId] = null;
    unvisited.add(nodeId);
  });
  distances[startId] = 0;

  while (unvisited.size > 0) {
    // Find node with minimum distance
    let currentNode: string | null = null;
    let minDistance = Infinity;
    unvisited.forEach(nodeId => {
      if (distances[nodeId] < minDistance) {
        minDistance = distances[nodeId];
        currentNode = nodeId;
      }
    });

    if (currentNode === null || currentNode === endId) break;

    unvisited.delete(currentNode);

    // Update distances to neighbors
    const neighbors = graph[currentNode] || [];
    neighbors.forEach(({ node, weight }) => {
      const altDistance = distances[currentNode!] + weight;
      if (altDistance < distances[node]) {
        distances[node] = altDistance;
        previous[node] = currentNode;
      }
    });
  }

  // Reconstruct path. `?? null`: an end node missing from the graph (an
  // imported file's stale graph) used to give `undefined` here and loop forever.
  const path: string[] = [];
  let current: string | null = endId;
  while (current !== null) {
    path.unshift(current);
    current = previous[current] ?? null;
  }

  return {
    path: path[0] === startId ? path : [],
    distance: distances[endId]
  };
};

// Find the K shortest loop-free paths with Yen's algorithm. (The old
// shortcut removed one edge at a time and only ever re-found the routes it
// already had, so on A-B-D / A-C-D / A-D it never offered the direct A-D.)
export const findKShortestPaths = (
  graph: Graph,
  nodes: { [id: string]: MapNode },
  startId: string,
  endId: string,
  k: number = 3
): PathResult[] => {
  const first = dijkstra(graph, startId, endId);
  if (first.path.length === 0) return [];

  const key = (path: string[]) => path.join('\u0000');
  // cheapest edge between two neighbours (Dijkstra used the cheapest of any parallel edges)
  const weight = (a: string, b: string) =>
    Math.min(...(graph[a] ?? []).filter(e => e.node === b).map(e => e.weight));

  const found: DijkstraResult[] = [first];
  const candidates: DijkstraResult[] = [];

  for (let i = 1; i < k; i++) {
    const prev = found[i - 1].path;
    for (let j = 0; j < prev.length - 1; j++) {
      const spurNode = prev[j];
      const root = prev.slice(0, j + 1);
      const rootKey = key(root);

      const g: Graph = {};
      Object.keys(graph).forEach(id => { g[id] = graph[id].slice(); });
      // leave out the next step of every found route that shares this root...
      for (const p of found) {
        if (p.path.length > j + 1 && key(p.path.slice(0, j + 1)) === rootKey) {
          const a = p.path[j];
          const b = p.path[j + 1];
          g[a] = (g[a] ?? []).filter(e => e.node !== b);
          g[b] = (g[b] ?? []).filter(e => e.node !== a);
        }
      }
      // ...and the root's own nodes, so the detour can't loop back through them
      root.slice(0, -1).forEach(id => { delete g[id]; });

      const spur = dijkstra(g, spurNode, endId);
      if (spur.path.length === 0) continue;
      let rootCost = 0;
      for (let m = 0; m < root.length - 1; m++) rootCost += weight(root[m], root[m + 1]);
      const path = [...root.slice(0, -1), ...spur.path];
      const pk = key(path);
      if (found.some(p => key(p.path) === pk) || candidates.some(p => key(p.path) === pk)) continue;
      candidates.push({ path, distance: rootCost + spur.distance });
    }
    if (candidates.length === 0) break;
    candidates.sort((a, b) => a.distance - b.distance);
    found.push(candidates.shift()!);
  }

  return found.map(p => ({ path: p.path, distance: p.distance, nodes: p.path.map(id => nodes[id]) }));
};

// Format distance for display
export const formatDistance = (meters: number): string => {
  if (meters < 1) return `${Math.round(meters * 100)} cm`;
  return `${meters.toFixed(1)} m`;
};

// Format duration estimate (assuming 1.4 m/s walking speed)
export const formatDuration = (meters: number): string => {
  const seconds = meters / 1.4;
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
};

// Generate unique ID
export const generateId = (prefix: string = 'N'): string => {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Storage helpers
export const STORAGE_KEY = 'cde-maps';

export const saveMaps = (maps: { [key: string]: unknown }): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(maps));
    return true;
  } catch (error) {
    console.error('Failed to save maps:', error);
    return false;
  }
};

export const loadMaps = (): { [key: string]: unknown } => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Failed to load maps:', error);
    return {};
  }
};

export const deleteMap = (mapName: string): void => {
  const maps = loadMaps();
  delete maps[mapName];
  saveMaps(maps);
};

export const getMapNames = (): string[] => {
  const maps = loadMaps();
  return Object.keys(maps).sort();
};