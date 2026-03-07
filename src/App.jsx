import { BrowserRouter, Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import Search from "./pages/Search"
import Login from "./pages/Login"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
