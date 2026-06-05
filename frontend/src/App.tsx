import { useLocation, Route, Routes } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { Navbar } from './components/Navbar'
import { BottomNav } from './components/BottomNav'
import { InstallBanner } from './components/InstallBanner'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoadingScreen } from './components/LoadingScreen'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Home from './pages/Home'
import Job from './pages/Job'
import Admin from './pages/Admin'
import NotFound from './pages/NotFound'

function RootPage() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Landing />
  return <Home />
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.16, ease: 'easeInOut' }}
        style={{ minHeight: '100%' }}
      >
        <Routes location={location}>
          <Route path="/" element={<RootPage />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/job/:id"
            element={
              <ProtectedRoute>
                <Job />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <InstallBanner />
      <Navbar />
      <AnimatedRoutes />
      <BottomNav />
    </AuthProvider>
  )
}
