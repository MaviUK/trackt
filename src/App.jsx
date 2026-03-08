import { BrowserRouter, Routes, Route, Link } from "react-router-dom"
import Home from "./pages/Home"
import Search from "./pages/Search"
import Login from "./pages/Login"
import ShowDetails from "./pages/ShowDetails"
import MyShows from "./pages/MyShows"
import MyShowDetails from "./pages/MyShowDetails"
import AiringNextPage from "./pages/airingnext";
import ReadyToWatchPage from "./pages/readytowatch";
import ReadyShowPage from "./pages/readyShow";

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/search">Search</Link>
          <Link to="/login">Login</Link>
          <Link to="/my-shows">My Shows</Link>
          <Link to="/airing-next">Airing Next</Link>
          <Link to="/ready-to-watch">Ready to Watch</Link>
          
        </nav>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/login" element={<Login />} />
          <Route path="/show/:id" element={<ShowDetails />} />
          <Route path="/my-shows" element={<MyShows />} />
          <Route path="/my-shows/:id" element={<MyShowDetails />} />
          <Route path="/airing-next" element={<AiringNextPage />} />
          <Route path="/ready-to-watch" element={<ReadyToWatchPage />} />
          <Route path="/ready/:id" element={<ReadyShowPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
