/**
 * AquaBloom Application Entry Point
 * 
 * Houses client-side router, authentication provider, layout wrapper,
 * and role-aware navigation.
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Navbar } from './components/layout/Navbar.js';
import { Footer } from './components/layout/Footer.js';
import { ProtectedRoute } from './components/auth/ProtectedRoute.js';

// Public Pages
import { HomePage } from './components/pages/HomePage.js';
import { EcosystemPage } from './components/pages/EcosystemPage.js';
import { SolutionsPage } from './components/pages/SolutionsPage.js';
import { PlansPage } from './components/pages/PlansPage.js';
import { AboutPage } from './components/pages/AboutPage.js';
import { ContactPage } from './components/pages/ContactPage.js';
import { GetStartedPage } from './components/pages/GetStartedPage.js';
import { LoginPage } from './components/pages/LoginPage.js';
import { PublicVenueDirectory } from './components/marketplace/PublicVenueDirectory.js';

// Structural Role Portals
import { AdvertiserPortal } from './components/portal/AdvertiserPortal.js';
import { VenuePortal } from './components/portal/VenuePortal.js';
import { SupplierPortal } from './components/portal/SupplierPortal.js';
import { LogisticsPortal } from './components/portal/LogisticsPortal.js';
import { AdminPortal } from './components/portal/AdminPortal.js';

function AppContent() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname || '/';
    }
    return '/';
  });

  const { user, isAuthenticated } = useAuth();

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setCurrentPath(path);
  };

  // Render current route view
  const renderRoute = () => {
    // Check for dynamic order review routes: /orders/:id or /portal/advertiser/orders/:id
    const orderMatch = currentPath.match(/^\/(?:portal\/advertiser\/)?orders\/([a-zA-Z0-9_-]+)/i);
    if (orderMatch) {
      const orderId = orderMatch[1];
      return (
        <ProtectedRoute requiredRole="ADVERTISER" navigate={navigate}>
          <AdvertiserPortal initialOrderId={orderId} />
        </ProtectedRoute>
      );
    }

    // Query parameters support
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const queryOrderId = searchParams?.get('orderId') || undefined;

    // Normalization
    const path = currentPath.toLowerCase().replace(/\/$/, '') || '/';

    switch (path) {
      case '/':
        return <HomePage navigate={navigate} />;

      case '/ecosystem':
        return <EcosystemPage navigate={navigate} />;

      case '/solutions':
        return <SolutionsPage navigate={navigate} />;

      case '/plans':
        return <PlansPage navigate={navigate} />;

      case '/about':
        return <AboutPage navigate={navigate} />;

      case '/contact':
        return <ContactPage navigate={navigate} />;

      case '/get-started':
        return <GetStartedPage navigate={navigate} />;

      case '/login':
        return <LoginPage navigate={navigate} />;

      case '/venues':
        return <PublicVenueDirectory navigate={navigate} />;

      // Protected Role-Aware Application Areas
      case '/portal/advertiser':
        return (
          <ProtectedRoute requiredRole="ADVERTISER" navigate={navigate}>
            <AdvertiserPortal initialOrderId={queryOrderId} />
          </ProtectedRoute>
        );

      case '/portal/venue':
        return (
          <ProtectedRoute requiredRole="VENUE" navigate={navigate}>
            <VenuePortal />
          </ProtectedRoute>
        );

      case '/portal/supplier':
        return (
          <ProtectedRoute requiredRole="SUPPLIER" navigate={navigate}>
            <SupplierPortal initialTab="DASHBOARD" />
          </ProtectedRoute>
        );

      case '/supplier/offers':
        return (
          <ProtectedRoute requiredRole="SUPPLIER" navigate={navigate}>
            <SupplierPortal initialTab="OFFERS" />
          </ProtectedRoute>
        );

      case '/supplier/assignments':
        return (
          <ProtectedRoute requiredRole="SUPPLIER" navigate={navigate}>
            <SupplierPortal initialTab="ASSIGNMENTS" />
          </ProtectedRoute>
        );

      case '/supplier/catalog':
        return (
          <ProtectedRoute requiredRole="SUPPLIER" navigate={navigate}>
            <SupplierPortal initialTab="CATALOG" />
          </ProtectedRoute>
        );

      case '/portal/logistics':
        return (
          <ProtectedRoute requiredRole="LOGISTICS_PARTNER" navigate={navigate}>
            <LogisticsPortal />
          </ProtectedRoute>
        );

      case '/portal/admin':
        return (
          <ProtectedRoute requiredRole="ADMIN" navigate={navigate}>
            <AdminPortal />
          </ProtectedRoute>
        );

      case '/portal':
        // General portal redirect based on role
        if (isAuthenticated && user) {
          switch (user.role) {
            case 'ADVERTISER':
              return (
                <ProtectedRoute requiredRole="ADVERTISER" navigate={navigate}>
                  <AdvertiserPortal />
                </ProtectedRoute>
              );
            case 'VENUE':
              return (
                <ProtectedRoute requiredRole="VENUE" navigate={navigate}>
                  <VenuePortal />
                </ProtectedRoute>
              );
            case 'SUPPLIER':
              return (
                <ProtectedRoute requiredRole="SUPPLIER" navigate={navigate}>
                  <SupplierPortal />
                </ProtectedRoute>
              );
            case 'LOGISTICS_PARTNER':
              return (
                <ProtectedRoute requiredRole="LOGISTICS_PARTNER" navigate={navigate}>
                  <LogisticsPortal />
                </ProtectedRoute>
              );
            case 'ADMIN':
              return (
                <ProtectedRoute requiredRole="ADMIN" navigate={navigate}>
                  <AdminPortal />
                </ProtectedRoute>
              );
          }
        }
        return <LoginPage navigate={navigate} />;

      default:
        // 404 Not Found structural fallback
        return (
          <div className="bg-[#08080a] py-24 px-4 text-center text-white">
            <h2 className="font-display text-4xl font-bold text-[#c5a059]">404</h2>
            <p className="mt-2 text-sm text-[#8e8e9e]">The requested page could not be located.</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold uppercase tracking-wider text-black"
            >
              Return to Home
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#08080a] text-[#f2f2f7]">
      <Navbar currentPath={currentPath} navigate={navigate} />
      <main className="flex-1">{renderRoute()}</main>
      <Footer navigate={navigate} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
