import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { Navbar } from './components/Navbar'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import Job from './pages/Job'
import Admin from './pages/Admin'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <>
                <Navbar />
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/job/:id" element={<Job />} />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute adminOnly>
                        <Admin />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Home />} />
                </Routes>
              </>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
