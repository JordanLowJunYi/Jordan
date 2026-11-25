import React, { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Upload, FolderOpen, HardDrive, FileJson, X, AlertCircle } from 'lucide-react';
import { normalizeMap, storageUtils } from '../utils/storage';
import type { StorageProps, MapData, SavedMapInfo, MapNode, ExportedMapData } from '../utils/types';

const Storage: React.FC<StorageProps> = ({ onLoadMap }) => {
  const [maps, setMaps] = useState<SavedMapInfo[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [importError, setImportError] = useState<string>('');
  const [importSuccess, setImportSuccess] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMaps();
  }, []);

  // Escape cancels the delete confirmation.
  useEffect(() => {
    if (!showDeleteConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDeleteConfirm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDeleteConfirm]);

  const loadMaps = (): void => {
    setMaps(storageUtils.getMapsList());
  };

  const deleteMap = (mapName: string): void => {
    storageUtils.deleteMap(mapName);
    loadMaps();
    setShowDeleteConfirm(null);
  };

  const exportMap = (mapName: string): void => {
    const map = storageUtils.loadMap(mapName);
    if (!map) return;

    const nodesArray: MapNode[] = Array.isArray(map.nodes) ? map.nodes : Object.values(map.nodes || {});

    const data: ExportedMapData = {
      metadata: {
        building: map.name || mapName,
        exportedAt: new Date().toISOString(),
        origin: map.metadata?.origin || undefined,
        floorHeight: 4,
        stats: {
          nodes: nodesArray.length,
          edges: map.edges?.length || 0,
          verticalEdges: map.edges?.filter(e => e.isVertical).length || 0,
          totalDistance: Math.round(map.metadata?.stats?.totalDistance || 0)
        }
      },
      nodes: {},
      edges: [],
      graph: {}
    };

    nodesArray.forEach(n => {
      data.nodes[n.id] = {
        name: n.name,
        type: n.type,
        aliases: n.aliases,
        floor: n.floor,
        coordinates: { x: n.x, y: n.y, z: n.z },
        gps: { lat: n.lat, lng: n.lng },
        connections: []
      };
      data.graph[n.id] = [];
    });

    (map.edges || []).forEach(e => {
      data.edges.push({
        id: e.id,
        from: e.from,
        to: e.to,
        distance: e.distance,
        isVertical: e.isVertical,
        floor: e.isVertical ? null : e.floor,
        fromFloor: e.fromFloor,
        toFloor: e.toFloor,
        pathPoints: e.points,
        points: e.points
      });

      if (data.nodes[e.from]) {
        data.nodes[e.from].connections.push({
          to: e.to,
          distance: e.distance,
          isVertical: e.isVertical
        });
        data.graph[e.from].push({
          node: e.to,
          weight: e.distance,
          vertical: e.isVertical
        });
      }
      if (data.nodes[e.to]) {
        data.nodes[e.to].connections.push({
          to: e.from,
          distance: e.distance,
          isVertical: e.isVertical
        });
        data.graph[e.to].push({
          node: e.from,
          weight: e.distance,
          vertical: e.isVertical
        });
      }
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mapName}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    // Revoking straight away can cancel the download in Safari and Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleLoadMap = (mapName: string): void => {
    const map = storageUtils.loadMap(mapName);
    if (map && onLoadMap) {
      onLoadMap(map);
    }
  };

  const processImportedFile = (file: File): void => {
    setImportError('');
    setImportSuccess('');

    if (!file.name.toLowerCase().endsWith('.json')) {
      setImportError('Please upload a JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const result = e.target?.result;
        if (typeof result !== 'string') {
          setImportError('Failed to read file');
          return;
        }
        
        let parsed: unknown;
        try {
          parsed = JSON.parse(result);
        } catch (err) {
          setImportError(`Failed to parse JSON: ${err instanceof Error ? err.message : 'Unknown error'}`);
          return;
        }
        const data = parsed as Partial<ExportedMapData & MapData> | null;
        // Cleaned-up copy: odd nodes/edges are fixed or dropped so they can't crash the other tabs.
        const clean = normalizeMap(parsed);

        // Validate the imported data
        if (!data || !clean || (!data.nodes && !data.edges && !data.metadata)) {
          setImportError('Invalid map format: missing nodes, edges, or metadata');
          return;
        }

        // Extract map name
        const building = typeof data.metadata?.building === 'string' ? data.metadata.building.trim() : '';
        const mapName = building ||
                      file.name.replace(/\.json$/i, '').replace(/-\d{4}-\d{2}-\d{2}$/, '') || 'Imported map';
        
        // Check if name already exists and append number if needed
        const existingMaps = storageUtils.getMapsList();
        let finalName = mapName;
        let counter = 1;
        while (existingMaps.some(m => m.name === finalName)) {
          finalName = `${mapName} (${counter})`;
          counter++;
        }

        // Nodes as an array (exported files key them by id) and edges with
        // `points` (exported files call them pathPoints): normalizeMap did both.
        const nodesArray = clean.nodes as MapNode[];
        const edgesArray = clean.edges;

        // Build the map data structure
        const mapData: MapData = {
          name: finalName,
          nodes: nodesArray,
          edges: edgesArray,
          graph: clean.graph || {},
          metadata: {
            ...clean.metadata,
            importedAt: new Date().toISOString(),
            originalFile: file.name
          },
          savedAt: new Date().toISOString()
        };

        // Save to storage (it fails when the browser's storage is full)
        if (!storageUtils.saveMap(finalName, mapData)) {
          setImportError('Could not save the map: browser storage is full or blocked');
          return;
        }
        loadMaps();

        setImportSuccess(`Successfully imported "${finalName}" with ${nodesArray.length} nodes and ${edgesArray.length} edges`);
        
        // Clear success message after 5 seconds
        setTimeout(() => setImportSuccess(''), 5000);
        
      } catch (err) {
        console.error('Import error:', err);
        setImportError(`Failed to import the map: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };

    reader.onerror = () => {
      setImportError('Failed to read file');
    };

    reader.readAsText(file);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      processImportedFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mp-head px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="px-title text-2xl">Storage</h2>
            <p className="mp-sub mt-0.5 text-sm">Manage your saved maps</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Stats */}
            <div className="mp-sub flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <HardDrive size={14} aria-hidden="true" />
                <span><span className="font-semibold text-[var(--px-ink)]">{maps.length}</span> map{maps.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="border-2 border-[var(--px-faint)] px-2 py-0.5">
                <span className="font-mono">{storageUtils.getStorageSize()}</span> KB
              </div>
            </div>

            {/* Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-btn px-btn--small"
            >
              <Upload size={16} aria-hidden="true" />
              Import JSON
            </button>
          </div>
        </div>

        {/* Import Messages */}
        {importError && (
          <div className="mp-alert mt-3 flex items-center gap-2" role="alert">
            <AlertCircle size={14} className="flex-shrink-0" aria-hidden="true" />
            <p className="text-xs">{importError}</p>
            <button type="button" onClick={() => setImportError('')} className="mp-icon-btn ml-auto" aria-label="Dismiss error">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {importSuccess && (
          <div className="mp-ok mt-3 flex items-center gap-2" role="status">
            <FileJson size={14} className="flex-shrink-0" aria-hidden="true" />
            <p className="text-xs">{importSuccess}</p>
            <button type="button" onClick={() => setImportSuccess('')} className="mp-icon-btn ml-auto" aria-label="Dismiss message">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Maps List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {maps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center border-[3px] border-[var(--px-faint)] bg-black">
              <FolderOpen size={28} className="text-[var(--px-dim)]" aria-hidden="true" />
            </div>
            <h3 className="px-title mb-2 text-xl">No Saved Maps</h3>
            <p className="mp-sub mb-5 max-w-xs text-sm">
              Create maps in the Mapper tab or import JSON files
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-btn px-btn--small"
            >
              <Upload size={16} aria-hidden="true" />
              Import your first map
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {maps.map(map => {
              const mapData = storageUtils.loadMap(map.name);
              const nodesArray: MapNode[] = Array.isArray(mapData?.nodes) ? mapData.nodes as MapNode[] : Object.values(mapData?.nodes || {});
              const nodeCount = nodesArray.length;
              const edgeCount = mapData?.edges?.length || 0;
              const vertCount = mapData?.edges?.filter(e => e.isVertical).length || 0;

              return (
                <div key={map.name} className="px-box px-box--soft p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="truncate text-base font-semibold">{map.name}</h3>
                      <p className="mp-sub mt-1 text-xs">
                        {new Date(map.savedAt).toLocaleDateString()} at{' '}
                        {new Date(map.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <FileJson size={18} className="text-[var(--px-green)]" aria-hidden="true" />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                      { value: nodeCount, label: 'Nodes', color: 'var(--px-cyan)' },
                      { value: edgeCount, label: 'Edges', color: 'var(--px-green)' },
                      { value: vertCount, label: 'Vertical', color: 'var(--px-amber)' },
                    ].map(({ value, label, color }) => (
                      <div key={label} className="mp-stat">
                        <div className="mp-stat__value text-lg" style={{ color }}>{value}</div>
                        <div className="mp-stat__label">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => handleLoadMap(map.name)}
                      className="px-btn px-btn--small mp-ctrl"
                      aria-label={`Load ${map.name} in the Mapper`}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => exportMap(map.name)}
                      className="px-btn px-btn--small mp-ctrl px-accent-cyan"
                      aria-label={`Export ${map.name} as JSON`}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(map.name)}
                      className="px-btn px-btn--small mp-ctrl px-accent-red"
                      aria-label={`Delete ${map.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteConfirm(null);
          }}
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="mp-del-title" aria-describedby="mp-del-desc" className="px-box w-full max-w-sm p-6" style={{ borderColor: 'var(--px-red)' }}>
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle size={22} className="text-[var(--px-red)]" aria-hidden="true" />
              <h2 id="mp-del-title" className="px-title text-xl">Delete Map?</h2>
            </div>
            <p id="mp-del-desc" className="mp-sub mb-6 text-sm">
              Are you sure you want to delete "<span className="font-medium text-[var(--px-ink)]">{showDeleteConfirm}</span>"?
              This action cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setShowDeleteConfirm(null)}
                className="px-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMap(showDeleteConfirm)}
                className="px-btn px-accent-red"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="mp-strip px-4 py-4 sm:px-6">
        <ul className="mp-sub space-y-1.5 text-xs">
          <li>▸ <b className="text-[var(--px-ink)]">Load</b> opens maps in the Mapper for editing</li>
          <li>▸ <b className="text-[var(--px-ink)]">Export</b> downloads maps as JSON files</li>
          <li>▸ Maps are stored in this browser's localStorage</li>
        </ul>
      </div>
    </div>
  );
};

export default Storage;