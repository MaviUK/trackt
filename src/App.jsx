import { BrowserRouter, Routes, Route, Link } from "react-router-dom"
import Home from "./pages/Home"
import Search from "./pages/Search"
import Login from "./pages/Login"
import ShowDetails from "./pages/ShowDetails"

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/search">Search</Link>
          <Link to="/login">Login</Link>
        </nav>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/login" element={<Login />} />
          <Route path="/show/:id" element={<ShowDetails />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
