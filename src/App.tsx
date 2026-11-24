import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Doux from './components/Doux';

// Each game is its own chunk, loaded only when someone opens it, so the
// portfolio page itself stays light.
const Tools = lazy(() => import('./components/elements/Tools/Tools'));
const Pedantle = lazy(() => import('./components/elements/Tools/pedantle/Pedantle'));
const Map = lazy(() => import('./components/elements/Tools/mapper/Map'));
const Room = lazy(() => import('./components/elements/Tools/room/Room'));
const Game2048 = lazy(() => import('./components/elements/Tools/twentyfortyeight/Game2048'));
const WordSearch = lazy(() => import('./components/elements/Tools/wordsearch/WordSearch'));
const Piano = lazy(() => import('./components/elements/Tools/piano/Piano'));
const Latte = lazy(() => import('./components/elements/Tools/latte/Latte'));
const Visualiser = lazy(() => import('./components/elements/Tools/visualiser/Visualiser'));

// Shown for the split second a game chunk is loading.
function Loading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[#07060f] text-[#f5efe2]"
      style={{ fontFamily: '"Pixelify Sans", monospace' }}
    >
      LOADING…
    </div>
  );
}

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Doux />} />

          <Route path="/Tools" element={<Tools />} />
          <Route path="/Tools/Room" element={<Room />} />
          <Route path="/Tools/2048" element={<Game2048 />} />
          <Route path="/Tools/WordSearch" element={<WordSearch />} />
          <Route path="/Tools/Piano" element={<Piano />} />
          <Route path="/Tools/Latte" element={<Latte />} />
          <Route path="/Tools/Visualiser" element={<Visualiser />} />
          <Route path="/Tools/Pedantle" element={<Pedantle />} />
          <Route path="/Tools/Map" element={<Map />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;