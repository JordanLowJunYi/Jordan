import React, { useState, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ZoomIn, ZoomOut, Home, Square, Download, ChevronDown, Map } from 'lucide-react';
import { storageUtils } from '../utils/storage';
import { useResizeTick } from '../utils/useResizeTick';
import type { VisualizerProps, MapData, MapNode, MapEdge, ViewState, SavedMapInfo, Coordinates } from '../utils/types';

const Visualizer: React.FC<VisualizerProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resizeTick = useResizeTick();
  // Where a press started, so the click that ends a drag doesn't select or deselect a node.
  const press = useRef({ x: 0, y: 0, moved: false });
  const [currentFloor, setCurrentFloor] = useState<number>(1);
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [savedMaps, setSavedMaps] = useState<SavedMapInfo[]>([]);
  const [selectedMapName, setSelectedMapName] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  
  const [view, setView] = useState<ViewState>({
    scale: 5,
    panX: 0,
    panY: 0,
    isPanning: false,
    lastX: 0,
    lastY: 0
  });

  // Load saved maps list on mount
  useEffect(() => {
    const maps = storageUtils.getMapsList();
    setSavedMaps(maps);
  }, []);

  // Load selected map
  const handleSelectMap = (mapName: string): void => {
    const data = storageUtils.loadMap(mapName);
    if (data) {
      setMapData(data);
      setSelectedMapName(mapName);
      setSelectedNode(null);
      setShowDropdown(false);
      
      // Reset view
      setView({
        scale: 5,
        panX: 0,
        panY: 0,
        isPanning: false,
        lastX: 0,
        lastY: 0
      });
    }
  };

  // Get nodes and edges from mapData
  // Memoised so the draw effect below only reruns when the map really changes.
  const nodes: MapNode[] = useMemo(
    () => (mapData ? (Array.isArray(mapData.nodes) ? mapData.nodes : Object.values(mapData.nodes || {})) : []),
    [mapData],
  );
  const edges: MapEdge[] = useMemo(() => mapData?.edges || [], [mapData]);

  // Get unique floors from nodes
  const availableFloors: number[] = useMemo(() => [...new Set(nodes.map(n => n.floor))].sort((a, b) => a - b), [nodes]);

  // Auto-set floor to one that has nodes
  useEffect(() => {
    if (availableFloors.length > 0 && !availableFloors.includes(currentFloor)) {
      setCurrentFloor(availableFloors[0]);
    }
  }, [mapData, availableFloors, currentFloor]);

  // Rendering
  useEffect(() => {
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
    const gridSize = Math.max(20, 100 / scale);
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

    // Origin crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    if (!mapData) return;

    // Edges for current floor
    edges.forEach(edge => {
      if (edge.floor !== currentFloor && !edge.isVertical) return;
      if (edge.isVertical && edge.fromFloor !== currentFloor && edge.toFloor !== currentFloor) return;

      const points = edge.pathPoints || edge.points || [];
      if (points.length < 2) return;

      // Edge glow
      ctx.strokeStyle = edge.isVertical ? 'rgba(251, 191, 36, 0.15)' : 'rgba(139, 92, 246, 0.15)';
      ctx.lineWidth = edge.isVertical ? 8 : 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + points[0].x * scale, cy - points[0].y * scale);
      points.forEach(p => {
        ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
      });
      ctx.stroke();

      // Edge line
      ctx.strokeStyle = edge.isVertical ? '#fbbf24' : '#8b5cf6';
      ctx.lineWidth = edge.isVertical ? 2 : 3;
      ctx.setLineDash(edge.isVertical ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(cx + points[0].x * scale, cy - points[0].y * scale);
      points.forEach(p => {
        ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Nodes for current floor
    nodes.filter(n => n.floor === currentFloor).forEach(node => {
      const coords: Coordinates = node.coordinates || { x: node.x, y: node.y, z: node.z };
      const px = cx + coords.x * scale;
      const py = cy - coords.y * scale;

      if (px < -30 || px > W + 30 || py < -30 || py > H + 30) return;

      const isVert = node.type === 'stairs' || node.type === 'lift';
      const isEntrance = node.type === 'entrance';
      const isSelected = selectedNode?.id === node.id;

      // Node glow
      const glowColor = isSelected ? 'rgba(251, 191, 36, 0.4)' : 
                        isVert ? 'rgba(251, 191, 36, 0.2)' : 
                        isEntrance ? 'rgba(59, 130, 246, 0.2)' : 
                        'rgba(16, 185, 129, 0.2)';
      
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 20 : 16, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.fill();

      // Node circle
      ctx.fillStyle = isSelected ? '#fbbf24' : 
                      isVert ? '#f59e0b' : 
                      isEntrance ? '#3b82f6' : 
                      '#10b981';
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 10 : 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      if (scale >= 2) {
        const text = node.name.slice(0, 15);
        ctx.font = `500 ${Math.min(13, 10 + scale)}px "Pixelify Sans", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        
        const metrics = ctx.measureText(text);
        const labelY = py + 20 + scale;
        
        // Label background
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        const padding = 6;
        ctx.beginPath();
        ctx.roundRect(px - metrics.width / 2 - padding, labelY - 10, metrics.width + padding * 2, 16, 4);
        ctx.fill();
        
        // Label text
        ctx.fillStyle = '#fff';
        ctx.fillText(text, px, labelY);
      }
    });

    // Scale bar
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px "Pixelify Sans", system-ui, sans-serif';
    const scaleMeters = Math.round(80 / scale);
    const scalePx = scaleMeters * scale;
    
    ctx.beginPath();
    ctx.roundRect(W - 110, H - 40, scalePx + 20, 24, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(W - 100, H - 26, scalePx, 3);
    ctx.textAlign = 'left';
    ctx.fillText(`${scaleMeters}m`, W - 100, H - 32);
  }, [resizeTick, view, mapData, currentFloor, selectedNode, nodes, edges]);

  const zoomIn = (): void => setView(v => ({ ...v, scale: Math.min(30, v.scale * 1.4) }));
  const zoomOut = (): void => setView(v => ({ ...v, scale: Math.max(0.5, v.scale / 1.4) }));
  const resetView = (): void => setView({ scale: 5, panX: 0, panY: 0, isPanning: false, lastX: 0, lastY: 0 });
  
  const fitToView = (): void => {
    const floorNodesFiltered = nodes.filter(n => n.floor === currentFloor);
    if (floorNodesFiltered.length === 0) {
      resetView();
      return;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    floorNodesFiltered.forEach(n => {
      const coords: Coordinates = n.coordinates || { x: n.x, y: n.y, z: n.z };
      minX = Math.min(minX, coords.x);
      maxX = Math.max(maxX, coords.x);
      minY = Math.min(minY, coords.y);
      maxY = Math.max(maxY, coords.y);
    });

    const canvas = canvasRef.current;
    const W = canvas?.width || 800;
    const H = canvas?.height || 600;
    // proportional on small canvases, or a phone-sized floor squashes into the middle
    const padding = Math.min(100, W * 0.18, H * 0.18);

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const newScale = Math.min(
      (W - padding * 2) / rangeX,
      (H - padding * 2) / rangeY,
      20
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setView({
      scale: newScale,
      panX: -centerX * newScale,
      panY: centerY * newScale,
      isPanning: false,
      lastX: 0,
      lastY: 0
    });
  };

  const handleCanvasClick = (e: ReactMouseEvent<HTMLCanvasElement>): void => {
    if (!mapData || press.current.moved) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const cx = canvas.width / 2 + view.panX;
    const cy = canvas.height / 2 + view.panY;

    let closestNode: MapNode | null = null;
    let closestDist = 25;

    nodes.filter(n => n.floor === currentFloor).forEach(node => {
      const coords: Coordinates = node.coordinates || { x: node.x, y: node.y, z: node.z };
      const px = cx + coords.x * view.scale;
      const py = cy - coords.y * view.scale;
      const dist = Math.sqrt((clickX - px) ** 2 + (clickY - py) ** 2);

      if (dist < closestDist) {
        closestDist = dist;
        closestNode = node;
      }
    });

    setSelectedNode(closestNode);
  };

  const exportImage = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `${mapData?.metadata?.building || mapData?.name || 'map'}-floor-${currentFloor}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const floorNodes = nodes.filter(n => n.floor === currentFloor);
  const verticalEdges = edges.filter(e => e.isVertical);

  // Pointer events so dragging pans on touch screens too (canvas is touch-action: none).
  const handleMouseDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = { x: e.clientX, y: e.clientY, moved: false };
    setView(v => ({ ...v, isPanning: true, lastX: e.clientX, lastY: e.clientY }));
  };

  const handleMouseMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!view.isPanning) return;
    if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 4) press.current.moved = true;
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
      {/* Header with Map Selector */}
      <div className="mp-head flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <h2 className="px-title text-2xl">Visualizer</h2>
          <p className="mp-sub mt-0.5 text-sm">View and explore your maps</p>
        </div>

        {/* Map Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="px-btn px-btn--small"
            aria-haspopup="true"
            aria-expanded={showDropdown}
          >
            <Map size={16} aria-hidden="true" />
            <span className="max-w-[10rem] truncate normal-case">
              {selectedMapName || 'Select a map'}
            </span>
            <ChevronDown size={16} aria-hidden="true" className={showDropdown ? 'rotate-180' : ''} />
          </button>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <div className="mp-menu absolute right-0 top-full z-50 mt-3 w-64 max-w-[calc(100vw-6rem)] overflow-hidden">
                <p className="px-label border-b-2 border-[#1c1833] px-4 py-2">Saved Maps</p>
                <div className="max-h-64 overflow-y-auto">
                  {savedMaps.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="mp-sub text-sm">No saved maps</p>
                      <p className="mp-sub mt-1 text-xs">Create one in the Mapper tab</p>
                    </div>
                  ) : (
                    savedMaps.map(map => (
                      <button
                        type="button"
                        key={map.name}
                        onClick={() => handleSelectMap(map.name)}
                        className="mp-menu-item"
                        aria-current={selectedMapName === map.name ? 'true' : undefined}
                      >
                        <span aria-hidden="true" className={selectedMapName === map.name ? 'text-[var(--px-accent)]' : 'text-[var(--px-faint)]'}>■</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{map.name}</span>
                          <span className="mp-sub block text-[11px]">
                            {new Date(map.savedAt).toLocaleDateString()}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      {!mapData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-[3px] border-[var(--px-faint)] bg-black">
              <Map size={28} className="text-[var(--px-dim)]" aria-hidden="true" />
            </div>
            <h3 className="px-title mb-2 text-xl">No Map Selected</h3>
            <p className="mp-sub max-w-xs text-sm">
              Select a saved map from the menu above to visualize it
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Canvas */}
          <div className="relative min-h-[16rem] flex-1">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Floor plan of ${selectedMapName}. Drag to pan, click a node for details.`}
              className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={handleMouseDown}
              onPointerMove={handleMouseMove}
              onPointerUp={handleMouseUp}
              onPointerCancel={handleMouseLeave}
              onClick={handleCanvasClick}
            />

            {/* Map Controls */}
            <div className="absolute right-3 top-3 flex flex-col items-end gap-3">
              {[
                { icon: ZoomIn, action: zoomIn, label: 'Zoom in' },
                { icon: ZoomOut, action: zoomOut, label: 'Zoom out' },
                { icon: Home, action: resetView, label: 'Reset view' },
                { icon: Square, action: fitToView, label: 'Fit floor to view' },
              ].map(({ icon: Icon, action, label }) => (
                <button key={label} type="button" onClick={action} title={label} aria-label={label} className="px-btn px-btn--icon">
                  <Icon size={16} aria-hidden="true" />
                </button>
              ))}
              <div className="mp-panel px-2 py-1 text-center font-mono text-[11px] text-[var(--px-dim)]" aria-label="Zoom level">
                {view.scale.toFixed(1)}x
              </div>
            </div>

            {/* Legend */}
            <div className="mp-panel absolute left-3 top-3 p-3 text-xs">
              <div className="px-label mb-2 border-b-2 border-[#1c1833] pb-1.5">Legend</div>
              <div className="space-y-2">
                {[
                  { color: 'bg-emerald-500', label: 'Room / Other' },
                  { color: 'bg-amber-500', label: 'Stairs / Lift' },
                  { color: 'bg-blue-500', label: 'Entrance' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <div className={`h-2.5 w-2.5 ${color}`} />
                    <span className="mp-sub">{label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2.5">
                  <div className="h-0.5 w-5 bg-purple-500" />
                  <span className="mp-sub">Path</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-0.5 w-5 opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f59e0b 0, #f59e0b 4px, transparent 4px, transparent 8px)' }} />
                  <span className="mp-sub">Vertical</span>
                </div>
              </div>
            </div>

            {/* Selected Node Info */}
            {selectedNode && (
              <div className="mp-panel absolute bottom-3 left-3 min-w-[200px] max-w-[calc(100%-1.5rem)] p-3" role="status">
                <div className="mb-2 flex items-center gap-2 border-b-2 border-[#1c1833] pb-2">
                  <div className={`h-2.5 w-2.5 ${
                    selectedNode.type === 'stairs' || selectedNode.type === 'lift' ? 'bg-amber-500' :
                    selectedNode.type === 'entrance' ? 'bg-blue-500' : 'bg-emerald-500'
                  }`} />
                  <h3 className="truncate text-sm font-semibold">{selectedNode.name}</h3>
                </div>
                <div className="space-y-1.5 text-xs">
                  {[
                    { label: 'Type', value: selectedNode.type, color: 'text-[var(--px-green)]' },
                    { label: 'Floor', value: selectedNode.floor === -1 ? 'B1' : `L${selectedNode.floor}`, color: 'text-[var(--px-cyan)]' },
                    {
                      label: 'Position',
                      value: `(${(selectedNode.coordinates?.x ?? selectedNode.x).toFixed(1)}, ${(selectedNode.coordinates?.y ?? selectedNode.y).toFixed(1)})`,
                      color: 'text-[var(--px-ink)]',
                      mono: true
                    },
                  ].map(({ label, value, color, mono }) => (
                    <div key={label} className="flex justify-between gap-4">
                      <span className="mp-sub">{label}</span>
                      <span className={`${color} ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Floor Selector */}
          <div className="mp-strip px-3 py-3 sm:px-4">
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Floor">
              {availableFloors.length > 0 ? availableFloors.map(f => {
                const count = nodes.filter(n => n.floor === f).length;
                const label = f === -1 ? 'B1' : `L${f}`;
                const isActive = currentFloor === f;

                return (
                  <button
                    type="button"
                    key={f}
                    onClick={() => setCurrentFloor(f)}
                    className="mp-chip"
                    aria-pressed={isActive}
                    aria-label={`Floor ${label}, ${count} node${count === 1 ? '' : 's'}`}
                  >
                    {label}
                    <span className="mp-chip__count" aria-hidden="true">({count})</span>
                  </button>
                );
              }) : (
                <p className="mp-sub py-2 text-sm">No floors available</p>
              )}
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mp-strip grid grid-cols-4 gap-2 px-3 py-3 sm:gap-3 sm:px-4">
            {[
              { value: nodes.length, label: 'Total Nodes', color: 'var(--px-cyan)' },
              { value: floorNodes.length, label: 'Floor Nodes', color: 'var(--px-green)' },
              { value: edges.length, label: 'Edges', color: 'var(--px-purple)' },
              { value: verticalEdges.length, label: 'Vertical', color: 'var(--px-amber)' },
            ].map(({ value, label, color }) => (
              <div key={label} className="mp-stat">
                <div className="mp-stat__value" style={{ color }}>{value}</div>
                <div className="mp-stat__label">{label}</div>
              </div>
            ))}
          </div>

          {/* Export Button */}
          <div className="mp-strip px-3 py-3 sm:px-4">
            <button type="button" onClick={exportImage} className="px-btn mp-ctrl px-accent-cyan w-full">
              <Download size={16} aria-hidden="true" />
              Export Floor Image
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Visualizer;