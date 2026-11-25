import React, { useState, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Route, ArrowRight, Clock, Ruler, Map, ChevronDown, Navigation } from 'lucide-react';
import { storageUtils } from '../utils/storage';
import { fitCanvas, useResizeTick } from '../utils/useResizeTick';
import { findKShortestPaths, formatDistance, formatDuration } from '../utils/helpers';
import type { PathfindingProps, MapData, MapNode, MapEdge, ViewState, SavedMapInfo, PathResult, Graph, Coordinates } from '../utils/types';

// One colour per route option; matches the line colours drawn on the canvas.
// (The old card styles built class names like `bg-${color}-500/10` at runtime,
// which Tailwind never generates, so routes 2 and 3 had no selected look.)
const ROUTE_COLORS = ['#10b981', '#3b82f6', '#a855f7'];

const Pathfinding: React.FC<PathfindingProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // the one pointer that is dragging the map (a second finger used to make it jump)
  const panPointer = useRef<number | null>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  
  // Map selection
  const [savedMaps, setSavedMaps] = useState<SavedMapInfo[]>([]);
  const [selectedMapName, setSelectedMapName] = useState<string>('');
  const [mapData, setMapData] = useState<MapData | null>(null);
  const resizeTick = useResizeTick(canvasRef, !!mapData);
  const [showMapDropdown, setShowMapDropdown] = useState<boolean>(false);
  
  // Search state
  const [fromQuery, setFromQuery] = useState<string>('');
  const [toQuery, setToQuery] = useState<string>('');
  const [fromNode, setFromNode] = useState<MapNode | null>(null);
  const [toNode, setToNode] = useState<MapNode | null>(null);
  const [showFromDropdown, setShowFromDropdown] = useState<boolean>(false);
  const [showToDropdown, setShowToDropdown] = useState<boolean>(false);
  
  // Pathfinding results
  const [paths, setPaths] = useState<PathResult[]>([]);
  const [selectedPath, setSelectedPath] = useState<number>(0);
  const [searchError, setSearchError] = useState<string>('');

  const [view, setView] = useState<ViewState>({
    scale: 5,
    panX: 0,
    panY: 0,
    isPanning: false,
    lastX: 0,
    lastY: 0
  });

  // Load saved maps on mount
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
      setShowMapDropdown(false);
      
      // Reset search state
      setFromQuery('');
      setToQuery('');
      setFromNode(null);
      setToNode(null);
      setPaths([]);
      setSearchError('');
      
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
  const graph: Graph = mapData?.graph || {};

  // Filter nodes based on search query (matches name or aliases)
  const filterNodes = (query: string): MapNode[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return nodes.filter(n => 
      n.name.toLowerCase().includes(q) ||
      n.aliases?.some(a => a.toLowerCase().includes(q))
    ).slice(0, 8);
  };

  const fromSuggestions = filterNodes(fromQuery);
  const toSuggestions = filterNodes(toQuery);

  const selectFromNode = (node: MapNode): void => {
    setFromNode(node);
    setFromQuery(node.name);
    setShowFromDropdown(false);
    setSearchError('');
    // Focus next input
    setTimeout(() => toInputRef.current?.focus(), 100);
  };

  const selectToNode = (node: MapNode): void => {
    setToNode(node);
    setToQuery(node.name);
    setShowToDropdown(false);
    setSearchError('');
  };

  const swapLocations = (): void => {
    const tempNode = fromNode;
    const tempQuery = fromQuery;
    setFromNode(toNode);
    setFromQuery(toQuery);
    setToNode(tempNode);
    setToQuery(tempQuery);
    setPaths([]);
  };

  const findPaths = (): void => {
    if (!fromNode || !toNode) {
      setSearchError('Please select both start and end locations');
      return;
    }

    if (fromNode.id === toNode.id) {
      setSearchError('Start and end locations are the same');
      return;
    }

    setSearchError('');
    
    // Build the graph from the edges, the same ones drawn on the map. The saved
    // graph is only a copy of them, and in an imported file it can be stale
    // or missing nodes, so it's used only when a file has no edges at all.
    const pathGraph: Graph = {};
    nodes.forEach(n => pathGraph[n.id] = edges.length ? [] : [...(graph[n.id] ?? [])]);
    if (edges.length) {
      edges.forEach(e => {
        if (pathGraph[e.from]) {
          pathGraph[e.from].push({ node: e.to, weight: e.distance, vertical: e.isVertical });
        }
        if (pathGraph[e.to]) {
          pathGraph[e.to].push({ node: e.from, weight: e.distance, vertical: e.isVertical });
        }
      });
    }

    const nodesMap: { [id: string]: MapNode } = nodes.reduce((acc, n) => {
      acc[n.id] = n;
      return acc;
    }, {} as { [id: string]: MapNode });

    const results = findKShortestPaths(pathGraph, nodesMap, fromNode.id, toNode.id, 3);
    setPaths(results);
    setSelectedPath(0);

    if (results.length === 0) {
      setSearchError('No path found between these locations');
    } else {
      fitSoon(results[0]);
    }
  };

  // Fit once the route list has rendered: it takes room from the canvas, so a
  // fit measured before that was made for a taller map and pushed the route's
  // ends (and their labels) off the bottom on phones.
  const fitSoon = (path: PathResult): void => {
    requestAnimationFrame(() => fitPathToView(path));
  };

  const fitPathToView = (path: PathResult): void => {
    if (!path || !path.nodes || path.nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    path.nodes.forEach(n => {
      const coords: Coordinates = n.coordinates || { x: n.x, y: n.y, z: n.z };
      minX = Math.min(minX, coords.x);
      maxX = Math.max(maxX, coords.x);
      minY = Math.min(minY, coords.y);
      maxY = Math.max(maxY, coords.y);
    });

    const canvas = canvasRef.current;
    // on-screen size (the bitmap is larger by the pixel ratio)
    const W = canvas?.clientWidth || 800;
    const H = canvas?.clientHeight || 600;
    // proportional on small canvases, or a phone-sized map squashes the route to a dot
    const padding = Math.min(120, W * 0.2, H * 0.2);

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const scale = Math.min(
      (W - padding * 2) / rangeX,
      (H - padding * 2) / rangeY,
      15
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setView({
      scale,
      panX: -centerX * scale,
      panY: centerY * scale,
      isPanning: false,
      lastX: 0,
      lastY: 0
    });
  };

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { W, H } = fitCanvas(canvas, ctx);
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

    if (!mapData) return;

    // Draw all edges (faded)
    edges.forEach(edge => {
      const points = edge.pathPoints || edge.points || [];
      if (points.length < 2) return;

      ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(cx + points[0].x * scale, cy - points[0].y * scale);
      points.forEach(p => {
        ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
      });
      ctx.stroke();
    });

    // Draw selected path
    if (paths.length > 0 && paths[selectedPath]) {
      const path = paths[selectedPath];
      
      // Draw path edges with glow
      for (let i = 0; i < path.path.length - 1; i++) {
        const fromId = path.path[i];
        const toId = path.path[i + 1];
        
        // the shortest of any corridors between the two, as the route used it
        const edge = edges
          .filter(e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId))
          .sort((a, b) => a.distance - b.distance)[0];

        if (edge) {
          const points = edge.pathPoints || edge.points || [];
          if (points.length >= 2) {
            const color = ROUTE_COLORS[selectedPath] || ROUTE_COLORS[0];
            
            // Glow effect
            ctx.strokeStyle = color + '30';
            ctx.lineWidth = 12;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(cx + points[0].x * scale, cy - points[0].y * scale);
            points.forEach(p => {
              ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
            });
            ctx.stroke();

            // Main line
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(cx + points[0].x * scale, cy - points[0].y * scale);
            points.forEach(p => {
              ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
            });
            ctx.stroke();
          }
        }
      }

      // Draw path nodes
      path.nodes?.forEach((node, idx) => {
        const coords: Coordinates = node.coordinates || { x: node.x, y: node.y, z: node.z };
        const px = cx + coords.x * scale;
        const py = cy - coords.y * scale;

        const isStart = idx === 0;
        const isEnd = idx === (path.nodes?.length || 0) - 1;

        // Outer glow
        ctx.beginPath();
        ctx.arc(px, py, 20, 0, Math.PI * 2);
        ctx.fillStyle = isStart ? 'rgba(16, 185, 129, 0.25)' : 
                        isEnd ? 'rgba(239, 68, 68, 0.25)' : 
                        'rgba(59, 130, 246, 0.2)';
        ctx.fill();

        // Node circle
        ctx.beginPath();
        ctx.arc(px, py, isStart || isEnd ? 12 : 8, 0, Math.PI * 2);
        ctx.fillStyle = isStart ? '#10b981' : 
                        isEnd ? '#ef4444' : 
                        '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label background
        const text = node.name.slice(0, 15);
        ctx.font = '500 12px "DotGothic16", system-ui, sans-serif';
        const metrics = ctx.measureText(text);
        const labelY = py + 24;
        
        ctx.beginPath();
        ctx.roundRect(px - metrics.width / 2 - 8, labelY - 10, metrics.width + 16, 20, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fill();
        
        // Label text
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(text, px, labelY + 4);

        // Step number for intermediate nodes
        if (!isStart && !isEnd) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px "DotGothic16", system-ui, sans-serif';
          ctx.fillText(idx.toString(), px, py + 4);
        }
      });
    } else {
      // Draw all nodes (faded) when no path
      nodes.forEach(node => {
        const coords: Coordinates = node.coordinates || { x: node.x, y: node.y, z: node.z };
        const px = cx + coords.x * scale;
        const py = cy - coords.y * scale;

        if (px < -30 || px > W + 30 || py < -30 || py > H + 30) return;

        const isSelected = node.id === fromNode?.id || node.id === toNode?.id;
        const isVert = node.type === 'stairs' || node.type === 'lift';

        ctx.beginPath();
        ctx.arc(px, py, isSelected ? 10 : 5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? (node.id === fromNode?.id ? '#10b981' : '#ef4444') :
                        isVert ? 'rgba(251, 191, 36, 0.4)' : 
                        'rgba(16, 185, 129, 0.3)';
        ctx.fill();
        
        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }
  }, [resizeTick, view, mapData, paths, selectedPath, fromNode, toNode, nodes, edges]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (!target.closest('.from-dropdown-container')) {
        setShowFromDropdown(false);
      }
      if (!target.closest('.to-dropdown-container')) {
        setShowToDropdown(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Pointer events so dragging pans on touch screens too (canvas is touch-action: none).
  // Only the first finger pans (with two, the map leapt between them).
  const handleMouseDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (panPointer.current !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    panPointer.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setView(v => ({ ...v, isPanning: true, lastX: e.clientX, lastY: e.clientY }));
  };

  const handleMouseMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!view.isPanning || e.pointerId !== panPointer.current) return;
    setView(v => ({
      ...v,
      panX: v.panX + e.clientX - v.lastX,
      panY: v.panY + e.clientY - v.lastY,
      lastX: e.clientX,
      lastY: e.clientY
    }));
  };

  const handleMouseUp = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (e.pointerId !== panPointer.current) return;
    panPointer.current = null;
    setView(v => ({ ...v, isPanning: false }));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with Map Selector */}
      <div className="mp-head flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <h2 className="px-title text-2xl">Pathfinding</h2>
          <p className="mp-sub mt-0.5 text-sm">Find routes between locations</p>
        </div>

        {/* Map Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMapDropdown(!showMapDropdown)}
            className="px-btn px-btn--small"
            aria-haspopup="true"
            aria-expanded={showMapDropdown}
          >
            <Map size={16} aria-hidden="true" />
            <span className="max-w-[10rem] truncate normal-case">
              {selectedMapName || 'Select a map'}
            </span>
            <ChevronDown size={16} aria-hidden="true" className={showMapDropdown ? 'rotate-180' : ''} />
          </button>

          {showMapDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMapDropdown(false)} />
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

      {!mapData ? (
        // Empty state
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-[3px] border-[var(--px-faint)] bg-black">
              <Navigation size={28} className="text-[var(--px-dim)]" aria-hidden="true" />
            </div>
            <h3 className="px-title mb-2 text-xl">No Map Selected</h3>
            <p className="mp-sub max-w-xs text-sm">
              Select a saved map from the menu above to start pathfinding
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Search Section */}
          <div className="mp-head space-y-3 px-4 py-4 sm:px-6">
            <div className="flex gap-2 sm:gap-3">
              {/* From Input */}
              <div className="flex-1 min-w-0 relative from-dropdown-container">
                <label htmlFor="mp-from" className="px-label mb-1.5 block">From</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 bg-emerald-500" aria-hidden="true" />
                  <input
                    id="mp-from"
                    ref={fromInputRef}
                    type="text"
                    value={fromQuery}
                    onChange={(e) => {
                      setFromQuery(e.target.value);
                      setShowFromDropdown(true);
                      setFromNode(null);
                      setPaths([]);
                    }}
                    onFocus={() => setShowFromDropdown(true)}
                    onKeyDown={(e) => {
                      // Enter picks the top suggestion, Escape closes the list
                      if (e.key === 'Enter' && fromSuggestions[0]) selectFromNode(fromSuggestions[0]);
                      if (e.key === 'Escape') setShowFromDropdown(false);
                    }}
                    placeholder="Start location…"
                    autoComplete="off"
                    className="px-input mp-input-dot w-full"
                  />
                </div>

                {showFromDropdown && fromSuggestions.length > 0 && (
                  <div className="mp-menu absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden">
                    {fromSuggestions.map(node => (
                      <button
                        type="button"
                        key={node.id}
                        onClick={() => selectFromNode(node)}
                        className="mp-menu-item mp-menu-item--stack"
                      >
                        <span className="block truncate text-sm">{node.name}</span>
                        <span className="mp-sub mt-0.5 block text-[11px] capitalize">
                          {node.type} • {node.floor === -1 ? 'B1' : `L${node.floor}`}
                          {node.aliases?.length > 0 && <span className="normal-case text-[var(--px-green)]"> • {node.aliases[0]}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Swap Button */}
              <button
                type="button"
                onClick={swapLocations}
                className="px-btn px-btn--icon mb-0.5 self-end"
                title="Swap start and destination"
                aria-label="Swap start and destination"
              >
                <ArrowRight size={16} className="rotate-90" aria-hidden="true" />
              </button>

              {/* To Input */}
              <div className="flex-1 min-w-0 relative to-dropdown-container">
                <label htmlFor="mp-to" className="px-label mb-1.5 block">To</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 bg-red-500" aria-hidden="true" />
                  <input
                    id="mp-to"
                    ref={toInputRef}
                    type="text"
                    value={toQuery}
                    onChange={(e) => {
                      setToQuery(e.target.value);
                      setShowToDropdown(true);
                      setToNode(null);
                      setPaths([]);
                    }}
                    onFocus={() => setShowToDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && toSuggestions[0]) selectToNode(toSuggestions[0]);
                      if (e.key === 'Escape') setShowToDropdown(false);
                    }}
                    placeholder="Destination…"
                    autoComplete="off"
                    className="px-input mp-input-dot w-full"
                  />
                </div>

                {showToDropdown && toSuggestions.length > 0 && (
                  <div className="mp-menu absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden">
                    {toSuggestions.map(node => (
                      <button
                        type="button"
                        key={node.id}
                        onClick={() => selectToNode(node)}
                        className="mp-menu-item mp-menu-item--stack"
                      >
                        <span className="block truncate text-sm">{node.name}</span>
                        <span className="mp-sub mt-0.5 block text-[11px] capitalize">
                          {node.type} • {node.floor === -1 ? 'B1' : `L${node.floor}`}
                          {node.aliases?.length > 0 && <span className="normal-case text-[var(--px-green)]"> • {node.aliases[0]}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Error Message */}
            {searchError && (
              <div className="mp-alert" role="alert">
                {searchError}
              </div>
            )}

            {/* Find Routes Button */}
            <button
              type="button"
              onClick={findPaths}
              disabled={!fromNode || !toNode}
              className="px-btn w-full"
            >
              <Route size={16} aria-hidden="true" />
              Find Routes
            </button>
          </div>

          {/* Canvas */}
          <div className="relative min-h-[14rem] flex-1">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Map of ${selectedMapName}${paths.length ? ` with route ${selectedPath + 1} highlighted` : ''}. Drag to pan.`}
              className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={handleMouseDown}
              onPointerMove={handleMouseMove}
              onPointerUp={handleMouseUp}
              onPointerCancel={handleMouseUp}
              onLostPointerCapture={handleMouseUp}
            />

            {/* Selected locations indicator */}
            {(fromNode || toNode) && paths.length === 0 && (
              <div className="mp-panel absolute left-3 top-3 space-y-2 p-3">
                {fromNode && (
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 bg-emerald-500" aria-hidden="true" />
                    <span className="text-xs">From: {fromNode.name}</span>
                  </div>
                )}
                {toNode && (
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 bg-red-500" aria-hidden="true" />
                    <span className="text-xs">To: {toNode.name}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Routes Panel */}
          {paths.length > 0 && (
            <div className="mp-strip">
              <div className="max-h-72 space-y-3 overflow-y-auto p-3 sm:p-4">
                {paths.map((path, idx) => {
                  const isSelected = selectedPath === idx;
                  const color = ROUTE_COLORS[idx] || ROUTE_COLORS[0];

                  return (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => {
                        setSelectedPath(idx);
                        fitSoon(path);
                      }}
                      aria-pressed={isSelected}
                      className="block w-full border-[3px] bg-black p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--px-accent)] sm:p-4"
                      style={{
                        borderColor: isSelected ? color : 'var(--px-faint)',
                        boxShadow: isSelected ? `4px 4px 0 0 ${color}` : undefined,
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5" style={{ background: color }} aria-hidden="true" />
                          <span className="text-sm font-semibold">
                            Route {idx + 1}
                            {idx === 0 && <span className="ml-2 text-xs font-normal text-[var(--px-green)]">(Shortest)</span>}
                          </span>
                        </div>
                        {idx !== 0 && (
                          <span className="mp-sub border-2 border-[var(--px-faint)] px-2 py-0.5 text-[11px]">
                            +{formatDistance(path.distance - paths[0].distance)}
                          </span>
                        )}
                      </div>

                      <div className="mp-sub flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Ruler size={12} aria-hidden="true" />
                          <span>{formatDistance(path.distance)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} aria-hidden="true" />
                          <span>{formatDuration(path.distance)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ArrowRight size={12} aria-hidden="true" />
                          <span>{path.path.length} stops</span>
                        </div>
                      </div>

                      {isSelected && path.nodes && (
                        <div className="mt-3 border-t-2 border-[#1c1833] pt-3">
                          <div className="space-y-2">
                            {path.nodes.map((node, nodeIdx) => (
                              <div key={node.id} className="flex items-center gap-3">
                                <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center text-[11px] font-bold ${
                                  nodeIdx === 0 ? 'bg-emerald-500/20 text-[var(--px-green)]' :
                                  nodeIdx === path.nodes!.length - 1 ? 'bg-red-500/20 text-[var(--px-red)]' :
                                  'bg-white/[0.08] text-[var(--px-dim)]'
                                }`}>
                                  {nodeIdx === 0 ? 'A' : nodeIdx === path.nodes!.length - 1 ? 'B' : nodeIdx}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="truncate text-xs font-medium">{node.name}</p>
                                  <p className="mp-sub text-[11px]">
                                    {node.type} • {node.floor === -1 ? 'B1' : `L${node.floor}`}
                                  </p>
                                </div>
                                {nodeIdx < path.nodes!.length - 1 && (
                                  <ArrowRight size={12} className="flex-shrink-0 text-[var(--px-faint)]" aria-hidden="true" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Pathfinding;