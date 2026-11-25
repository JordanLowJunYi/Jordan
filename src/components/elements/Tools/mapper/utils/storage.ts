import type { Graph, MapData, MapEdge, MapNode, NodeType, PathPoint, SavedMapInfo } from './types';

// Storage utilities for managing maps
const STORAGE_KEY_PREFIX = 'cde_map_';
const MAPS_LIST_KEY = 'cde_maps_list';

const NODE_TYPES: NodeType[] = ['room', 'junction', 'stairs', 'lift', 'entrance', 'toilet', 'other'];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function toPoints(v: unknown): PathPoint[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map(p => ({ x: num(p.x, 0), y: num(p.y, 0), z: num(p.z, 0) }));
}

/**
 * Turn whatever was saved or imported into a map the tabs can draw safely.
 * Accepts both the saved shape (nodes as an array) and the exported one
 * (nodes keyed by id, with coordinates/gps, edges with pathPoints). Nodes
 * without a usable id and edges that point at missing nodes are dropped, and
 * missing names, floors and coordinates get defaults, so one odd entry can't
 * crash the Mapper, Visualizer or Pathfinding (they all read node.name etc.).
 */
export function normalizeMap(raw: unknown): MapData | null {
  if (!isObj(raw)) return null;
  const rawNodes: [string, unknown][] = Array.isArray(raw.nodes)
    ? raw.nodes.map((n): [string, unknown] => [isObj(n) && n.id != null ? String(n.id) : '', n])
    : isObj(raw.nodes)
      ? Object.entries(raw.nodes)
      : [];
  const nodes: MapNode[] = [];
  const ids = new Set<string>();
  rawNodes.forEach(([id, n]) => {
    if (!id || !isObj(n) || ids.has(id)) return;
    ids.add(id);
    const at = isObj(n.coordinates) ? n.coordinates : n;
    const gps = isObj(n.gps) ? n.gps : n;
    nodes.push({
      id,
      name: typeof n.name === 'string' && n.name.trim() ? n.name : n.name != null ? String(n.name) : id,
      type: NODE_TYPES.includes(n.type as NodeType) ? (n.type as NodeType) : 'other',
      aliases: Array.isArray(n.aliases) ? n.aliases.filter((a): a is string => typeof a === 'string') : [],
      x: num(at.x, 0),
      y: num(at.y, 0),
      z: num(at.z, 0),
      floor: num(n.floor, 1),
      lat: numOrNull(gps.lat),
      lng: numOrNull(gps.lng),
    });
  });

  const floorOf = new Map(nodes.map(n => [n.id, n.floor]));
  const edges: MapEdge[] = [];
  (Array.isArray(raw.edges) ? raw.edges : []).forEach((e, i) => {
    if (!isObj(e)) return;
    const from = e.from != null ? String(e.from) : '';
    const to = e.to != null ? String(e.to) : '';
    if (!ids.has(from) || !ids.has(to) || from === to) return;
    const isVertical = e.isVertical === true;
    edges.push({
      id: e.id != null ? String(e.id) : `E${i}`,
      from,
      to,
      floor: isVertical ? null : num(e.floor, floorOf.get(from)!),
      distance: Math.max(0, num(e.distance, 0)),
      isVertical,
      ...(isVertical && { fromFloor: num(e.fromFloor, floorOf.get(from)!), toFloor: num(e.toFloor, floorOf.get(to)!) }),
      points: toPoints(e.pathPoints ?? e.points),
    });
  });

  // The saved graph is only a cache of the edges; keep entries that make sense.
  const graph: Graph = {};
  if (isObj(raw.graph)) {
    Object.entries(raw.graph).forEach(([id, list]) => {
      if (!ids.has(id) || !Array.isArray(list)) return;
      graph[id] = list
        .filter(isObj)
        .filter(g => ids.has(String(g.node)) && Number.isFinite(g.weight) && (g.weight as number) >= 0)
        .map(g => ({ node: String(g.node), weight: g.weight as number, vertical: g.vertical === true }));
    });
  }

  return {
    name: typeof raw.name === 'string' ? raw.name : undefined,
    metadata: isObj(raw.metadata) ? (raw.metadata as MapData['metadata']) : {},
    nodes,
    edges,
    graph,
    ...(isObj(raw.origin) && { origin: raw.origin as unknown as MapData['origin'] }),
    ...(typeof raw.savedAt === 'string' && { savedAt: raw.savedAt }),
  };
}

export const storageUtils = {
  // Get list of all saved maps
  getMapsList(): SavedMapInfo[] {
    try {
      const list: unknown = JSON.parse(localStorage.getItem(MAPS_LIST_KEY) ?? '[]');
      // a hand-edited or half-written list must not crash the Storage tab
      if (!Array.isArray(list)) return [];
      const seen = new Set<string>();
      return list.flatMap(m => {
        if (!isObj(m) || typeof m.name !== 'string' || !m.name || seen.has(m.name)) return [];
        seen.add(m.name);
        return [{ name: m.name, savedAt: typeof m.savedAt === 'string' ? m.savedAt : '' }];
      });
    } catch {
      // Unavailable or corrupt localStorage — treat as empty rather than crashing.
      return [];
    }
  },

  // Save map list
  saveMapsList(list: SavedMapInfo[]): void {
    try {
      localStorage.setItem(MAPS_LIST_KEY, JSON.stringify(list));
    } catch {
      /* quota exceeded or unavailable — ignore */
    }
  },

  // Save a map. Returns false if the write failed (e.g. quota exceeded).
  saveMap(mapName: string, mapData: MapData): boolean {
    const key = STORAGE_KEY_PREFIX + mapName;
    const data: MapData = {
      ...mapData,
      name: mapName,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      return false;
    }

    // Update maps list
    const list = this.getMapsList();
    const existingMap = list.find(m => m.name === mapName);
    if (!existingMap) {
      list.push({ name: mapName, savedAt: data.savedAt! });
      this.saveMapsList(list);
    } else {
      // Update timestamp
      existingMap.savedAt = data.savedAt!;
      this.saveMapsList(list);
    }
    return true;
  },

  // Load a map
  loadMap(mapName: string): MapData | null {
    const key = STORAGE_KEY_PREFIX + mapName;
    try {
      const data = localStorage.getItem(key);
      return data ? normalizeMap(JSON.parse(data)) : null;
    } catch {
      return null;
    }
  },

  // Delete a map
  deleteMap(mapName: string): void {
    const key = STORAGE_KEY_PREFIX + mapName;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }

    // Update maps list
    const list = this.getMapsList();
    const filtered = list.filter(m => m.name !== mapName);
    this.saveMapsList(filtered);
  },

  // Get storage size in KB
  getStorageSize(): string {
    let total = 0;
    try {
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          total += localStorage[key].length + key.length;
        }
      }
    } catch {
      return '0.0';
    }
    return (total / 1024).toFixed(1);
  }
};
