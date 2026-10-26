import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { LandingPage } from '@/features/home/LandingPage'
import { LoginPage } from '@/features/auth/LoginForm'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
import { PanelLayout } from '@/features/panel/PanelLayout'
import { DashboardPage } from '@/features/panel/DashboardPage'
import { ComingSoonPage } from '@/features/panel/ComingSoonPage'
import { ServicesPage } from '@/features/panel/services/ServicesPage'
import { TeamPage } from '@/features/panel/team/TeamPage'
import { SchedulePage } from '@/features/panel/schedule/SchedulePage'
import { CalendarPage } from '@/features/panel/calendar/CalendarPage'
import { CustomersPage } from '@/features/panel/customers/CustomersPage'
import { SettingsPage } from '@/features/panel/settings/SettingsPage'
import { NotFoundPage } from '@/features/home/NotFoundPage'

// La página pública va en su propio chunk: carga rápido y no arrastra el panel
const BookingPage = lazy(() => import('@/features/booking/BookingPage'))
const ManageBookingPage = lazy(() => import('@/features/booking/ManageBookingPage'))

function PageFallback() {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-4 px-5 py-8">
      <div className="h-14 animate-pulse rounded-2xl bg-muted" />
      <div className="h-6 w-1/2 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/panel" element={<PanelLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="servicios" element={<ServicesPage />} />
          <Route path="equipo" element={<TeamPage />} />
          <Route path="horarios" element={<SchedulePage />} />
          <Route path="ajustes" element={<SettingsPage />} />
        </Route>
        <Route path="/r/:slug" element={<BookingPage />} />
        <Route path="/reserva/:token" element={<ManageBookingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
