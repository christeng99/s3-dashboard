'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { InspectPanel } from '@/components/inspect/inspect-panel';
import { InspectV2Panel } from '@/components/inspect/inspect-v2-panel';
import { S3Explorer } from '@/components/s3/s3-explorer';
import { SnowpolyInspectPlaceholder } from '@/components/snowpoly/snowpoly-inspect-placeholder';
import { SnowpolyInspectV1Panel } from '@/components/snowpoly/snowpoly-inspect-v1-panel';
import { SnowpolyInspectV3Panel } from '@/components/snowpoly/snowpoly-inspect-v3-panel';
import { SnowpolyPricePanel } from '@/components/snowpoly/snowpoly-price-panel';
import { Card } from '@/components/ui/card';

const SNOWPOLY_MENU_STORAGE_KEY = 'theye-snowpoly-menu-visible';
const SNOWPOLY_MENU_PASSWORD = 'SnowPoly1999';

const STEALTH_VIEWS = new Set([
  'inspect-v2',
  'snowpoly-inspect-v1',
  'snowpoly-inspect-v2',
  'snowpoly-inspect-v3',
  'snowpoly-prices',
]);

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('explorer');
  const [snowpolyMenuVisible, setSnowpolyMenuVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SNOWPOLY_MENU_STORAGE_KEY) === '1') {
        setSnowpolyMenuVisible(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.code !== 'KeyX') return;
      e.preventDefault();
      const entered = window.prompt('Password:');
      if (entered === SNOWPOLY_MENU_PASSWORD) {
        try {
          localStorage.setItem(SNOWPOLY_MENU_STORAGE_KEY, '1');
        } catch {
          /* ignore */
        }
        setSnowpolyMenuVisible(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!snowpolyMenuVisible && STEALTH_VIEWS.has(activeView)) {
      setActiveView('explorer');
    }
  }, [snowpolyMenuVisible, activeView]);

  const renderView = () => {
    switch (activeView) {
      case 'explorer':
        return <S3Explorer />;
      case 'inspect':
        return <InspectPanel />;
      case 'inspect-v2':
        return <InspectV2Panel />;
      case 'snowpoly-inspect-v1':
        return <SnowpolyInspectV1Panel />;
      case 'snowpoly-inspect-v2':
        return <SnowpolyInspectPlaceholder title="SnowPoly Inspect - V2" />;
      case 'snowpoly-inspect-v3':
        return <SnowpolyInspectV3Panel />;
      case 'snowpoly-prices':
        return <SnowpolyPricePanel />;
      case 'settings':
        return (
          <Card className="p-6">
            <h2 className="text-2xl font-bold mb-4">Settings</h2>
            <p className="text-muted-foreground">Settings page coming soon...</p>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeView={activeView}
          onViewChange={setActiveView}
          showSnowpolyMenu={snowpolyMenuVisible}
        />
        <main className="flex-1 p-6 md:p-8">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
