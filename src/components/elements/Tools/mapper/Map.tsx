import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Mapper from './components/Mapper';
import Visualizer from './components/Visualizer';
import Pathfinding from './components/Pathfinding';
import Storage from './components/Storage';
import { storageUtils } from './utils/storage';
import type { MapData, Tab } from './utils/types';
import { sfx } from '../arcade';
import '../arcade/arcade.css';
import './mapper.css';

function Map() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('mapper');
  const [loadedMap, setLoadedMap] = useState<MapData | null>(null);

  // Same browser-tab title format GameShell gives every other game.
  useEffect(() => {
    const prev = document.title;
    document.title = "Mapper · Jordan's Arcade";
    return () => {
      document.title = prev;
    };
  }, []);

  const tabs: Tab[] = [
    { id: 'mapper', label: 'Mapper', icon: '◇' },
    { id: 'storage', label: 'Storage', icon: '□' },
    { id: 'visualizer', label: 'Visualizer', icon: '○' },
    { id: 'pathfinding', label: 'Pathfinding', icon: '△' },
  ];

  const handleLoadMap = (map: MapData): void => {
    setLoadedMap(map);
    setActiveTab('mapper');
  };

  return (
    // `arcade` brings the shared pixel font, colours and starfield; mapper.css
    // undoes the frame's 100vh min-height so the tool fits phone screens.
    <div className="arcade px-accent-green mapper-root flex h-dvh w-full overflow-hidden">
      {/* Sidebar: an icon rail on small screens, labelled on large ones */}
      <aside className="mp-sidebar relative z-30 flex h-full w-16 shrink-0 flex-col lg:w-60">
        <div className="px-2 pb-3 pt-4 lg:px-4">
          <button
            type="button"
            onClick={() => {
              sfx.back();
              navigate('/Tools');
            }}
            aria-label="Back to Games"
            title="Back to Games"
            className="px-btn px-btn--small mp-back w-full"
          >
            <span aria-hidden="true">◀</span>
            <span className="hidden lg:inline">Games</span>
          </button>
        </div>

        <p className="px-title hidden px-4 pb-3 pt-1 text-3xl lg:block">Mapper</p>

        <nav className="flex-1 px-2 py-2 lg:px-3" aria-label="Mapper sections">
          <ul className="space-y-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="mp-tab"
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={tab.label}
                    title={tab.label}
                  >
                    <span className="mp-tab__icon" aria-hidden="true">
                      {tab.icon}
                    </span>
                    <span className="hidden lg:inline">{tab.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
          {/* Tab content */}
          <div className="relative z-10 h-full">
            {/* The Mapper stays mounted while hidden: switching tabs used to
                unmount it, wiping unsaved nodes and stopping GPS mid-walk. */}
            <div className={activeTab === 'mapper' ? 'h-full' : 'hidden'}>
              <Mapper
                active={activeTab === 'mapper'}
                loadedMap={loadedMap}
                onSave={(mapName: string, mapData: MapData) => storageUtils.saveMap(mapName, mapData)}
              />
            </div>
            {activeTab === 'storage' && <Storage onLoadMap={handleLoadMap} />}
            {activeTab === 'visualizer' && (
              <Visualizer />
            )}
            {activeTab === 'pathfinding' && (
              <Pathfinding />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Map;