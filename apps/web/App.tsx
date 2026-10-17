import { MotionConfig } from 'framer-motion';
import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import ReminderAlerts from './components/ui/ReminderAlerts';
import StorageBanner from './components/ui/StorageBanner';
import { ToastProvider } from './components/ui/Toast';
import { useScrollToTop } from './lib/navigation';
import { useGlobalShortcuts } from './lib/shortcuts';
import { useSystemThemeSync } from './lib/theme';
import Home from './routes/Home';
import { BoardPage, NotePage } from './routes/lazyPages';
import NotFoundPage from './routes/NotFoundPage';
import PageLoading from './routes/PageLoading';

const App = () => {
  useGlobalShortcuts();
  useSystemThemeSync();
  useScrollToTop();
  return (
    <MotionConfig reducedMotion='user'>
      <ToastProvider>
        <StorageBanner />
        {/* Before the page: it sits at the top, so it comes first in tab order. */}
        <ReminderAlerts />
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path='/' element={<Home />} />
            <Route path='/note' element={<NotePage />} />
            <Route path='/board' element={<BoardPage />} />
            <Route path='*' element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </MotionConfig>
  );
};

export default App;
