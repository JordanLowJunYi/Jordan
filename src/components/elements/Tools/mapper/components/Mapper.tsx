import React, { useState, useEffect, useRef, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { MapPin, Navigation, Save, Play, Square as StopIcon, ZoomIn, ZoomOut, Home, Target } from 'lucide-react';
import { useGPS } from '../utils/useGPS';
import { useResizeTick } from '../utils/useResizeTick';
import { dist2d, dist3d, generateId } from '../utils/helpers';
import type { MapperProps, MapNode, MapEdge, PathPoint, ViewState, NodeForm, ToastState, NodeType, Graph, Coordinates } from '../utils/types';

const NODE_PROXIMITY = 5;
const MIN_POINT_DIST = 1;
const FLOOR_HEIGHT = 4;
const Z_THRESHOLD = 2;
const FLOORS: number[] = [-1, 1, 2, 3, 4, 5, 6];

const Mapper: React.FC<MapperProps> = ({ onSave, loadedMap, active = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resizeTick = useResizeTick();
  const [currentFloor, setCurrentFloor] = useState<number>(1);
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [recording, setRecording] = useState<boolean>(false);
  const [recPoints, setRecPoints] = useState<PathPoint[]>([]);
  const [recConnectedNodes, setRecConnectedNodes] = useState<string[]>([]);
  const [lastPoint, setLastPoint] = useState<PathPoint | null>(null);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [lastFloorZ, setLastFloorZ] = useState<number>(0);
  const [showFloorHint, setShowFloorHint] = useState<boolean>(false);
  
  // View state
  const [view, setView] = useState<ViewState>({
    scale: 4,
    panX: 0,
    panY: 0,
    isPanning: false,
    lastX: 0,
    lastY: 0
  });

  // Modal state
  const [showModal, setShowModal] = useState<boolean>(false);
  const [nodeForm, setNodeForm] = useState<NodeForm>({
    name: '',
    type: 'room',
    aliases: ''
  });

  // Toast
  const [toast, setToast] = useState<ToastState>({ show: false, message: '' });

  const gps = useGPS();

  const showToast = (message: string): void => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 2500);
  };

  // Escape closes the Add Node dialog.
  useEffect(() => {
    if (!showModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal]);

  // Load map from props
  useEffect(() => {
    if (loadedMap) {
      const nodesArray = Array.isArray(loadedMap.nodes) 
        ? loadedMap.nodes 
        : Object.values(loadedMap.nodes || {});
      setNodes(nodesArray as MapNode[]);
      setEdges(loadedMap.edges || []);
      setTotalDistance(loadedMap.metadata?.stats?.totalDistance || 0);
    }
  }, [loadedMap]);

  // Floor change detection
  useEffect(() => {
    if (gps.position.z !== null) {
      const zDiff = gps.position.z - lastFloorZ;
      setShowFloorHint(Math.abs(zDiff) > Z_THRESHOLD);
    }
  }, [gps.position.z, lastFloorZ]);

  // Recording logic
  useEffect(() => {
    if (!recording || !gps.isActive) return;

    const pos = gps.position;
    if (lastPoint) {
      const d = dist3d(lastPoint, pos as Coordinates);
      if (d < MIN_POINT_DIST) return;
      setTotalDistance(prev => prev + d);
    }

    const newPoint: PathPoint = { x: pos.x, y: pos.y, z: pos.z };
    setRecPoints(prev => [...prev, newPoint]);
    setLastPoint(newPoint);

    // Check proximity to nodes
    nodes.forEach(node => {
      if (node.floor !== currentFloor) return;
      const d = dist2d(node, pos as Coordinates);
      if (d <= NODE_PROXIMITY && !recConnectedNodes.includes(node.id)) {
        setRecConnectedNodes(prev => [...prev, node.id]);
        showToast(`✓ "${node.name}"`);
      }
    });
  }, [gps.position, recording, gps.isActive, nodes, currentFloor, lastPoint, recConnectedNodes]);

  const toggleGPS = (): void => {
    if (gps.isActive) {
      gps.stopGPS();
      if (recording) stopRecording();
    } else {
      gps.startGPS();
    }
  };

  const toggleRecording = (): void => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = (): void => {
    setRecording(true);
    setRecPoints([]);
    setRecConnectedNodes([]);
    setLastPoint(null);
    showToast('🔴 Recording...');
  };

  const stopRecording = (): void => {
    setRecording(false);
    createEdges();
    showToast(`Saved: ${recPoints.length} pts, ${recConnectedNodes.length} nodes`);
    setRecPoints([]);
    setRecConnectedNodes([]);
  };

  const createEdges = (): void => {
    if (recConnectedNodes.length < 2 || recPoints.length < 2) return;

    const newEdges: MapEdge[] = [];
    for (let i = 0; i < recConnectedNodes.length - 1; i++) {
      const fromId = recConnectedNodes[i];
      const toId = recConnectedNodes[i + 1];

      // Check if edge exists
      if (edges.some(e => 
        (e.from === fromId && e.to === toId) ||
        (e.from === toId && e.to === fromId)
      )) continue;

      const fromNode = nodes.find(n => n.id === fromId);
      const toNode = nodes.find(n => n.id === toId);
      if (!fromNode || !toNode) continue;

      // Calculate path distance
      let pathDist = 0;
      for (let j = 1; j < recPoints.length; j++) {
        pathDist += dist3d(recPoints[j-1], recPoints[j]);
      }

      newEdges.push({
        id: generateId('E'),
        from: fromId,
        to: toId,
        floor: currentFloor,
        distance: Math.round(pathDist * 10) / 10,
        points: recPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
        isVertical: false
      });
    }

    setEdges(prev => [...prev, ...newEdges]);
  };

  const addNode = (): void => {
    if (!nodeForm.name.trim()) {
      showToast('Enter a name');
      return;
    }

    const node: MapNode = {
      id: generateId('N'),
      name: nodeForm.name.trim(),
      type: nodeForm.type,
      aliases: nodeForm.aliases.split(',').map(s => s.trim()).filter(Boolean),
      x: gps.position.x,
      y: gps.position.y,
      z: gps.position.z,
      floor: currentFloor,
      lat: gps.position.lat,
      lng: gps.position.lng
    };

    setNodes(prev => [...prev, node]);

    // Auto-connect vertical nodes
    if (node.type === 'stairs' || node.type === 'lift') {
      autoConnectVertical(node);
    }

    // Add to current recording
    if (recording && !recConnectedNodes.includes(node.id)) {
      setRecConnectedNodes(prev => [...prev, node.id]);
    }

    setShowModal(false);
    setNodeForm({ name: '', type: 'room', aliases: '' });
    showToast(`✓ "${node.name}" added`);
  };

  const autoConnectVertical = (newNode: MapNode): void => {
    const matches = nodes.filter(n => 
      n.id !== newNode.id &&
      n.name.toLowerCase() === newNode.name.toLowerCase() &&
      (n.type === 'stairs' || n.type === 'lift') &&
      n.floor !== newNode.floor
    );

    const newEdges: MapEdge[] = [];
    matches.forEach(match => {
      const exists = edges.some(e =>
        (e.from === newNode.id && e.to === match.id) ||
        (e.from === match.id && e.to === newNode.id)
      );
      if (exists) return;

      const floorDiff = Math.abs(newNode.floor - match.floor);
      const vertDist = floorDiff * FLOOR_HEIGHT;

      newEdges.push({
        id: generateId('EV'),
        from: match.id,
        to: newNode.id,
        floor: null,
        distance: vertDist,
        points: [
          { x: match.x, y: match.y, z: match.z },
          { x: newNode.x, y: newNode.y, z: newNode.z }
        ],
        isVertical: true,
        fromFloor: match.floor,
        toFloor: newNode.floor
      });

      showToast(`🔗 Vertical: "${newNode.name}" L${match.floor}↔L${newNode.floor}`);
    });

    setEdges(prev => [...prev, ...newEdges]);
  };

  const changeFloor = (floor: number): void => {
    setCurrentFloor(floor);
    setLastFloorZ(gps.position.z);
    setShowFloorHint(false);
  };

  // Rendering
  useEffect(() => {
    // Hidden behind another tab: nothing to size or draw. Redraws on return.
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2 + view.panX;
    const cy = H / 2 + view.panY;
    const scale = view.scale;

    // Background (arcade night sky)
    ctx.fillStyle = '#0b0a18';
    ctx.fillRect(0, 0, W, H);

    // Grid
    const gridSize = Math.max(25, 50 / scale * 4);
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.14)';
    ctx.lineWidth = 1;

    for (let x = (cx % gridSize); x < W; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = (cy % gridSize); y < H; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Origin
    ctx.strokeStyle = '#6b6490';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Edges
    edges.filter(e => e.floor === currentFloor || e.isVertical).forEach(edge => {
      if (edge.points.length < 2) return;
      
      ctx.strokeStyle = edge.isVertical ? '#f59e0b' : '#8b5cf6';
      ctx.lineWidth = edge.isVertical ? 2 : 3;
      ctx.setLineDash(edge.isVertical ? [4, 4] : []);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + edge.points[0].x * scale, cy - edge.points[0].y * scale);
      edge.points.forEach(p => {
        ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Recording path
    if (recording && recPoints.length > 1) {
      ctx.strokeStyle = '#f85149';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(cx + recPoints[0].x * scale, cy - recPoints[0].y * scale);
      recPoints.forEach(p => {
        ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Nodes
    nodes.filter(n => n.floor === currentFloor).forEach(node => {
      const px = cx + node.x * scale;
      const py = cy - node.y * scale;
      
      if (px < -20 || px > W + 20 || py < -20 || py > H + 20) return;
      
      const isVert = node.type === 'stairs' || node.type === 'lift';
      const isConnected = recConnectedNodes.includes(node.id);

      ctx.fillStyle = isConnected ? '#fbbf24' : (isVert ? '#f59e0b' : '#3fb950');
      ctx.beginPath();
      ctx.arc(px, py, isConnected ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (scale >= 2) {
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.min(12, 8 + scale)}px "DotGothic16", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(node.name.slice(0, 12), px, py + 16 + scale);
      }
    });

    // Current position
    const px = cx + gps.position.x * scale;
    const py = cy - gps.position.y * scale;

    ctx.fillStyle = '#58a6ff';
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Proximity circle
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, NODE_PROXIMITY * scale, 0, Math.PI * 2);
    ctx.stroke();
  }, [active, resizeTick, view, gps.position, nodes, edges, currentFloor, recording, recPoints, recConnectedNodes]);

  const zoomIn = (): void => setView(v => ({ ...v, scale: Math.min(20, v.scale * 1.5) }));
  const zoomOut = (): void => setView(v => ({ ...v, scale: Math.max(1, v.scale / 1.5) }));
  const resetView = (): void => setView(v => ({ ...v, scale: 4, panX: 0, panY: 0 }));
  const centerOnMe = (): void => setView(v => ({ 
    ...v, 
    panX: -gps.position.x * v.scale, 
    panY: gps.position.y * v.scale 
  }));

  const handleSaveMap = (): void => {
    const mapName = prompt('Enter map name:');
    if (!mapName) return;

    const mapData = {
      metadata: {
        building: mapName,
        createdAt: new Date().toISOString(),
        origin: gps.origin,
        stats: {
          nodes: nodes.length,
          edges: edges.length,
          verticalEdges: edges.filter(e => e.isVertical).length,
          totalDistance: Math.round(totalDistance)
        }
      },
      nodes: nodes,
      edges,
      graph: buildGraph()
    };

    const ok = onSave(mapName, mapData);
    showToast(ok === false ? 'Could not save: browser storage is full or blocked' : `✓ Map "${mapName}" saved!`);
  };

  const buildGraph = (): Graph => {
    const graph: Graph = {};
    nodes.forEach(n => graph[n.id] = []);
    
    edges.forEach(e => {
      graph[e.from]?.push({ node: e.to, weight: e.distance, vertical: e.isVertical });
      graph[e.to]?.push({ node: e.from, weight: e.distance, vertical: e.isVertical });
    });

    return graph;
  };

  const verticalEdges = edges.filter(e => e.isVertical);

  // Pointer events (not mouse-only) so dragging pans on touch screens too; the
  // canvas has touch-action: none so the drag doesn't scroll the page instead.
  const handleMouseDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setView(v => ({ ...v, isPanning: true, lastX: e.clientX, lastY: e.clientY }));
  };

  const handleMouseMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!view.isPanning) return;
    setView(v => ({
      ...v,
      panX: v.panX + e.clientX - v.lastX,
      panY: v.panY + e.clientY - v.lastY,
      lastX: e.clientX,
      lastY: e.clientY
    }));
  };

  const handleMouseUp = (): void => {
    setView(v => ({ ...v, isPanning: false }));
  };

  const handleMouseLeave = (): void => {
    setView(v => ({ ...v, isPanning: false }));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Recording Banner */}
      {recording && (
        <div className="mp-banner" role="status">
          ⏺ Recording path. Walk near nodes to connect them!
        </div>
      )}

      {/* Map */}
      <div className="relative min-h-[11rem] flex-1">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Map of nodes and paths on this floor. Drag to pan."
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={handleMouseDown}
          onPointerMove={handleMouseMove}
          onPointerUp={handleMouseUp}
          onPointerCancel={handleMouseLeave}
        />

        {/* Map Controls */}
        <div className="absolute right-3 top-3 flex flex-col gap-3">
          {[
            { icon: ZoomIn, action: zoomIn, label: 'Zoom in' },
            { icon: ZoomOut, action: zoomOut, label: 'Zoom out' },
            { icon: Home, action: resetView, label: 'Reset view' },
            { icon: Target, action: centerOnMe, label: 'Centre on my position' },
          ].map(({ icon: Icon, action, label }) => (
            <button key={label} type="button" onClick={action} className="px-btn px-btn--icon" aria-label={label} title={label}>
              <Icon size={18} aria-hidden="true" />
            </button>
          ))}
        </div>

        {/* GPS Info */}
        <div className="mp-panel absolute left-3 top-3 space-y-1 p-3 font-mono text-xs">
          <div><span className="mp-sub">X:</span> <span className="text-[var(--px-cyan)]">{gps.position.x.toFixed(1)}m</span></div>
          <div><span className="mp-sub">Y:</span> <span className="text-[var(--px-cyan)]">{gps.position.y.toFixed(1)}m</span></div>
          <div><span className="mp-sub">Z:</span> <span className="text-[var(--px-amber)]">{gps.position.z.toFixed(1)}m</span></div>
          <div><span className="mp-sub">Floor:</span> <span className="text-[var(--px-cyan)]">{currentFloor === -1 ? 'B1' : currentFloor}</span></div>
        </div>
      </div>

      {/* Floor Tabs (scroll sideways on narrow screens instead of spilling off) */}
      <div className="mp-strip flex gap-2 overflow-x-auto px-3 py-3 sm:px-4" role="group" aria-label="Floor">
        {FLOORS.map(f => {
          const count = nodes.filter(n => n.floor === f).length;
          const label = f === -1 ? 'B1' : `L${f}`;
          return (
            <button
              key={f}
              type="button"
              onClick={() => changeFloor(f)}
              className="mp-chip"
              aria-pressed={currentFloor === f}
              aria-label={`Floor ${label}, ${count} node${count === 1 ? '' : 's'}`}
            >
              {label}
              <span className="mp-chip__count" aria-hidden="true">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Z Indicator */}
      {showFloorHint && (
        <div className="mx-3 my-3 border-[3px] border-[var(--px-amber)] bg-black p-3 text-sm text-[var(--px-amber)] sm:mx-4" role="status">
          ⬆ Altitude changed! Consider updating the floor.
        </div>
      )}

      {/* Stats */}
      <div className="mp-strip grid grid-cols-4 gap-2 px-3 py-3 sm:gap-3 sm:px-4">
        {[
          { value: nodes.length, label: 'Nodes', color: 'var(--px-cyan)' },
          { value: edges.length, label: 'Edges', color: 'var(--px-green)' },
          { value: verticalEdges.length, label: 'Vertical', color: 'var(--px-amber)' },
          { value: Math.round(totalDistance), label: 'Metres', color: 'var(--px-purple)' },
        ].map(({ value, label, color }) => (
          <div key={label} className="mp-stat">
            <div className="mp-stat__value" style={{ color }}>{value}</div>
            <div className="mp-stat__label">{label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="mp-strip p-3 sm:p-4">
        {gps.error && (
          <div role="alert" className="mp-alert mb-3">
            {gps.error}. Check that location access is allowed for this site.
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={toggleGPS}
            className={`px-btn mp-ctrl ${gps.isActive ? 'px-accent-red' : 'px-accent-green'}`}
          >
            <Navigation size={16} aria-hidden="true" />
            {gps.isActive ? 'Stop GPS' : 'Start GPS'}
          </button>
          <button
            type="button"
            onClick={toggleRecording}
            disabled={!gps.isActive}
            className={`px-btn mp-ctrl ${recording ? 'px-accent-red' : 'px-accent-purple'}`}
          >
            {recording ? <StopIcon size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {recording ? 'Stop' : 'Record'}
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            disabled={!gps.isActive}
            className="px-btn mp-ctrl px-accent-cyan"
          >
            <MapPin size={16} aria-hidden="true" />
            Add Node
          </button>
        </div>
        <button type="button" onClick={handleSaveMap} className="px-btn mp-ctrl px-accent-amber mt-3 w-full">
          <Save size={16} aria-hidden="true" />
          Save Map
        </button>
      </div>

      {/* Node Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="mp-node-title" className="px-box w-full max-w-md p-5 sm:p-6">
            <h2 id="mp-node-title" className="px-title mb-4 text-2xl">Add Node</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addNode();
              }}
            >
            <div className="space-y-4">
              <div>
                <label htmlFor="mp-node-name" className="px-label mb-2 block">Name / Room Code</label>
                <input
                  id="mp-node-name"
                  type="text"
                  value={nodeForm.name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNodeForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. E1A-03-01, Staircase A"
                  className="px-input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="mp-node-type" className="px-label mb-2 block">Type</label>
                <select
                  id="mp-node-type"
                  value={nodeForm.type}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setNodeForm(f => ({ ...f, type: e.target.value as NodeType }))}
                  className="px-input w-full"
                >
                  <option value="room">Room</option>
                  <option value="junction">Junction</option>
                  <option value="stairs">🔺 Stairs</option>
                  <option value="lift">🔺 Lift</option>
                  <option value="entrance">Entrance</option>
                  <option value="toilet">Toilet</option>
                  <option value="other">Other</option>
                </select>
                {(nodeForm.type === 'stairs' || nodeForm.type === 'lift') && (
                  <p className="text-xs text-[var(--px-amber)] mt-2">
                    ⚡ <strong>Tip:</strong> Use the same name on different floors to auto-connect vertically!
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="mp-node-aliases" className="px-label mb-2 block">Aliases (comma separated)</label>
                <input
                  id="mp-node-aliases"
                  type="text"
                  value={nodeForm.aliases}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNodeForm(f => ({ ...f, aliases: e.target.value }))}
                  placeholder="e.g. LT1, Main Stairs"
                  className="px-input w-full"
                />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-btn">
                Cancel
              </button>
              <button type="submit" className="px-btn px-accent-green">
                Save
              </button>
            </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div role="status" className="px-box px-box--accent animate-fade-in fixed bottom-24 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 px-5 py-2 text-sm">
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Mapper;